import React, { useEffect, useRef, useState } from 'react'
import { useRenderQueueStore, type QueuedRender } from '@/stores/renderQueue'
import { useSourceMediaStore } from '@/stores/sourceMedia'
import { useVideoEditorStore } from '@/stores/videoEditor'
import { usePromptStore } from '@/stores/prompt'
import { useChainGraphStore } from '@/stores/chainGraph'
import { useSettingsStore } from '@/stores/settings'
import { useTagsStore, TAG_COLORS, type Tag } from '@/stores/tags'

// ── Flat tile — one per individual image/video from a batch ───────────────────

interface FlatTile {
  id: string                   // `${render.id}-${index}`
  render: QueuedRender
  url: string
  mediaType: string | null
  thumbnailUrl: string | null
  batchTotal: number           // how many images in this render batch
  batchIndex: number           // 0-based position within the batch
}

function buildFlatTiles(queue: QueuedRender[]): FlatTile[] {
  return [...queue]
    .filter((r) => r.status === 'done' && ((r.resultUrls?.length ?? 0) > 0 || r.resultUrl || r.thumbnailUrl))
    .reverse()
    .flatMap((r) => {
      const urls = (r.resultUrls?.length ?? 0) > 0
        ? r.resultUrls
        : r.resultUrl
          ? [{ url: r.resultUrl, mediaType: r.mediaType }]
          : []
      return urls.map((u, i) => ({
        id: `${r.id}-${i}`,
        render: r,
        url: u.url,
        mediaType: u.mediaType,
        thumbnailUrl: r.thumbnailUrl,
        batchTotal: urls.length,
        batchIndex: i,
      }))
    })
}

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
          <span className="text-white/45 text-2xl">▶</span>
        </div>
      )}
    </div>
  )
}

// ── Tag popover ────────────────────────────────────────────────────────────────

function TagPopover({ tileId, onClose }: { tileId: string; onClose: () => void }): React.ReactElement {
  const { tags, getTileTags, assignTag, unassignTag, createTag } = useTagsStore()
  const tileTags = getTileTags(tileId)
  const tileTagIds = new Set(tileTags.map(t => t.id))
  const [newName, setNewName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const tag = createTag(newName.trim())
    assignTag(tileId, tag.id)
    setNewName('')
  }

  return (
    <div
      className="absolute bottom-full left-0 mb-1 z-50 w-44 rounded-lg border border-white/15 bg-neutral-900 shadow-xl text-white"
      onClick={e => e.stopPropagation()}
    >
      <div className="px-2.5 py-2 border-b border-white/8">
        <p className="text-[9px] uppercase tracking-widest text-white/60 font-semibold">Tags</p>
      </div>

      {/* Existing tags */}
      <div className="max-h-40 overflow-y-auto py-1">
        {tags.length === 0 && (
          <p className="text-[10px] text-white/50 px-2.5 py-1">No tags yet</p>
        )}
        {tags.map(tag => {
          const assigned = tileTagIds.has(tag.id)
          return (
            <button
              key={tag.id}
              onClick={() => assigned ? unassignTag(tileId, tag.id) : assignTag(tileId, tag.id)}
              className="w-full flex items-center gap-2 px-2.5 py-1 hover:bg-white/5 transition-colors text-left"
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: tag.color }} />
              <span className="text-[11px] flex-1 truncate text-white/80">{tag.name}</span>
              {assigned && <span className="text-[10px] text-white/70">✓</span>}
            </button>
          )
        })}
      </div>

      {/* Create new tag */}
      <form onSubmit={handleCreate} className="px-2 pb-2 pt-1 border-t border-white/8">
        <input
          ref={inputRef}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose()}
          placeholder="New tag…"
          className="w-full rounded bg-white/8 px-2 py-1 text-[11px] text-white placeholder-white/20 outline-none focus:bg-white/12 transition-colors"
        />
      </form>
    </div>
  )
}

