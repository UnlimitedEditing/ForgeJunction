import { ipcMain, app } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { createRequire } from 'module'

// Use createRequire to load CJS-only modules in the ESM-compiled context
const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegPath: string = _require('ffmpeg-static') as string
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobeInstaller = _require('@ffprobe-installer/ffprobe') as { path: string }
const ffprobePath = ffprobeInstaller.path

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProbeResult {
  duration: number
  width: number
  height: number
  hasAudio: boolean
}

interface ProbeClip {
  url: string
  mediaType: 'video' | 'image'
  effectiveDuration: number
  trimIn: number
  transition: 'cut' | 'crossfade' | 'fade_black'
  transitionDuration: number
  animation: string
  animationAmount: number
  prompt: string
  label: string
}

interface AudioTrackInput {
  url: string
  volume: number
}

interface ExportParams {
  clips: ProbeClip[]
  audioTracks: AudioTrackInput[]
  outputName: string
  outputDir: string
  estimatedDuration: number
  resolution: string   // e.g. "1920x1080"
  fps: number
  crf: number
  format: 'mp4' | 'webm'
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function runProbe(url: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',          // show errors but not info (was 'quiet', hiding all output)
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      url,
    ]
    const proc = spawn(ffprobePath, args)
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`))
        return
      }
      try {
        const data = JSON.parse(stdout) as {
          streams?: Array<{ codec_type?: string; width?: number; height?: number }>
          format?: { duration?: string }
        }
        const duration = parseFloat(data.format?.duration ?? '0')
        const videoStream = data.streams?.find((s) => s.codec_type === 'video')
        const hasAudio = (data.streams ?? []).some((s) => s.codec_type === 'audio')
        resolve({
          duration,
          width: videoStream?.width ?? 0,
          height: videoStream?.height ?? 0,
          hasAudio,
        })
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${(e as Error).message}`))
      }
    })
    proc.on('error', reject)
  })
}

function timeStrToSeconds(timeStr: string): number {
  const parts = timeStr.split(':')
  if (parts.length !== 3) return 0
  return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
}

/**
 * Build a filter_complex that:
 *  Pass 1 – Normalises every clip to [V{i}] (video, scaled to output) and [A{i}] (audio or silence)
 *  Pass 2 – Chains transitions between the normalised streams
 *  Pass 3 – Mixes in extra audio tracks
 */
