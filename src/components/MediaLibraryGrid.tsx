import React, { useEffect, useRef, useState } from 'react'
import { useRenderQueueStore, type QueuedRender } from '@/stores/renderQueue'
import { useSourceMediaStore } from '@/stores/sourceMedia'
import { useVideoEditorStore } from '@/stores/videoEditor'

// ── Video tile — scrubs on mousemove via canvas snapshot ──────────────────────

function VideoTile({ src, className }: { src: string; className?: string }): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

  function drawFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = video.videoWidth || canvas.offsetWidth
    canvas.height = video.videoHeight || canvas.offsetHeight
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const video = videoRef.current
    if (!video || !video.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    video.currentTime = ratio * video.duration
  }

  function handleMouseLeave() {
    const video = videoRef.current
    if (video) video.currentTime = 0
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    function onSeeked() { drawFrame() }
    function onLoaded() { setReady(true); drawFrame() }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('loadeddata', onLoaded)
    return () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('loadeddata', onLoaded)
    }
  }, [src])

  return (
    <div className={className} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        muted
        playsInline
        className="absolute invisible w-0 h-0"
      />
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-cover ${ready ? '' : 'opacity-0'}`}
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
          <span className="text-white/20 text-2xl">▶</span>
        </div>
      )}
    </div>
  )
}

// ── Individual tile ────────────────────────────────────────────────────────────

function MediaTile({
  render,
  sourceSelected,
  batchSelected,
  batchIndex,
  onClick,
}: {
  render: QueuedRender
  sourceSelected: boolean
  batchSelected: boolean
  batchIndex: number   // 0 = not in batch; >0 = order within batch
  onClick: (e: React.MouseEvent) => void
}): React.ReactElement {
  const isVideo = render.mediaType === 'video'
  const thumb = render.thumbnailUrl ?? render.resultUrl ?? null

  const ringClass = batchSelected
    ? 'ring-2 ring-orange-400 ring-offset-2 ring-offset-neutral-900'
    : sourceSelected
      ? 'ring-2 ring-brand ring-offset-2 ring-offset-neutral-900'
      : 'ring-1 ring-white/10 hover:ring-white/30'

  return (
    <div
      className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group ${ringClass}`}
      onClick={onClick}
    >
      {/* Media */}
      {isVideo && render.resultUrl ? (
        <VideoTile src={render.resultUrl} className="absolute inset-0 w-full h-full bg-neutral-800" />
      ) : thumb ? (
        <img
          src={thumb}
          alt={render.workflowSlug}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
          <span className="text-white/20 text-3xl">{isVideo ? '▶' : '🖼'}</span>
        </div>
      )}

      {/* Bottom overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5
        translate-y-full group-hover:translate-y-0 transition-transform duration-150">
        <p className="text-white/80 text-xs font-mono truncate">{render.workflowSlug}</p>
      </div>

      {/* Batch selection badge (top-left) */}
      {batchSelected && (
        <div className="absolute top-1.5 left-1.5 rounded bg-orange-500 px-1.5 py-0.5 text-xs text-white font-bold leading-none">
          {batchIndex}
        </div>
      )}

      {/* Source badge (top-right) */}
      {sourceSelected && !batchSelected && (
        <div className="absolute top-1.5 right-1.5 rounded bg-brand px-1.5 py-0.5 text-xs text-white font-medium leading-none">
          ✓ Source
        </div>
      )}
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState(): React.ReactElement {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center select-none">
        <svg
          className="mx-auto mb-4 opacity-10"
          width="80" height="80" viewBox="0 0 80 80"
          fill="none" xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="2" y="2" width="34" height="34" rx="4" stroke="white" strokeWidth="1.5"/>
          <rect x="44" y="2" width="34" height="34" rx="4" stroke="white" strokeWidth="1.5"/>
          <rect x="2" y="44" width="34" height="34" rx="4" stroke="white" strokeWidth="1.5"/>
          <rect x="44" y="44" width="34" height="34" rx="4" stroke="white" strokeWidth="1.5"/>
        </svg>
        <p className="text-white/25 text-sm">Your renders will appear here</p>
      </div>
    </div>
  )
}

// ── MediaLibraryGrid ───────────────────────────────────────────────────────────

