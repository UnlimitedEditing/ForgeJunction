import React, { useEffect, useRef } from 'react'
import { useVideoEditorStore, type VideoClip } from '@/stores/videoEditor'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function basename(url: string): string {
  try {
    const parts = url.split('/')
    return parts[parts.length - 1] || url
  } catch {
    return url
  }
}

const TRANSITION_ICONS: Record<VideoClip['transition'], string> = {
  cut: '✂',
  crossfade: '↔',
  fade_black: '◼',
}

const TRANSITION_CYCLE: VideoClip['transition'][] = ['cut', 'crossfade', 'fade_black']

// ── ClipCard ──────────────────────────────────────────────────────────────────

function ClipCard({
  clip,
  index,
  total,
  isSelected,
}: {
  clip: VideoClip
  index: number
  total: number
  isSelected: boolean
}): React.ReactElement {
  const { setPreviewClip, removeClip, moveClip, updateClip } = useVideoEditorStore()

  function cycleTransition() {
    const cur = TRANSITION_CYCLE.indexOf(clip.transition)
    const next = TRANSITION_CYCLE[(cur + 1) % TRANSITION_CYCLE.length]
    updateClip(clip.id, { transition: next })
  }

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {/* Transition picker (before clip, not shown for first clip) */}
      {index > 0 && (
        <div className="flex flex-col items-center gap-0.5 mr-1">
          <button
            onClick={cycleTransition}
            className="w-7 h-7 rounded bg-neutral-700 hover:bg-neutral-600 text-white/70 hover:text-white text-sm transition-colors"
            title={`Transition: ${clip.transition} (click to cycle)`}
          >
            {TRANSITION_ICONS[clip.transition]}
          </button>
          {clip.transition !== 'cut' && (
            <input
              type="number"
              value={clip.transitionDuration}
              min={0.1}
              max={2.0}
              step={0.1}
              onChange={(e) => updateClip(clip.id, { transitionDuration: parseFloat(e.target.value) })}
              className="w-10 text-center text-xs bg-neutral-800 border border-white/10 rounded text-white/60 px-0.5"
              title="Transition duration (s)"
            />
          )}
        </div>
      )}

      {/* Card */}
      <div
        className={`relative flex flex-col w-28 rounded-lg overflow-hidden cursor-pointer border transition-colors
          ${isSelected
            ? 'border-brand bg-brand/10'
            : 'border-white/10 bg-neutral-800 hover:border-white/30'
          }`}
        onClick={() => setPreviewClip(clip.id)}
      >
        {/* Thumbnail placeholder */}
        <div className="h-16 bg-neutral-700 flex items-center justify-center text-white/20 text-2xl select-none">
          ▶
        </div>

        {/* Info */}
        <div className="px-2 py-1.5">
          <p className="text-white/80 text-xs font-mono truncate" title={clip.label}>
            {clip.label}
          </p>
          <p className="text-white/40 text-xs">
            {clip.duration > 0 ? formatDuration(clip.duration) : '…'}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-1.5 pb-1.5 gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); moveClip(clip.id, 'left') }}
            disabled={index === 0}
            className="text-white/40 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed text-xs px-1"
            title="Move left"
          >
            ←
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); removeClip(clip.id) }}
            className="text-red-400/60 hover:text-red-400 text-xs px-1"
            title="Remove clip"
          >
            ✕
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); moveClip(clip.id, 'right') }}
            disabled={index === total - 1}
            className="text-white/40 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed text-xs px-1"
            title="Move right"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── VideoEditor ───────────────────────────────────────────────────────────────