// ── Individual tile ────────────────────────────────────────────────────────────

function MediaTile({
  tile,
  sourceSelected,
  batchSelected,
  batchSelectionIndex,
  compact,
  promptGrabbed,
  hideNsfw,
  tileTags,
  onClick,
  onAddToEditor,
  onGrabPrompt,
  onSendToNodegraph,
  onToggleNsfw,
}: {
  tile: FlatTile
  sourceSelected: boolean
  batchSelected: boolean
  batchSelectionIndex: number
  compact: boolean
  promptGrabbed: boolean
  hideNsfw: boolean
  tileTags: Tag[]
  onClick: (e: React.MouseEvent) => void
  onAddToEditor: () => void
  onGrabPrompt: () => void
  onSendToNodegraph: () => void
  onToggleNsfw: () => void
}): React.ReactElement {
  const [showTagPopover, setShowTagPopover] = useState(false)
  const { url, mediaType, thumbnailUrl, render, batchTotal, batchIndex } = tile
  const isNsfw = render.isNsfw ?? false
  const isVideo = mediaType?.startsWith('video') ?? false
  const isAudio = mediaType?.startsWith('audio') ?? false
  const isImage = !isVideo && !isAudio
  const thumb = thumbnailUrl ?? url
  const canAddToEditor = !!(url && (isVideo || isImage))
  const hasPrompt = !!render.prompt

  const ringClass = batchSelected
    ? 'ring-2 ring-orange-400 ring-offset-2 ring-offset-neutral-900'
    : sourceSelected
      ? 'ring-2 ring-brand ring-offset-2 ring-offset-neutral-900'
      : isNsfw
        ? 'ring-1 ring-red-500/40 hover:ring-red-500/70'
        : 'ring-1 ring-white/10 hover:ring-white/30'

  return (
    <div
      className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group ${ringClass}`}
      onClick={onClick}
    >
      {/* Media — blurred if NSFW and hideNsfw is off */}
      <div className={isNsfw && !hideNsfw ? 'blur-xl scale-110 absolute inset-0 transition-[filter] duration-200 group-hover:blur-none group-hover:scale-100' : 'absolute inset-0'}>
        {isVideo ? (
          <VideoTile src={url} className="w-full h-full bg-neutral-800" />
        ) : isAudio ? (
          <div className="w-full h-full flex items-center justify-center bg-neutral-800">
            <span className="text-white/45 text-3xl">🎵</span>
          </div>
        ) : thumb ? (
          <img
            src={thumb}
            alt={render.workflowSlug}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-neutral-800">
            <span className="text-white/45 text-3xl">🖼</span>
          </div>
        )}
      </div>

      {/* NSFW badge — always visible when tagged */}
      {isNsfw && (
        <div className="absolute top-1.5 right-1.5 rounded bg-red-600/80 px-1 py-0.5 text-[9px] text-white font-bold leading-none select-none z-10">
          NSFW
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 py-1.5
        translate-y-full group-hover:translate-y-0 transition-transform duration-150 z-20">
        {!compact && (
          <p className="text-white/80 text-[10px] font-mono truncate leading-tight mb-1">
            {render.workflowSlug}
          </p>
        )}
        <div className="flex gap-0.5">
          {canAddToEditor && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddToEditor() }}
              className="flex-1 text-center text-[10px] leading-none py-1 rounded bg-brand/80 hover:bg-brand text-white transition-colors font-medium"
              title="Add to Video Editor timeline"
            >
              ✂ Editor
            </button>
          )}
          {(hasPrompt || canAddToEditor) && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (promptGrabbed) onSendToNodegraph()
                else onGrabPrompt()
              }}
              className={`flex-1 text-center text-[10px] leading-none py-1 rounded transition-colors font-medium ${
                promptGrabbed
                  ? 'bg-emerald-600/80 hover:bg-emerald-600 text-white'
                  : 'bg-white/15 hover:bg-white/25 text-white/80'
              }`}
              title={promptGrabbed ? 'Send media to node graph' : 'Load prompt into editor'}
            >
              {promptGrabbed ? '⧉ To Graph' : '⌕ Prompt'}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleNsfw() }}
            className={`text-[10px] leading-none py-1 px-1.5 rounded transition-colors font-medium ${
              isNsfw
                ? 'bg-red-600/60 hover:bg-red-600/80 text-red-200'
                : 'bg-white/10 hover:bg-red-600/40 text-white/75 hover:text-red-300'
            }`}
            title={isNsfw ? 'Remove NSFW tag' : 'Mark as NSFW'}
          >
            🔞
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowTagPopover(v => !v) }}
            className={`text-[10px] leading-none py-1 px-1.5 rounded transition-colors font-medium ${
              tileTags.length > 0
                ? 'bg-brand/40 hover:bg-brand/60 text-brand-light'
                : 'bg-white/10 hover:bg-white/20 text-white/75'
            }`}
            title="Assign tags"
          >
            🏷
          </button>
        </div>
      </div>

      {/* Tag popover */}
      {showTagPopover && (
        <div className="absolute inset-x-0 bottom-0 z-50">
          <TagPopover tileId={tile.id} onClose={() => setShowTagPopover(false)} />
        </div>
      )}

      {/* Tag badges — visible when tile has tags */}
      {tileTags.length > 0 && !batchSelected && (
        <div className="absolute bottom-1 left-1 flex gap-0.5 flex-wrap z-10 pointer-events-none">
          {tileTags.slice(0, 3).map(tag => (
            <span
              key={tag.id}
              className="rounded-sm px-1 py-0.5 text-[8px] font-bold leading-none text-white/90 select-none"
              style={{ background: tag.color + 'cc' }}
            >
              {tag.name}
            </span>
          ))}
          {tileTags.length > 3 && (
            <span className="rounded-sm px-1 py-0.5 text-[8px] font-bold leading-none text-white/82 bg-black/50 select-none">
              +{tileTags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Batch selection badge (top-left) */}
      {batchSelected && (
        <div className="absolute top-1.5 left-1.5 rounded bg-orange-500 px-1.5 py-0.5 text-xs text-white font-bold leading-none z-10">
          {batchSelectionIndex}
        </div>
      )}

      {/* Source badge (top-right, below NSFW badge) */}
      {sourceSelected && !batchSelected && !isNsfw && (
        <div className="absolute top-1.5 right-1.5 rounded bg-brand px-1.5 py-0.5 text-xs text-white font-medium leading-none z-10">
          ✓
        </div>
      )}

      {/* Batch-image index badge */}
      {batchTotal > 1 && !batchSelected && (
        <div className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white/82 leading-none font-mono z-10">
          {batchIndex + 1}/{batchTotal}
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
        <p className="text-white/50 text-sm">Your renders will appear here</p>
      </div>
    </div>
  )
}

// ── MediaLibraryGrid ───────────────────────────────────────────────────────────

export default function MediaLibraryGrid({ cols, onColsChange, search, animateIn = true }: { cols: number; onColsChange?: (c: number) => void; search: string; animateIn?: boolean }): React.ReactElement {
  const { queue, markNsfw } = useRenderQueueStore()
  const { setFromRender } = useSourceMediaStore()
  const { queueForEditor } = useVideoEditorStore()
  const { hideNsfw } = useSettingsStore()
  const getTileTags = useTagsStore(s => s.getTileTags)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [batchIds, setBatchIds] = useState<string[]>([])
  const lastClickedIdxRef = useRef<number | null>(null)
  const [grabbedId, setGrabbedId] = useState<string | null>(null)

  // ── Rubber-band overscroll ─────────────────────────────────────────────────
  const gridScrollRef = useRef<HTMLDivElement>(null)
  const overscrollRef = useRef(0)
  const [overscroll, setOverscroll] = useState(0)
  const springRafRef = useRef<number | null>(null)
  const springTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Shift+scroll resizes columns (2–5)
  useEffect(() => {
    const el = gridScrollRef.current
    if (!el || !onColsChange) return
    const handler = (e: WheelEvent) => {
      if (!e.shiftKey) return
      e.preventDefault()
      onColsChange(Math.min(5, Math.max(2, cols + (e.deltaY > 0 ? 1 : -1))))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [cols, onColsChange])

  useEffect(() => {
    const el = gridScrollRef.current
    if (!el) return

    function startSpring() {
      const from = overscrollRef.current
      const start = performance.now()
      const dur = 420
      function frame(now: number) {
        const t = Math.min(1, (now - start) / dur)
        const eased = 1 - Math.pow(1 - t, 3)
        overscrollRef.current = from * (1 - eased)
        setOverscroll(overscrollRef.current)
        if (t < 1) {
          springRafRef.current = requestAnimationFrame(frame)
        } else {
          overscrollRef.current = 0
          setOverscroll(0)
          springRafRef.current = null
        }
      }
      springRafRef.current = requestAnimationFrame(frame)
    }

    function onWheel(e: WheelEvent) {
      const atTop = el.scrollTop <= 0
      const atBottom = el.scrollTop >= el.scrollHeight - el.clientHeight - 1
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        e.preventDefault()
        if (springRafRef.current !== null) { cancelAnimationFrame(springRafRef.current); springRafRef.current = null }
        if (springTimerRef.current !== null) clearTimeout(springTimerRef.current)
        const sign = e.deltaY < 0 ? 1 : -1
        overscrollRef.current = Math.max(-52, Math.min(52, overscrollRef.current + sign * Math.min(32, Math.abs(e.deltaY) * 0.28)))
        setOverscroll(overscrollRef.current)
        springTimerRef.current = setTimeout(startSpring, 90)
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (springRafRef.current !== null) cancelAnimationFrame(springRafRef.current)
      if (springTimerRef.current !== null) clearTimeout(springTimerRef.current)
    }
  }, [])

  // Flatten all done renders into one tile per image, filter NSFW when hidden
  const allTiles = buildFlatTiles(queue)

  const searchTerm = search.trim().toLowerCase()
  const filtered = allTiles
    .filter(t => !(hideNsfw && (t.render.isNsfw ?? false)))
    .filter(t => !searchTerm || t.render.prompt?.toLowerCase().includes(searchTerm))

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

  function handleTileClick(tile: FlatTile, idx: number, e: React.MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setBatchIds(prev =>
        prev.includes(tile.id)
          ? prev.filter(id => id !== tile.id)
          : [...prev, tile.id]
      )
      lastClickedIdxRef.current = idx
      return
    }

    if (e.shiftKey && lastClickedIdxRef.current !== null) {
      e.preventDefault()
      const from = Math.min(lastClickedIdxRef.current, idx)
      const to   = Math.max(lastClickedIdxRef.current, idx)
      const rangeIds = filtered.slice(from, to + 1).map(t => t.id)
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

    setBatchIds([])
    lastClickedIdxRef.current = idx

    if (selectedId === tile.id) {
      setSelectedId(null)
      return
    }
    setSelectedId(tile.id)
    setFromRender(tile.url, tile.mediaType ?? 'image')
  }

  function addSingleToEditor(tile: FlatTile) {
    const type = tile.mediaType?.startsWith('video') ? 'video' : tile.mediaType?.startsWith('audio') ? 'audio' : 'image'
    queueForEditor([{
      id: tile.render.id,
      url: tile.url,
      name: tile.render.workflowSlug || tile.render.id,
      type,
      thumbnailUrl: tile.render.thumbnailUrl ?? (type === 'image' ? tile.url : null),
      prompt: tile.render.prompt,
    }])
  }

  function grabPrompt(tile: FlatTile) {
    if (!tile.render.prompt) return
    usePromptStore.getState().setRawPrompt(tile.render.prompt)
    setGrabbedId(tile.id)
  }

  function sendToNodegraph(tile: FlatTile) {
    useChainGraphStore.getState().addMediaNode(
      tile.url,
      tile.mediaType ?? 'image',
      tile.render.prompt ?? '',
    )
    setGrabbedId(null)
  }

  function sendBatchToEditor() {
    const assets = batchIds
      .map(id => filtered.find(t => t.id === id))
      .filter((t): t is FlatTile => !!t)
      .map(t => {
        const type = t.mediaType?.startsWith('video') ? 'video' : t.mediaType?.startsWith('audio') ? 'audio' : 'image'
        return {
          id: t.render.id,
          url: t.url,
          name: t.render.workflowSlug || t.render.id,
          type: type as 'video' | 'image' | 'audio',
          thumbnailUrl: t.render.thumbnailUrl ?? (type === 'image' ? t.url : null),
          prompt: t.render.prompt,
        }
      })
    if (assets.length > 0) queueForEditor(assets)
    setBatchIds([])
  }

  const batchEditorCount = batchIds
    .map(id => filtered.find(t => t.id === id))
    .filter((t): t is FlatTile => !!t && !(t.mediaType?.startsWith('audio') ?? false))
    .length

  if (allTiles.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <EmptyState />
      </div>
    )
  }

  const gridClass = ['', '', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5'][cols] ?? 'grid-cols-2'

  return (
    <div className="flex flex-col h-full">

      {/* ── Batch action bar ── */}
      {batchIds.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-orange-950/60 border-b border-orange-500/20 flex-shrink-0">
          <span className="text-xs text-orange-300/80">
            {batchIds.length} selected
          </span>
          <div className="flex-1" />
          {batchEditorCount > 0 ? (
            <button
              onClick={sendBatchToEditor}
              className="rounded px-2.5 py-1 text-xs bg-orange-500/20 border border-orange-500/40 text-orange-300 hover:bg-orange-500/30 hover:text-orange-200 transition-colors"
            >
              ✂ Send {batchEditorCount} to Editor
            </button>
          ) : (
            <span className="text-xs text-orange-300/40 italic">No media in selection</span>
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
      <div ref={gridScrollRef} className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 && searchTerm && (
          <p className="text-[11px] text-white/50 text-center py-6">
            No renders match "{search}"
          </p>
        )}
        <div
          className={`grid ${gridClass} gap-1.5`}
          style={{ transform: overscroll !== 0 ? `translateY(${overscroll}px)` : undefined }}
        >
          {filtered.map((tile, idx) => {
            const batchSelIdx = batchIds.indexOf(tile.id)
            // Pseudo-random staggered delay based on index (0–800ms spread)
            const flickerDelay = animateIn ? `${(idx * 137) % 820}ms` : '0ms'
            return (
              <div
                key={tile.id}
                className={animateIn ? 'animate-tile-in' : ''}
                style={animateIn ? { animationDelay: flickerDelay } : {}}
              >
              <MediaTile
                key={tile.id}
                tile={tile}
                sourceSelected={tile.id === selectedId}
                batchSelected={batchSelIdx !== -1}
                batchSelectionIndex={batchSelIdx + 1}
                compact={cols >= 4}
                promptGrabbed={grabbedId === tile.id}
                hideNsfw={hideNsfw}
                tileTags={getTileTags(tile.id)}
                onClick={(e) => handleTileClick(tile, idx, e)}
                onAddToEditor={() => addSingleToEditor(tile)}
                onGrabPrompt={() => grabPrompt(tile)}
                onSendToNodegraph={() => sendToNodegraph(tile)}
                onToggleNsfw={() => markNsfw(tile.render.id, !(tile.render.isNsfw ?? false))}
              />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