export default function MediaLibraryGrid(): React.ReactElement {
  const { queue } = useRenderQueueStore()
  const { setFromRender } = useSourceMediaStore()
  const { addClip } = useVideoEditorStore()

  // Single source selection (for prompt/workflow input)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Ordered batch selection for video editor (preserves send order)
  const [batchIds, setBatchIds] = useState<string[]>([])
  const lastClickedIdxRef = useRef<number | null>(null)

  const completed = [...queue]
    .filter((r) => r.status === 'done' && (r.resultUrl || r.thumbnailUrl))
    .reverse()

  // Clear batch on Escape; clear source selection too
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setBatchIds([])
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function handleTileClick(render: QueuedRender, idx: number, e: React.MouseEvent) {
    // ── Ctrl / Cmd click: toggle item in batch ───────────────────────────────
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setBatchIds(prev =>
        prev.includes(render.id)
          ? prev.filter(id => id !== render.id)
          : [...prev, render.id]
      )
      lastClickedIdxRef.current = idx
      return
    }

    // ── Shift click: range select from last click into batch ─────────────────
    if (e.shiftKey && lastClickedIdxRef.current !== null) {
      e.preventDefault()
      const from = Math.min(lastClickedIdxRef.current, idx)
      const to   = Math.max(lastClickedIdxRef.current, idx)
      const rangeIds = completed.slice(from, to + 1).map(r => r.id)
      setBatchIds(prev => {
        const merged = [...prev]
        for (const id of rangeIds) {
          if (!merged.includes(id)) merged.push(id)
        }
        return merged
      })
      lastClickedIdxRef.current = idx
      return
    }

    // ── Regular click: single source selection, clear batch ─────────────────
    setBatchIds([])
    lastClickedIdxRef.current = idx

    if (selectedId === render.id) {
      setSelectedId(null)
      return
    }
    setSelectedId(render.id)
    if (render.resultUrl) {
      setFromRender(render.resultUrl, render.mediaType ?? 'image')
    }
  }

  function sendBatchToEditor() {
    const videos = batchIds
      .map(id => completed.find(r => r.id === id))
      .filter((r): r is QueuedRender => !!r && r.mediaType === 'video' && !!r.resultUrl)
    for (const r of videos) {
      addClip(r.resultUrl!, r.prompt ?? '', r.workflowSlug)
    }
    setBatchIds([])
  }

  const batchVideoCount = batchIds
    .map(id => completed.find(r => r.id === id))
    .filter((r): r is QueuedRender => !!r && r.mediaType === 'video' && !!r.resultUrl)
    .length

  if (completed.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <EmptyState />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Batch action bar ── */}
      {batchIds.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-orange-950/60 border-b border-orange-500/20 flex-shrink-0">
          <span className="text-xs text-orange-300/80">
            {batchIds.length} selected
            {batchVideoCount > 0 && batchVideoCount < batchIds.length
              ? ` · ${batchVideoCount} video${batchVideoCount !== 1 ? 's' : ''}`
              : ''}
          </span>
          <div className="flex-1" />
          {batchVideoCount > 0 && (
            <button
              onClick={sendBatchToEditor}
              className="rounded px-2.5 py-1 text-xs bg-orange-500/20 border border-orange-500/40 text-orange-300 hover:bg-orange-500/30 hover:text-orange-200 transition-colors"
            >
              ▶ Send {batchVideoCount} clip{batchVideoCount !== 1 ? 's' : ''} to Video Editor
            </button>
          )}
          {batchVideoCount === 0 && (
            <span className="text-xs text-orange-300/40 italic">No videos in selection</span>
          )}
          <button
            onClick={() => setBatchIds([])}
            className="text-orange-300/40 hover:text-orange-300/70 text-xs transition-colors"
            title="Clear selection"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Grid ── */}
      <div className="flex-1 overflow-y-auto p-3">
        {batchIds.length === 0 && (
          <p className="text-white/15 text-xs mb-2 select-none">
            Ctrl+click or Shift+click to select multiple for batch export
          </p>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {completed.map((render, idx) => {
            const batchIdx = batchIds.indexOf(render.id)
            return (
              <MediaTile
                key={render.id}
                render={render}
                sourceSelected={render.id === selectedId}
                batchSelected={batchIdx !== -1}
                batchIndex={batchIdx + 1}
                onClick={(e) => handleTileClick(render, idx, e)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