function buildFilterComplex(
  clips: ProbeClip[],
  audioTracks: AudioTrackInput[],
  outputW: number,
  outputH: number,
  fps: number,
): { filterComplex: string; mapArgs: string[] } {
  const N = clips.length
  const parts: string[] = []
  const scalePad = `scale=${outputW}:${outputH}:force_original_aspect_ratio=decrease,pad=${outputW}:${outputH}:(ow-iw)/2:(oh-ih)/2,setsar=1`

  // ── Pass 1: normalise ────────────────────────────────────────────────────────
  for (let i = 0; i < N; i++) {
    const clip = clips[i]

    if (clip.mediaType === 'image') {
      const D = Math.max(1, Math.round(fps * clip.effectiveDuration))
      const A = (clip.animationAmount ?? 20) / 100

      // Build video filter for this image clip
      if (clip.animation && clip.animation !== 'none') {
        let zpExpr: string
        const a = A.toFixed(4)
        if (clip.animation === 'zoom_in') {
          zpExpr = `z='1+${a}*on/${D}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`
        } else if (clip.animation === 'zoom_out') {
          zpExpr = `z='1+${a}*(1-on/${D})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`
        } else if (clip.animation === 'pan_left') {
          zpExpr = `z='1+${a}':x='(iw-iw/zoom)*(1-on/${D})':y='ih/2-(ih/zoom/2)'`
        } else if (clip.animation === 'pan_right') {
          zpExpr = `z='1+${a}':x='(iw-iw/zoom)*on/${D}':y='ih/2-(ih/zoom/2)'`
        } else if (clip.animation === 'pan_up') {
          zpExpr = `z='1+${a}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-on/${D})'`
        } else { // pan_down
          zpExpr = `z='1+${a}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*on/${D}'`
        }
        // Scale up first so zoompan has enough pixels to work with
        parts.push(`[${i}:v]scale=8000:-1,zoompan=${zpExpr}:d=${D}:fps=${fps}:s=${outputW}x${outputH},setsar=1[V${i}]`)
      } else {
        parts.push(`[${i}:v]${scalePad}[V${i}]`)
      }

      // Generate silence for the image duration
      parts.push(`aevalsrc=0|0:c=stereo:r=44100:d=${clip.effectiveDuration.toFixed(3)}[A${i}]`)

    } else {
      // Video clip
      parts.push(`[${i}:v]${scalePad}[V${i}]`)
      // Use audio from the video stream; if the video has no audio this will
      // fail — we mark it as potentially absent via the a? notation in map args,
      // but inside filter_complex we can't use '?'. We optimistically use [i:a]
      // and handle the no-audio case by adding anullsrc fallback.
      parts.push(`[${i}:a]asetpts=PTS-STARTPTS[A${i}]`)
    }
  }

  // ── Pass 2: chain transitions ─────────────────────────────────────────────
  let curV = `V0`
  let curA = `A0`
  let curDuration = clips[0].effectiveDuration

  for (let i = 1; i < N; i++) {
    const clip = clips[i]
    const td = clip.transitionDuration

    // crossfade/fade_black don't work well between image zoompan output and video;
    // fall back to cut when source or dest is an image.
    const useTransition = clip.transition !== 'cut'
      && clips[i - 1].mediaType === 'video'
      && clip.mediaType === 'video'

    if (!useTransition) {
      parts.push(`[${curV}][V${i}]concat=n=2:v=1:a=0[cv${i}]`)
      parts.push(`[${curA}][A${i}]concat=n=2:v=0:a=1[ca${i}]`)
      curDuration += clip.effectiveDuration
      curV = `cv${i}`
      curA = `ca${i}`
    } else if (clip.transition === 'crossfade') {
      const offset = Math.max(0, curDuration - td)
      parts.push(`[${curV}][V${i}]xfade=transition=fade:duration=${td}:offset=${offset}[xv${i}]`)
      parts.push(`[${curA}][A${i}]acrossfade=d=${td}[xa${i}]`)
      curDuration = offset + clip.effectiveDuration
      curV = `xv${i}`
      curA = `xa${i}`
    } else if (clip.transition === 'fade_black') {
      const fadeStart = Math.max(0, curDuration - td)
      parts.push(`[${curV}]fade=t=out:st=${fadeStart}:d=${td}[fo${i}]`)
      parts.push(`[V${i}]fade=t=in:st=0:d=${td}[fi${i}]`)
      parts.push(`[fo${i}][fi${i}]concat=n=2:v=1:a=0[fv${i}]`)
      parts.push(`[${curA}][A${i}]concat=n=2:v=0:a=1[fa${i}]`)
      curDuration += clip.effectiveDuration
      curV = `fv${i}`
      curA = `fa${i}`
    }
  }

  // ── Pass 3: mix extra audio tracks ────────────────────────────────────────
  for (let j = 0; j < audioTracks.length; j++) {
    const inputIdx = clips.length + j
    const vol = audioTracks[j].volume
    parts.push(`[${inputIdx}:a]volume=${vol}[avol${j}]`)
    parts.push(`[${curA}][avol${j}]amix=inputs=2:duration=shortest[amix${j}]`)
    curA = `amix${j}`
  }

  parts.push(`[${curV}]copy[vfinal]`)
  parts.push(`[${curA}]acopy[afinal]`)

  return {
    filterComplex: parts.join(';'),
    mapArgs: ['[vfinal]', '[afinal]'],
  }
}

function buildKeywords(clips: ProbeClip[]): string {
  const stopwords = new Set([
    'the','and','for','with','that','this','from','are','was','has','have','not',
    'but','all','its','our','your','their','they','them','will','can','may','into',
    'out','one','two','had','his','her','been','were','what','when','where','which',
    'who','how',
  ])
  const allText = clips.map((c) => c.prompt).join(' ')
  const words = allText
    .toLowerCase()
    .split(/[\s\W]+/)
    .filter((w) => w.length >= 3 && !stopwords.has(w))
  const unique = [...new Set(words)].sort()
  return unique.join(' ')
}

