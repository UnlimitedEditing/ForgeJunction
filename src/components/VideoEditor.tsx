import React, { useEffect, useRef, useState } from 'react'
import { useVideoEditorStore, type VideoClip, type ClipAnimation } from '@/stores/videoEditor'
import { useProjectsStore, type ProjectRender } from '@/stores/projects'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function basename(url: string): string {
  try { return url.split('/').pop() || url } catch { return url }
}

const TRANSITION_ICONS: Record<VideoClip['transition'], string> = {
  cut: '✂',
  crossfade: '↔',
  fade_black: '◼',
}
const TRANSITION_CYCLE: VideoClip['transition'][] = ['cut', 'crossfade', 'fade_black']

const ANIMATION_LABELS: Record<ClipAnimation, string> = {
  none: 'None',
  zoom_in: 'Zoom In',
  zoom_out: 'Zoom Out',
  pan_left: 'Pan Left',
  pan_right: 'Pan Right',
  pan_up: 'Pan Up',
  pan_down: 'Pan Down',
}

// ── ClipReferenceItem — shown in the left "Clips" tab ─────────────────────────

function ClipReferenceItem({ clip, isSelected, timelineScrollRef }: {
  clip: VideoClip
  isSelected: boolean
  timelineScrollRef: React.RefObject<HTMLDivElement | null>
}): React.ReactElement {
  const { setPreviewClip, updateClip } = useVideoEditorStore()
  const [dims, setDims] = useState<{ w: number; h: number } | null>(
    clip.width && clip.height ? { w: clip.width, h: clip.height } : null
  )

  // Probe/measure dimensions once
  useEffect(() => {
    if (dims) return
    if (clip.mediaType === 'image') {
      const img = new Image()
      img.onload = () => {
        const d = { w: img.naturalWidth, h: img.naturalHeight }
        setDims(d)
        updateClip(clip.id, { width: d.w, height: d.h })
      }
      img.src = clip.url
    } else if (window.electron?.video) {
      window.electron.video.probe(clip.url)
        .then((info: { width: number; height: number; duration: number }) => {
          setDims({ w: info.width, h: info.height })
          updateClip(clip.id, { width: info.width, height: info.height, duration: info.duration })
        })
        .catch(() => { /* leave dims null */ })
    }
  }, [clip.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelect() {
    setPreviewClip(clip.id)
    // Scroll the ClipCard into view inside the timeline
    const card = timelineScrollRef.current?.querySelector(`[data-clip-id="${clip.id}"]`)
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }

  const isImage = clip.mediaType === 'image'
  const displayDuration = isImage ? clip.imageDuration : clip.duration
  const durationStr = displayDuration > 0 ? `${displayDuration.toFixed(1)}s` : '…'
  const resStr = dims ? `${dims.w}×${dims.h}` : '—'

  return (
    <button
      onClick={handleSelect}
      className={`w-full flex gap-2 px-1.5 py-1.5 rounded text-left transition-colors ${
        isSelected ? 'bg-brand/15 ring-1 ring-brand/30' : 'hover:bg-white/5'
      }`}
    >
      {/* Thumbnail */}
      <div className="w-12 h-12 rounded overflow-hidden bg-neutral-800 flex-shrink-0 flex items-center justify-center text-white/20">
        {isImage
          ? <img src={clip.url} alt="" className="w-full h-full object-cover" />
          : <span className="text-lg">▶</span>
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <div className="flex items-center gap-1">
          <span className={`text-[8px] font-mono px-1 py-0.5 rounded leading-none flex-shrink-0 ${
            isImage ? 'bg-neutral-700/80 text-white/50' : 'bg-brand/60 text-white'
          }`}>
            {isImage ? 'IMG' : 'VID'}
          </span>
          <span className="text-[10px] text-white/50">{durationStr}</span>
          <span className="text-[10px] text-white/25">{resStr}</span>
        </div>
        <p className="text-[10px] text-white/70 font-mono truncate leading-tight" title={clip.label}>
          {clip.label || basename(clip.url)}
        </p>
        {clip.prompt && (
          <p className="text-[9px] text-white/30 leading-tight line-clamp-2" title={clip.prompt}>
            {clip.prompt}
          </p>
        )}
      </div>
    </button>
  )
}

// ── ClipCard ──────────────────────────────────────────────────────────────────

function ClipCard({ clip, index, total, isSelected }: {
  clip: VideoClip; index: number; total: number; isSelected: boolean
}): React.ReactElement {
  const { setPreviewClip, removeClip, moveClip, updateClip } = useVideoEditorStore()

  function cycleTransition() {
    const cur = TRANSITION_CYCLE.indexOf(clip.transition)
    updateClip(clip.id, { transition: TRANSITION_CYCLE[(cur + 1) % TRANSITION_CYCLE.length] })
  }

  const isImage = clip.mediaType === 'image'

  return (
    <div data-clip-id={clip.id} className="flex items-center gap-1 flex-shrink-0">
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
              min={0.1} max={2.0} step={0.1}
              onChange={(e) => updateClip(clip.id, { transitionDuration: parseFloat(e.target.value) })}
              className="w-10 text-center text-xs bg-neutral-800 border border-white/10 rounded text-white/60 px-0.5"
              title="Transition duration (s)"
            />
          )}
        </div>
      )}

      <div
        className={`relative flex flex-col w-28 rounded-lg overflow-hidden cursor-pointer border transition-colors
          ${isSelected ? 'border-brand bg-brand/10' : 'border-white/10 bg-neutral-800 hover:border-white/30'}`}
        onClick={() => setPreviewClip(clip.id)}
      >
        {/* Thumbnail */}
        <div className="h-16 bg-neutral-700 flex items-center justify-center text-white/20 text-2xl select-none overflow-hidden">
          {isImage
            ? <img src={clip.url} alt={clip.label} className="w-full h-full object-cover" />
            : '▶'
          }
        </div>

        {/* Media type badge */}
        <div className={`absolute top-1 right-1 text-[8px] font-mono px-1 py-0.5 rounded leading-none ${
          isImage ? 'bg-neutral-700/80 text-white/60' : 'bg-brand/80 text-white'
        }`}>
          {isImage ? 'IMG' : 'VID'}
        </div>

        {/* Info */}
        <div className="px-2 py-1.5">
          <p className="text-white/80 text-xs font-mono truncate" title={clip.label}>{clip.label}</p>
          <p className="text-white/40 text-xs">
            {isImage ? `${clip.imageDuration}s` : (clip.duration > 0 ? formatDuration(clip.duration) : '…')}
            {isImage && clip.animation !== 'none' && <span className="text-brand/60 ml-1">✦</span>}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-1.5 pb-1.5 gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); moveClip(clip.id, 'left') }}
            disabled={index === 0}
            className="text-white/40 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed text-xs px-1"
          >←</button>
          <button
            onClick={(e) => { e.stopPropagation(); removeClip(clip.id) }}
            className="text-red-400/60 hover:text-red-400 text-xs px-1"
          >✕</button>
          <button
            onClick={(e) => { e.stopPropagation(); moveClip(clip.id, 'right') }}
            disabled={index === total - 1}
            className="text-white/40 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed text-xs px-1"
          >→</button>
        </div>
      </div>
    </div>
  )
}

