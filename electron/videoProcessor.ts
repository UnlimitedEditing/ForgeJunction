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
  effectiveDuration: number
  trimIn: number
  transition: 'cut' | 'crossfade' | 'fade_black'
  transitionDuration: number
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
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function runProbe(url: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
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
  // HH:MM:SS.ms
  const parts = timeStr.split(':')
  if (parts.length !== 3) return 0
  const hours = parseFloat(parts[0])
  const minutes = parseFloat(parts[1])
  const seconds = parseFloat(parts[2])
  return hours * 3600 + minutes * 60 + seconds
}

function buildFilterComplex(clips: ProbeClip[], audioTracks: AudioTrackInput[]): {
  filterComplex: string | null
  mapArgs: string[]
} {
  const N = clips.length

  // Single clip — no filter needed, direct map
  if (N === 1 && audioTracks.length === 0) {
    return { filterComplex: null, mapArgs: ['0:v', '0:a?'] }
  }

  if (N === 1) {
    // Single clip but with audio tracks — use filter for audio mixing
    const parts: string[] = []
    let curA = '0:a'
    for (let j = 0; j < audioTracks.length; j++) {
      const inputIdx = 1 + j
      const vol = audioTracks[j].volume
      parts.push(`[${inputIdx}:a]volume=${vol}[avol${j}]`)
      parts.push(`[${curA}][avol${j}]amix=inputs=2:duration=shortest[amix${j}]`)
      curA = `amix${j}`
    }
    parts.push(`[0:v]copy[vfinal]`)
    parts.push(`[${curA}]acopy[afinal]`)
    return {
      filterComplex: parts.join(';'),
      mapArgs: ['[vfinal]', '[afinal]'],
    }
  }

  const parts: string[] = []
  let curV = '0:v'
  let curA = '0:a'
  let curDuration = clips[0].effectiveDuration

  for (let i = 1; i < N; i++) {
    const clip = clips[i]
    const td = clip.transitionDuration

    if (clip.transition === 'cut') {
      parts.push(`[${curV}][${i}:v]concat=n=2:v=1:a=0[cv${i}]`)
      parts.push(`[${curA}][${i}:a]concat=n=2:v=0:a=1[ca${i}]`)
      curDuration += clip.effectiveDuration
      curV = `cv${i}`
      curA = `ca${i}`
    } else if (clip.transition === 'crossfade') {
      const offset = Math.max(0, curDuration - td)
      parts.push(`[${curV}][${i}:v]xfade=transition=fade:duration=${td}:offset=${offset}[xv${i}]`)
      parts.push(`[${curA}][${i}:a]acrossfade=d=${td}[xa${i}]`)
      curDuration = offset + clip.effectiveDuration
      curV = `xv${i}`
      curA = `xa${i}`
    } else if (clip.transition === 'fade_black') {
      const fadeStart = Math.max(0, curDuration - td)
      parts.push(`[${curV}]fade=t=out:st=${fadeStart}:d=${td}[fo${i}]`)
      parts.push(`[${i}:v]fade=t=in:st=0:d=${td}[fi${i}]`)
      parts.push(`[fo${i}][fi${i}]concat=n=2:v=1:a=0[fv${i}]`)
      parts.push(`[${curA}][${i}:a]concat=n=2:v=0:a=1[fa${i}]`)
      curDuration += clip.effectiveDuration
      curV = `fv${i}`
      curA = `fa${i}`
    }
  }

  // Mix in extra audio tracks
  for (let j = 0; j < audioTracks.length; j++) {
    const inputIdx = clips.length + j
    const vol = audioTracks[j].volume
    parts.push(`[${inputIdx}:a]volume=${vol}[avol${j}]`)
    parts.push(`[${curA}][avol${j}]amix=inputs=2:duration=shortest[amix${j}]`)
    curA = `amix${j}`
  }

  // Rename to vfinal/afinal
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
    const { clips, audioTracks, outputName, outputDir, estimatedDuration } = params
    const outputPath = join(outputDir, `${outputName}.mp4`)

    const args: string[] = []

    // Input: one per clip with trim args
    for (const clip of clips) {
      args.push('-ss', String(clip.trimIn))
      args.push('-t', String(clip.effectiveDuration))
      args.push('-i', clip.url)
    }

    // Input: audio tracks
    for (const audio of audioTracks) {
      args.push('-i', audio.url)
    }

    // Filter complex
    const { filterComplex, mapArgs } = buildFilterComplex(clips, audioTracks)

    if (filterComplex) {
      args.push('-filter_complex', filterComplex)
      for (const m of mapArgs) {
        args.push('-map', m)
      }
    } else {
      // Direct map — single clip, no audio tracks
      args.push('-map', '0:v')
      args.push('-map', '0:a?')
    }

    args.push('-c:v', 'libx264', '-preset', 'fast')
    args.push('-c:a', 'aac')
    args.push('-movflags', '+faststart')
    args.push('-y', outputPath)

    const proc = spawn(ffmpegPath, args)

    proc.stderr.on('data', (d: Buffer) => {
      const text = d.toString()
      // Parse time= lines for progress
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
        reject(new Error(`FFmpeg exited with code ${code}`))
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

    // Write metadata file
    try {
      writeMetadata(params.outputDir, params.outputName, params.clips)
    } catch (e) {
      console.error('[VideoProcessor] metadata write failed:', e)
    }

    return { outputPath }
  })
}
