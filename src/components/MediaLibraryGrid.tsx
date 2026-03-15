import React, { useEffect, useRef, useState } from 'react'
import { useRenderQueueStore, type QueuedRender } from '@/stores/renderQueue'
import { useSourceMediaStore } from '@/stores/sourceMedia'
import { useVideoEditorStore } from '@/stores/videoEditor'

// ── Video tile — scrubs on mousemove via canvas snapshot ──────────────────────

function VideoTile({ src, className }: { src: string; className?: string }): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

  // Draw a frame from the video onto the canvas
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
    <div
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Off-screen video used only for seeking */}
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        muted
        playsInline
        className="absolute invisible w-0 h-0"
      />
      {/* Canvas shows the current frame */}
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
  selected,
  onSelect,
}: {
  render: QueuedRender
  selected: boolean
  onSelect: () => void
}): React.ReactElement {
  const isVideo = render.mediaType === 'video'
  const thumb = render.thumbnailUrl ?? render.resultUrl ?? null
  const addClip = useVideoEditorStore((s) => s.addClip)

  return (
    <div
      className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group
        ${selected
          ? 'ring-2 ring-brand ring-offset-2 ring-offset-neutral-900'
          : 'ring-1 ring-white/10 hover:ring-white/30'
        }`}
      onClick={onSelect}
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
          <span className="text-white/20 text-3xl">
            {isVideo ? '▶' : '🖼'}
          </span>
        </div>
      )}

      {/* Bottom overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5
        translate-y-full group-hover:translate-y-0 transition-transform duration-150">
        <p className="text-white/80 text-xs font-mono truncate">{render.workflowSlug}</p>
        {isVideo && render.resultUrl && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              addClip(render.resultUrl!, render.prompt ?? '', render.workflowSlug)
            }}
            className="text-xs text-brand hover:text-white transition-colors mt-0.5"
            title="Send to Video Editor"
          >
            ▶ Editor
          </button>
        )}
      </div>

      {/* Selected badge */}
      {selected && (
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
        {/* Faint grid pattern via inline SVG */}
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
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const completed = [...queue]
    .filter((r) => r.status === 'done' && (r.resultUrl || r.thumbnailUrl))
    .reverse()

  // Deselect on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function handleSelect(render: QueuedRender) {
    if (selectedId === render.id) {
      setSelectedId(null)
      return
    }
    setSelectedId(render.id)
    if (render.resultUrl) {
      setFromRender(render.resultUrl, render.mediaType ?? 'image')
    }
  }

  if (completed.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <EmptyState />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {completed.map((render) => (
          <MediaTile
            key={render.id}
            render={render}
            selected={render.id === selectedId}
            onSelect={() => handleSelect(render)}
          />
        ))}
      </div>
    </div>
  )
}