// ── MediaBrowserItem ──────────────────────────────────────────────────────────

function MediaBrowserItem({ render, onAdd }: { render: ProjectRender; onAdd: () => void }): React.ReactElement {
  const isVideo = render.mediaType === 'video'
  return (
    <button
      onClick={onAdd}
      className="w-full flex items-center gap-2 rounded px-1.5 py-1.5 hover:bg-white/5 text-left group transition-colors"
      title={`Add to timeline: ${render.workflowSlug}`}
    >
      <div className="w-8 h-8 rounded overflow-hidden bg-neutral-700 flex-shrink-0 flex items-center justify-center text-white/20 text-xs">
        {render.thumbnailUrl
          ? <img src={render.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          : (isVideo ? '▶' : '□')
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-white/60 group-hover:text-white/90 font-mono truncate transition-colors">
          {render.workflowSlug || '—'}
        </p>
        <p className="text-[9px] text-white/25">{isVideo ? 'Video' : 'Image'}</p>
      </div>
      <span className="text-white/20 group-hover:text-brand text-xs transition-colors flex-shrink-0">+</span>
    </button>
  )
}

// ── VideoEditor ───────────────────────────────────────────────────────────────

export default function VideoEditor({ onClose }: { onClose: () => void }): React.ReactElement {
  const {
    clips, audioTracks,
    exportName, exportResolution, exportFps, exportCrf, exportFormat,
    isExporting, exportProgress, exportLog,
    previewClipId,
    addAudioTrack, removeAudioTrack, updateAudioTrack,
    setExportName, setExportResolution, setExportFps, setExportCrf, setExportFormat,
    setClipDuration, appendLog, setExporting,
    updateClip, setPreviewClip,
  } = useVideoEditorStore()
  const addClipFn = useVideoEditorStore(s => s.addClip)
  const clearEditorFn = useVideoEditorStore(s => s.clearEditor)
  const activeProject = useProjectsStore(s => s.getActiveProject())

  const logEndRef = useRef<HTMLDivElement>(null)
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  const [mediaPaneDragOver, setMediaPaneDragOver] = useState(false)
  const [leftTab, setLeftTab] = useState<'library' | 'clips'>('library')

  // Switch to Clips tab automatically when the first clip lands in the timeline
  const prevClipCountRef = useRef(clips.length)
  useEffect(() => {
    if (clips.length > 0 && prevClipCountRef.current === 0) {
      setLeftTab('clips')
    }
    prevClipCountRef.current = clips.length
  }, [clips.length])

  // Drag & drop local files into media browser
  function handleMediaPaneDragOver(e: React.DragEvent) {
    e.preventDefault()
    setMediaPaneDragOver(true)
  }
  function handleMediaPaneDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setMediaPaneDragOver(false)
  }
  function handleMediaPaneDrop(e: React.DragEvent) {
    e.preventDefault()
    setMediaPaneDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')
      if (!isVideo && !isImage) continue
      // Electron exposes the native FS path on File objects — use it so that
      // ffprobe/ffmpeg in the main process can read the file directly.
      // Fall back to a blob URL only when running outside Electron (e.g. browser dev).
      const url = (file as File & { path?: string }).path ?? URL.createObjectURL(file)
      addClipFn(url, '', file.name, isVideo ? 'video' : 'image')
    }
  }

  // Subscribe to FFmpeg progress events
  useEffect(() => {
    if (!window.electron?.video) return
    const cleanup = window.electron.video.onProgress(({ percent, timeStr }: { percent: number; timeStr: string }) => {
      setExporting(true, percent)
      appendLog(timeStr)
    })
    return cleanup
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [exportLog])

  const selectedClip = previewClipId
    ? clips.find(c => c.id === previewClipId)
    : clips[0]

  const projectVideos = activeProject?.renders.filter(r => r.mediaType === 'video' && r.resultUrl) ?? []
  const projectImages = activeProject?.renders.filter(r => r.mediaType === 'image' && r.resultUrl) ?? []

  async function handleExport() {
    const state = useVideoEditorStore.getState()
    if (state.clips.length === 0) return

    for (const clip of state.clips) {
      if (clip.mediaType === 'video' && clip.duration === 0 && window.electron?.video) {
        appendLog(`Probing ${clip.label}...`)
        try {
          const info = await window.electron.video.probe(clip.url)
          setClipDuration(clip.id, info.duration)
        } catch (e) {
          appendLog(`Probe failed: ${(e as Error).message}`)
        }
      }
    }

    const currentClips = useVideoEditorStore.getState().clips
    setExporting(true, 0)
    appendLog('Starting export...')

    const outputDir = await window.electron.video.getExportDir()

    const probeClips = currentClips.map(c => ({
      url: c.url,
      mediaType: c.mediaType,
      effectiveDuration: c.mediaType === 'image' ? c.imageDuration : Math.max(0.1, c.duration - c.trimIn - c.trimOut),
      trimIn: c.trimIn,
      transition: c.transition,
      transitionDuration: c.transitionDuration,
      animation: c.animation,
      animationAmount: c.animationAmount,
      prompt: c.prompt,
      label: c.label,
    }))

    const audioInputs = state.audioTracks.map(t => ({ url: t.url, volume: t.volume }))
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
        resolution: state.exportResolution,
        fps: state.exportFps,
        crf: state.exportCrf,
        format: state.exportFormat,
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
    <div className="flex flex-col flex-1 bg-neutral-900 text-white min-w-0">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-neutral-950 flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors text-xs font-medium"
          title="Return to main view"
        >
          <span className="text-base leading-none">⌂</span>
          <span>Home</span>
        </button>
        <span className="text-white/15 text-xs">·</span>
        <span className="text-white/60 text-sm font-semibold">✂ Video Editor</span>
        {activeProject && (
          <span className="text-[10px] text-emerald-400/60 font-mono">{activeProject.name}</span>
        )}
        <div className="flex-1" />
      </div>

      {/* ── 3-column body ── */}
      <div className="flex flex-1 min-h-0">

        {/* Left — tabs: Media Library | Clips in timeline */}
        <aside
          className={`w-52 flex-shrink-0 flex flex-col border-r border-white/10 bg-neutral-950/60 min-h-0 relative transition-colors ${mediaPaneDragOver && leftTab === 'library' ? 'bg-brand/5 border-brand/30' : ''}`}
          onDragOver={leftTab === 'library' ? handleMediaPaneDragOver : undefined}
          onDragLeave={leftTab === 'library' ? handleMediaPaneDragLeave : undefined}
          onDrop={leftTab === 'library' ? handleMediaPaneDrop : undefined}
        >
          {/* Drag overlay */}
          {mediaPaneDragOver && leftTab === 'library' && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-brand/10 border-2 border-dashed border-brand/40 rounded pointer-events-none">
              <span className="text-brand text-2xl">+</span>
              <span className="text-brand text-xs font-medium">Drop to add</span>
            </div>
          )}

          {/* Tab bar */}
          <div className="flex border-b border-white/8 flex-shrink-0">
            {(['library', 'clips'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setLeftTab(tab)}
                className={`flex-1 py-2 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                  leftTab === tab
                    ? 'text-white/80 border-b-2 border-brand'
                    : 'text-white/25 hover:text-white/50'
                }`}
              >
                {tab === 'library' ? 'Library' : `Clips${clips.length > 0 ? ` (${clips.length})` : ''}`}
              </button>
            ))}
          </div>

          {/* Library tab */}
          {leftTab === 'library' && (
            <div className="flex-1 overflow-y-auto min-h-0 p-1.5">
              {!activeProject ? (
                <p className="text-[10px] text-white/20 text-center px-3 py-4 leading-relaxed">
                  Set an active project to browse its media here
                </p>
              ) : (projectVideos.length === 0 && projectImages.length === 0) ? (
                <p className="text-[10px] text-white/20 text-center px-3 py-4">
                  No renders in project yet
                </p>
              ) : (
                <>
                  {projectVideos.length > 0 && (
                    <>
                      <p className="text-[9px] text-white/20 uppercase tracking-widest px-1.5 py-1">Videos</p>
                      {projectVideos.map(r => (
                        <MediaBrowserItem
                          key={r.id}
                          render={r}
                          onAdd={() => addClipFn(r.resultUrl!, r.prompt, r.workflowSlug, 'video')}
                        />
                      ))}
                    </>
                  )}
                  {projectImages.length > 0 && (
                    <>
                      <p className="text-[9px] text-white/20 uppercase tracking-widest px-1.5 pt-2 pb-1">Images</p>
                      {projectImages.map(r => (
                        <MediaBrowserItem
                          key={r.id}
                          render={r}
                          onAdd={() => addClipFn(r.resultUrl!, r.prompt, r.workflowSlug, 'image')}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
              <p className="text-[9px] text-white/15 text-center px-2 py-2 mt-1">
                Drop files here to add
              </p>
            </div>
          )}

          {/* Clips tab — timeline references */}
          {leftTab === 'clips' && (
            <div className="flex-1 overflow-y-auto min-h-0 p-1.5 flex flex-col gap-0.5">
              {clips.length === 0 ? (
                <p className="text-[10px] text-white/20 text-center px-3 py-6">
                  No clips in timeline yet
                </p>
              ) : clips.map(clip => (
                <ClipReferenceItem
                  key={clip.id}
                  clip={clip}
                  isSelected={(previewClipId ?? clips[0]?.id) === clip.id}
                  timelineScrollRef={timelineScrollRef}
                />
              ))}
            </div>
          )}
        </aside>

        {/* Center — preview + timeline + audio */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {/* Preview */}
          <div className="flex-shrink-0 bg-black" style={{ height: '40%' }}>
            {selectedClip ? (
              selectedClip.mediaType === 'image' ? (
                <img
                  key={selectedClip.url}
                  src={selectedClip.url}
                  alt={selectedClip.label}
                  className="w-full h-full object-contain"
                />
              ) : (
                <video
                  key={selectedClip.url}
                  src={selectedClip.url}
                  controls
                  className="w-full h-full object-contain"
                />
              )
            ) : (
              <div className="flex h-full items-center justify-center text-white/20 text-sm select-none">
                Add clips from the left panel or media library
              </div>
            )}
          </div>

          {/* Video track */}
          <div className="flex-shrink-0 border-t border-white/10 px-4 py-3">
            <p className="text-xs text-white/30 uppercase tracking-widest font-semibold mb-2">Video Track</p>
            <div ref={timelineScrollRef} className="flex items-start gap-2 overflow-x-auto pb-2">
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
                  Click + on a media item in the left panel, or use the ▶ button on a render tile
                </p>
              )}
            </div>
          </div>

          {/* Audio tracks */}
          <div className="flex-shrink-0 border-t border-white/10 px-4 py-3">
            <p className="text-xs text-white/30 uppercase tracking-widest font-semibold mb-2">Audio Tracks</p>
            <div className="flex flex-col gap-1.5">
              {audioTracks.map(track => (
                <div key={track.id} className="flex items-center gap-2">
                  <span className="text-white/60 text-xs font-mono truncate w-32" title={track.label}>{track.label}</span>
                  <input
                    type="range" min={0} max={1} step={0.01} value={track.volume}
                    onChange={e => updateAudioTrack(track.id, { volume: parseFloat(e.target.value) })}
                    className="flex-1 accent-brand"
                    title={`Volume: ${Math.round(track.volume * 100)}%`}
                  />
                  <span className="text-white/30 text-xs w-8 text-right">{Math.round(track.volume * 100)}%</span>
                  <button onClick={() => removeAudioTrack(track.id)} className="text-red-400/60 hover:text-red-400 text-xs">✕</button>
                </div>
              ))}
              <button onClick={handleAddAudio} className="text-brand hover:text-brand/70 text-xs self-start transition-colors mt-1">
                + Add audio track
              </button>
            </div>
          </div>
        </div>

        {/* Right — clip config + export settings */}
        <aside className="w-60 flex-shrink-0 flex flex-col border-l border-white/10 bg-neutral-950/60 overflow-y-auto min-h-0">

          {/* Image clip config — shown when an image clip is selected */}
          {selectedClip?.mediaType === 'image' && (
            <div className="p-3 border-b border-white/8 flex flex-col gap-2.5">
              <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">Image Clip</p>

              <div className="flex items-center gap-2">
                <label className="text-[10px] text-white/40 w-16 flex-shrink-0">Duration</label>
                <input
                  type="number"
                  value={selectedClip.imageDuration}
                  min={0.5} max={30} step={0.5}
                  onChange={e => updateClip(selectedClip.id, { imageDuration: parseFloat(e.target.value) })}
                  className="w-16 rounded bg-neutral-800 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-brand/60"
                />
                <span className="text-[10px] text-white/30">sec</span>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[10px] text-white/40 w-16 flex-shrink-0">Animation</label>
                <select
                  value={selectedClip.animation}
                  onChange={e => updateClip(selectedClip.id, { animation: e.target.value as ClipAnimation })}
                  className="flex-1 rounded bg-neutral-800 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-brand/60"
                >
                  {(Object.keys(ANIMATION_LABELS) as ClipAnimation[]).map(k => (
                    <option key={k} value={k}>{ANIMATION_LABELS[k]}</option>
                  ))}
                </select>
              </div>

              {selectedClip.animation !== 'none' && (
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-white/40 w-16 flex-shrink-0">Amount</label>
                  <input
                    type="range" min={5} max={50} value={selectedClip.animationAmount}
                    onChange={e => updateClip(selectedClip.id, { animationAmount: parseInt(e.target.value) })}
                    className="flex-1 accent-brand"
                  />
                  <span className="text-[10px] text-white/30 w-8 text-right">{selectedClip.animationAmount}%</span>
                </div>
              )}
            </div>
          )}

          {/* Export config */}
          <div className="p-3 flex flex-col gap-3 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">Export</p>

            {/* Output name */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-white/40">Output Name</label>
              <input
                type="text"
                value={exportName}
                onChange={e => setExportName(e.target.value)}
                className="w-full rounded bg-neutral-800 border border-white/10 px-2 py-1.5 text-xs text-white outline-none focus:border-brand/60 transition-colors"
              />
            </div>

            {/* Resolution */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-white/40">Resolution</label>
              <select
                value={exportResolution}
                onChange={e => setExportResolution(e.target.value)}
                className="w-full rounded bg-neutral-800 border border-white/10 px-2 py-1.5 text-xs text-white outline-none focus:border-brand/60"
              >
                <optgroup label="Landscape">
                  <option value="3840x2160">3840×2160 (4K)</option>
                  <option value="1920x1080">1920×1080 (1080p)</option>
                  <option value="1280x720">1280×720 (720p)</option>
                  <option value="854x480">854×480 (480p)</option>
                </optgroup>
                <optgroup label="Portrait">
                  <option value="2160x3840">2160×3840 (4K)</option>
                  <option value="1080x1920">1080×1920 (9:16)</option>
                  <option value="720x1280">720×1280 (9:16)</option>
                  <option value="480x854">480×854</option>
                </optgroup>
                <optgroup label="Square">
                  <option value="2160x2160">2160×2160 (4K)</option>
                  <option value="1080x1080">1080×1080 (1:1)</option>
                  <option value="720x720">720×720 (1:1)</option>
                </optgroup>
              </select>
            </div>

            {/* FPS */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-white/40">Frame Rate</label>
              <div className="flex gap-1">
                {[24, 30, 60].map(fps => (
                  <button
                    key={fps}
                    onClick={() => setExportFps(fps)}
                    className={`flex-1 rounded py-1 text-xs transition-colors ${
                      exportFps === fps
                        ? 'bg-brand/25 border border-brand/40 text-brand'
                        : 'bg-neutral-800 border border-white/10 text-white/50 hover:text-white/80'
                    }`}
                  >
                    {fps}fps
                  </button>
                ))}
              </div>
            </div>

            {/* Quality */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-white/40">Quality — CRF {exportCrf} <span className="text-white/20">(lower = better)</span></label>
              <input
                type="range" min={15} max={35} value={exportCrf}
                onChange={e => setExportCrf(parseInt(e.target.value))}
                className="w-full accent-brand"
              />
              <div className="flex justify-between text-[9px] text-white/20">
                <span>Best</span><span>Smallest</span>
              </div>
            </div>

            {/* Format */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-white/40">Format</label>
              <div className="flex gap-1">
                {(['mp4', 'webm'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setExportFormat(fmt)}
                    className={`flex-1 rounded py-1 text-xs transition-colors ${
                      exportFormat === fmt
                        ? 'bg-brand/25 border border-brand/40 text-brand'
                        : 'bg-neutral-800 border border-white/10 text-white/50 hover:text-white/80'
                    }`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Export button */}
            <button
              onClick={handleExport}
              disabled={isExporting || clips.length === 0}
              className="w-full flex items-center justify-center gap-1.5 bg-brand hover:bg-brand/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-3 py-2 rounded transition-colors mt-1"
            >
              {isExporting ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {exportProgress}%
                </>
              ) : '▶ Export'}
            </button>

            {/* Export log */}
            {exportLog.length > 0 && (
              <div className="rounded bg-black/30 p-2 font-mono text-[10px] text-white/40 space-y-0.5 max-h-24 overflow-y-auto">
                {lastFiveLog.map((line, i) => <p key={i}>{line}</p>)}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