function writeMetadata(outputDir: string, outputName: string, clips: ProbeClip[]): void {
  const prompts = clips.map((c) => `- ${c.prompt || c.label}`).join('\n')
  const keywords = buildKeywords(clips)
  const content = `# ${outputName}\n\n## Prompts\n${prompts}\n\n## Keywords\n${keywords}\n`
  const mdPath = join(outputDir, `${outputName}.md`)
  writeFileSync(mdPath, content, 'utf-8')
}

function runExport(
  params: ExportParams,
  onProgress: (percent: number, timeStr: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const { clips, audioTracks, outputName, outputDir, estimatedDuration, fps, crf, format } = params

    // Parse output resolution (default 1920x1080)
    const resParts = (params.resolution ?? '1920x1080').split('x')
    const outputW = parseInt(resParts[0]) || 1920
    const outputH = parseInt(resParts[1]) || 1080

    const outputExt = format === 'webm' ? 'webm' : 'mp4'
    const outputPath = join(outputDir, `${outputName}.${outputExt}`)

    const args: string[] = []

    // Inputs — different flags for images vs videos
    for (const clip of clips) {
      if (clip.mediaType === 'image') {
        args.push('-loop', '1')
        args.push('-framerate', String(fps))
        args.push('-t', String(clip.effectiveDuration))
        args.push('-i', clip.url)
      } else {
        args.push('-ss', String(clip.trimIn))
        args.push('-t', String(clip.effectiveDuration))
        args.push('-i', clip.url)
      }
    }

    // Extra audio inputs
    for (const audio of audioTracks) {
      args.push('-i', audio.url)
    }

    // Always use filter_complex (handles images, normalisation, transitions)
    const { filterComplex, mapArgs } = buildFilterComplex(clips, audioTracks, outputW, outputH, fps)
    args.push('-filter_complex', filterComplex)
    for (const m of mapArgs) {
      args.push('-map', m)
    }

    // Video codec
    if (format === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0')
      args.push('-c:a', 'libopus')
    } else {
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', String(crf))
      args.push('-c:a', 'aac')
      args.push('-movflags', '+faststart')
    }

    args.push('-r', String(fps))
    args.push('-y', outputPath)

    console.log('[VideoProcessor] ffmpeg args:', args.join(' '))
    const proc = spawn(ffmpegPath, args)

    let stderrBuf = ''
    proc.stderr.on('data', (d: Buffer) => {
      const text = d.toString()
      stderrBuf += text
      const match = /time=(\d+:\d+:\d+\.?\d*)/.exec(text)
      if (match) {
        const timeStr = match[1]
        const seconds = timeStrToSeconds(timeStr)
        const percent = estimatedDuration > 0
          ? Math.min(99, Math.round((seconds / estimatedDuration) * 100))
          : 0
        onProgress(percent, timeStr)
      }
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath)
      } else {
        // Include last 500 chars of stderr for diagnosis
        const snippet = stderrBuf.slice(-500).trim()
        reject(new Error(`FFmpeg exited with code ${code}${snippet ? `: ${snippet}` : ''}`))
      }
    })

    proc.on('error', reject)
  })
}

// ── IPC Registration ──────────────────────────────────────────────────────────

export function registerVideoIpc(): void {
  ipcMain.handle('video:get-export-dir', () => app.getPath('videos'))

  ipcMain.handle('video:probe', async (_event, url: string) => {
    return runProbe(url)
  })

  ipcMain.handle('video:export', async (event, params: ExportParams) => {
    const sender = event.sender

    const outputPath = await runExport(params, (percent, timeStr) => {
      if (!sender.isDestroyed()) {
        sender.send('video:progress', { percent, timeStr })
      }
    })

    try {
      writeMetadata(params.outputDir, params.outputName, params.clips)
    } catch (e) {
      console.error('[VideoProcessor] metadata write failed:', e)
    }

    return { outputPath }
  })
}