export default function VideoEditor({ onClose }: { onClose: () => void }): React.ReactElement {
  const {
    clips,
    audioTracks,
    exportName,
    isExporting,
    exportProgress,
    exportLog,
    previewClipId,
    addAudioTrack,
    removeAudioTrack,
    updateAudioTrack,
    setExportName,
    setClipDuration,
    appendLog,
    setExporting,
  } = useVideoEditorStore()

  const logEndRef = useRef<HTMLDivElement>(null)

  // Subscribe to progress events from main process
  useEffect(() => {
    if (!window.electron?.video) return
    const cleanup = window.electron.video.onProgress(({ percent, timeStr }) => {
      setExporting(true, percent)
      appendLog(timeStr)
    })
    return cleanup
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [exportLog])

  // Determine preview URL
  const selectedClip = previewClipId
    ? clips.find((c) => c.id === previewClipId)
    : clips[0]

  async function handleExport() {
    const state = useVideoEditorStore.getState()
    if (state.clips.length === 0) return

    // Probe any clips with duration === 0
    for (const clip of state.clips) {
      if (clip.duration === 0 && window.electron?.video) {
        appendLog(`Probing ${clip.label}...`)
        try {
          const info = await window.electron.video.probe(clip.url)
          setClipDuration(clip.id, info.duration)
        } catch (e) {
          appendLog(`Probe failed for ${clip.label}: ${(e as Error).message}`)
        }
      }
    }

    const currentClips = useVideoEditorStore.getState().clips

    setExporting(true, 0)
    appendLog('Starting export...')

    const outputDir = await window.electron.video.getExportDir()

    const probeClips = currentClips.map((c) => ({
      url: c.url,
      effectiveDuration: Math.max(0.1, c.duration - c.trimIn - c.trimOut),
      trimIn: c.trimIn,
      transition: c.transition,
      transitionDuration: c.transitionDuration,
      prompt: c.prompt,
      label: c.label,
    }))

    const audioInputs = state.audioTracks.map((t) => ({ url: t.url, volume: t.volume }))

    const estimatedDuration = probeClips.reduce((acc, c, i) => {
      if (i === 0) return c.effectiveDuration
      if (c.transition === 'crossfade') return acc + c.effectiveDuration - c.transitionDuration
      return acc + c.effectiveDuration
    }, 0)

    try {
      const result = await window.electron.video.export({
        clips: probeClips,
        audioTracks: audioInputs,
        outputName: state.exportName,
        outputDir,
        estimatedDuration,
      })
      appendLog(`Exported: ${result.outputPath}`)
      window.electron?.openExternal('file://' + result.outputPath)
    } catch (e) {
      appendLog(`Error: ${(e as Error).message}`)
    } finally {
      setExporting(false, 0)
    }
  }

  function handleAddAudio() {
    const url = window.prompt('Audio URL:')
    if (!url) return
    addAudioTrack(url, basename(url))
  }

  const lastFiveLog = exportLog.slice(-5)

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-neutral-950 flex-shrink-0">
        <span className="text-white/60 text-sm font-semibold">✂ Video Editor</span>
        <input
          type="text"
          value={exportName}
          onChange={(e) => setExportName(e.target.value)}
          className="flex-1 max-w-48 bg-neutral-800 border border-white/10 rounded px-2 py-1 text-sm text-white/80
            focus:outline-none focus:border-brand/60 transition-colors"
          placeholder="Output name"
        />
        <button
          onClick={handleExport}
          disabled={isExporting || clips.length === 0}
          className="flex items-center gap-1.5 bg-brand hover:bg-brand/80 disabled:opacity-50 disabled:cursor-not-allowed
            text-white text-sm font-medium px-3 py-1.5 rounded transition-colors"
        >
          {isExporting ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {exportProgress}%
            </>
          ) : (
            'Export'
          )}
        </button>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white transition-colors ml-auto text-lg leading-none"
          title="Close Video Editor"
        >
          ✕
        </button>
      </div>

      {/* Preview */}
      <div className="flex-shrink-0" style={{ height: '40%' }}>
        {selectedClip ? (
          <video
            key={selectedClip.url}
            src={selectedClip.url}
            controls
            className="w-full h-full object-contain bg-black"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-black text-white/25 text-sm select-none">
            No clips — send videos from the media library
          </div>
        )}
      </div>

      {/* Video track */}
      <div className="flex-shrink-0 border-t border-white/10 px-4 py-3">
        <p className="text-xs text-white/30 uppercase tracking-widest font-semibold mb-2">
          Video Track
        </p>
        <div className="flex items-start gap-2 overflow-x-auto pb-2">
          {clips.map((clip, i) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              index={i}
              total={clips.length}
              isSelected={(previewClipId ?? clips[0]?.id) === clip.id}
            />
          ))}
          {clips.length === 0 && (
            <p className="text-white/20 text-sm py-4">
              + Add clip from library using the ▶ Editor button on a video tile
            </p>
          )}
        </div>
      </div>

      {/* Audio tracks */}
      <div className="flex-shrink-0 border-t border-white/10 px-4 py-3">
        <p className="text-xs text-white/30 uppercase tracking-widest font-semibold mb-2">
          Audio Tracks
        </p>
        <div className="flex flex-col gap-1.5">
          {audioTracks.map((track) => (
            <div key={track.id} className="flex items-center gap-2">
              <span className="text-white/60 text-xs font-mono truncate w-40" title={track.label}>
                {track.label}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={track.volume}
                onChange={(e) => updateAudioTrack(track.id, { volume: parseFloat(e.target.value) })}
                className="flex-1 accent-brand"
                title={`Volume: ${Math.round(track.volume * 100)}%`}
              />
              <span className="text-white/30 text-xs w-8 text-right">
                {Math.round(track.volume * 100)}%
              </span>
              <button
                onClick={() => removeAudioTrack(track.id)}
                className="text-red-400/60 hover:text-red-400 text-xs"
                title="Remove audio track"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={handleAddAudio}
            className="text-brand hover:text-brand/70 text-xs self-start transition-colors mt-1"
          >
            + Add audio track
          </button>
        </div>
      </div>

      {/* Export log */}
      {exportLog.length > 0 && (
        <div className="flex-1 border-t border-white/10 px-4 py-2 overflow-y-auto bg-black/20 min-h-0">
          <p className="text-xs text-white/20 uppercase tracking-widest font-semibold mb-1">
            Export Log
          </p>
          <div className="font-mono text-xs text-white/50 space-y-0.5">
            {lastFiveLog.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  )
}
