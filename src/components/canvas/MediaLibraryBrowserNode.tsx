import React, { useRef, useState, useMemo, useCallback } from 'react'
import { useCanvasStore, type CanvasNode } from '@/stores/canvasStore'
import { useRenderQueueStore, type QueuedRender } from '@/stores/renderQueue'
import { useSettingsStore } from '@/stores/settings'

interface FlatTile {
  id: string
  render: QueuedRender
  url: string
  mediaType: string | null
  batchTotal: number
  batchIndex: number
}

interface Props {
  node: CanvasNode
  animationClass?: string
  onContextMenu: (e: React.MouseEvent) => void
}

const MIN_W = 280
const MIN_H = 300
const HEADER_H = 36
const TOOLBAR_H = 32
const FILTER_H = 28
const TILE_MIN_PX = 76

type ViewMode = 'grid' | 'list'
type MediaFilter = 'all' | 'image' | 'video' | 'audio'

export default function MediaLibraryBrowserNode({ node, animationClass = '', onContextMenu }: Props): React.ReactElement {
  const { updateNode, setSelectedNode, moveNodes, removeNode } = useCanvasStore()
  const queue = useRenderQueueStore(s => s.queue)
  const hideNsfw = useSettingsStore(s => s.hideNsfw)

  const [search,      setSearch]      = useState('')
  const [viewMode,    setViewMode]    = useState<ViewMode>('grid')
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all')

  const dragState   = useRef<{ sx: number; sy: number; startPos: Record<string, { x: number; y: number }>; ids: string[] } | null>(null)
  const resizeState = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null)

  // ── Drag to move node ────────────────────────────────────────────────────
  function onHeaderMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input')) return
    e.stopPropagation()
    const store = useCanvasStore.getState()
    const isInSel = store.selectedNodeIds.includes(node.id)
    if (!isInSel) setSelectedNode(node.id)
    const ids = isInSel ? store.selectedNodeIds : [node.id]
    const startPos: Record<string, { x: number; y: number }> = {}
    for (const id of ids) {
      const n = store.nodes.find(n2 => n2.id === id)
      if (n) startPos[id] = { ...n.position }
    }
    dragState.current = { sx: e.clientX, sy: e.clientY, startPos, ids }
    function onMove(ev: MouseEvent) {
      if (!dragState.current) return
      const zoom = useCanvasStore.getState().viewport.zoom
      const dx = (ev.clientX - dragState.current.sx) / zoom
      const dy = (ev.clientY - dragState.current.sy) / zoom
      const positions: Record<string, { x: number; y: number }> = {}
      for (const id of dragState.current.ids) {
        const s = dragState.current.startPos[id]
        if (s) positions[id] = { x: s.x + dx, y: s.y + dy }
      }
      moveNodes(positions)
    }
    function onUp() {
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Resize ───────────────────────────────────────────────────────────────
  function onResizeMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    resizeState.current = { sx: e.clientX, sy: e.clientY, sw: node.size.w, sh: node.size.h }
    function onMove(ev: MouseEvent) {
      if (!resizeState.current) return
      const zoom = useCanvasStore.getState().viewport.zoom
      updateNode(node.id, {
        size: {
          w: Math.max(MIN_W, resizeState.current.sw + (ev.clientX - resizeState.current.sx) / zoom),
          h: Math.max(MIN_H, resizeState.current.sh + (ev.clientY - resizeState.current.sy) / zoom),
        },
      })
    }
    function onUp() {
      resizeState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Flatten queue into tiles ─────────────────────────────────────────────
  const tiles = useMemo<FlatTile[]>(() => {
    const done = queue.filter(r =>
      r.status === 'done' &&
      (r.resultUrls?.length > 0 || r.resultUrl)
    )
    done.sort((a, b) => b.submittedAt - a.submittedAt)

    const flat: FlatTile[] = []
    for (const render of done) {
      if (hideNsfw && render.isNsfw) continue
      const urls = render.resultUrls?.length
        ? render.resultUrls
        : render.resultUrl ? [{ url: render.resultUrl, mediaType: render.mediaType }] : []
      for (let i = 0; i < urls.length; i++) {
        const { url, mediaType } = urls[i]
        if (!url) continue
        flat.push({ id: `${render.id}-${i}`, render, url, mediaType: mediaType ?? render.mediaType, batchTotal: urls.length, batchIndex: i })
      }
    }
    return flat
  }, [queue, hideNsfw])

  // ── Filter + search ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tiles.filter(t => {
      if (mediaFilter === 'image' && !(!t.mediaType || t.mediaType.includes('image'))) return false
      if (mediaFilter === 'video' && !t.mediaType?.includes('video')) return false
      if (mediaFilter === 'audio' && !t.mediaType?.includes('audio')) return false
      if (q && !t.render.prompt.toLowerCase().includes(q) && !t.render.workflowSlug?.toLowerCase().includes(q)) return false
      return true
    })
  }, [tiles, mediaFilter, search])

  // ── Dynamic column count ─────────────────────────────────────────────────
  const contentW = node.size.w - 16   // 8px padding each side
  const colCount = Math.max(3, Math.floor(contentW / TILE_MIN_PX))
  const tileSize = Math.floor(contentW / colCount)

  const contentH = node.size.h - HEADER_H - TOOLBAR_H - FILTER_H - 4
  const showFilters = node.size.w >= 300

  // ── Drag tile onto canvas ────────────────────────────────────────────────
  const onTileDragStart = useCallback((e: React.DragEvent, tile: FlatTile) => {
    const mt = tile.mediaType ?? 'image'
    const label = tile.render.prompt.slice(0, 40) || tile.render.workflowSlug || 'media'
    e.dataTransfer.setData('application/fj-media', JSON.stringify({ url: tile.url, mediaType: mt, name: label }))
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  return (
    <div
      data-node={node.id}
      className={`absolute overflow-visible ${animationClass}`}
      style={{ left: node.position.x, top: node.position.y, width: node.size.w, height: node.size.h }}
      onClick={e => { e.stopPropagation(); setSelectedNode(node.id) }}
      onContextMenu={onContextMenu}
    >
      <div className="absolute inset-0 rounded-xl overflow-hidden border border-white/10 shadow-[0_4px_32px_rgba(0,0,0,0.7)] bg-[#0e0e10] flex flex-col">

        {/* ── Header ── */}
        <div
          className="flex items-center gap-1.5 px-2 border-b border-white/8 cursor-grab active:cursor-grabbing flex-shrink-0 select-none"
          style={{ height: HEADER_H, background: 'rgba(108,71,255,0.06)' }}
          onMouseDown={onHeaderMouseDown}
        >
          <span className="text-brand/70 text-[11px]">⊞</span>
          <span className="text-[10px] text-white/70 font-mono flex-1">Media Library</span>
          {filtered.length > 0 && (
            <span className="text-[9px] text-white/35 tabular-nums">{filtered.length}</span>
          )}
          <button
            className="w-4 h-4 flex items-center justify-center rounded text-[9px] text-white/35 hover:text-white/70 hover:bg-white/8 transition-colors"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); removeNode(node.id) }}
            title="Close"
          >✕</button>
        </div>

        {/* ── Search + view toggle ── */}
        <div
          className="flex items-center gap-1.5 px-2 border-b border-white/5 flex-shrink-0"
          style={{ height: TOOLBAR_H }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="relative flex-1 min-w-0">
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-white/30 text-[10px] pointer-events-none">⌕</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full rounded bg-white/5 pl-5 pr-1.5 py-0.5 text-[10px] text-white placeholder-white/20 outline-none focus:bg-white/8 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 text-[9px]"
              >✕</button>
            )}
          </div>
          {/* View toggle */}
          <div className="flex gap-0.5 flex-shrink-0">
            <button
              className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${viewMode === 'grid' ? 'text-brand bg-brand/10' : 'text-white/35 hover:text-white/65'}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >⊟</button>
            <button
              className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${viewMode === 'list' ? 'text-brand bg-brand/10' : 'text-white/35 hover:text-white/65'}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >≡</button>
          </div>
        </div>

        {/* ── Filter chips ── */}
        {showFilters && (
          <div
            className="flex items-center gap-1 px-2 border-b border-white/5 flex-shrink-0 overflow-x-auto"
            style={{ height: FILTER_H }}
            onMouseDown={e => e.stopPropagation()}
          >
            {(['all', 'image', 'video', 'audio'] as MediaFilter[]).map(f => (
              <button
                key={f}
                className={`px-2 py-0.5 rounded text-[9px] font-mono whitespace-nowrap transition-colors flex-shrink-0 ${
                  mediaFilter === f
                    ? 'bg-brand/20 text-brand border border-brand/40'
                    : 'text-white/35 hover:text-white/65 border border-transparent'
                }`}
                onClick={() => setMediaFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'image' ? '🖼 Images' : f === 'video' ? '🎬 Video' : '🎵 Audio'}
              </button>
            ))}
          </div>
        )}

        {/* ── Content ── */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
          style={{ height: contentH }}
          onMouseDown={e => e.stopPropagation()}
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 opacity-30">
              <span className="text-2xl">⊞</span>
              <span className="text-[10px] font-mono text-white/50">
                {search || mediaFilter !== 'all' ? 'no results' : 'no renders yet'}
              </span>
            </div>
          ) : viewMode === 'grid' ? (
            <GridView tiles={filtered} tileSize={tileSize} colCount={colCount} onTileDragStart={onTileDragStart} />
          ) : (
            <ListView tiles={filtered} onTileDragStart={onTileDragStart} />
          )}
        </div>
      </div>

      {/* ── Resize handle ── */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize opacity-20 hover:opacity-50 transition-opacity z-10"
        onMouseDown={onResizeMouseDown}
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '3px 3px',
          backgroundPosition: 'bottom 3px right 3px',
          backgroundRepeat: 'repeat',
        }}
      />
    </div>
  )
}

// ── Grid view ─────────────────────────────────────────────────────────────

function GridView({ tiles, tileSize, colCount, onTileDragStart }: {
  tiles: FlatTile[]
  tileSize: number
  colCount: number
  onTileDragStart: (e: React.DragEvent, tile: FlatTile) => void
}) {
  return (
    <div
      className="p-2"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)`, gap: 4 }}
    >
      {tiles.map(tile => (
        <GridTile key={tile.id} tile={tile} tileSize={tileSize} onTileDragStart={onTileDragStart} />
      ))}
    </div>
  )
}

function GridTile({ tile, tileSize, onTileDragStart }: {
  tile: FlatTile
  tileSize: number
  onTileDragStart: (e: React.DragEvent, tile: FlatTile) => void
}) {
  const [hovered, setHovered] = useState(false)
  const isAudio = tile.mediaType?.includes('audio')
  const isVideo = tile.mediaType?.includes('video')

  return (
    <div
      className="relative rounded overflow-hidden bg-white/5 cursor-grab active:cursor-grabbing flex-shrink-0 group"
      style={{ width: tileSize - 4, height: tileSize - 4 }}
      draggable
      onDragStart={e => onTileDragStart(e, tile)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={tile.render.prompt || tile.render.workflowSlug}
    >
      {isAudio ? (
        <div className="w-full h-full flex items-center justify-center text-xl bg-[#1a1a28]">🎵</div>
      ) : isVideo ? (
        <video src={tile.url} className="w-full h-full object-cover" muted playsInline />
      ) : (
        <img
          src={tile.render.thumbnailUrl ?? tile.url}
          className="w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
      )}
      {/* Batch badge */}
      {tile.batchTotal > 1 && (
        <div className="absolute top-0.5 left-0.5 px-1 rounded text-[8px] font-mono bg-black/60 text-white/60 leading-tight">
          {tile.batchIndex + 1}/{tile.batchTotal}
        </div>
      )}
      {/* Hover overlay */}
      {hovered && (
        <div className="absolute inset-0 bg-black/50 flex items-end p-1 pointer-events-none">
          <span className="text-[8px] text-white/80 font-mono line-clamp-2 leading-tight">
            {tile.render.prompt.slice(0, 60) || tile.render.workflowSlug}
          </span>
        </div>
      )}
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────────────────

function ListView({ tiles, onTileDragStart }: {
  tiles: FlatTile[]
  onTileDragStart: (e: React.DragEvent, tile: FlatTile) => void
}) {
  return (
    <div className="flex flex-col">
      {tiles.map(tile => (
        <ListRow key={tile.id} tile={tile} onTileDragStart={onTileDragStart} />
      ))}
    </div>
  )
}

function ListRow({ tile, onTileDragStart }: {
  tile: FlatTile
  onTileDragStart: (e: React.DragEvent, tile: FlatTile) => void
}) {
  const isAudio = tile.mediaType?.includes('audio')
  const isVideo = tile.mediaType?.includes('video')
  const mt = isAudio ? 'audio' : isVideo ? 'video' : 'image'

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/4 transition-colors cursor-grab active:cursor-grabbing group border-b border-white/4 last:border-b-0"
      draggable
      onDragStart={e => onTileDragStart(e, tile)}
      title={tile.render.prompt}
    >
      {/* Thumbnail */}
      <div className="w-9 h-9 rounded overflow-hidden flex-shrink-0 bg-white/5">
        {isAudio ? (
          <div className="w-full h-full flex items-center justify-center text-sm">🎵</div>
        ) : isVideo ? (
          <video src={tile.url} className="w-full h-full object-cover" muted />
        ) : (
          <img src={tile.render.thumbnailUrl ?? tile.url} className="w-full h-full object-cover" loading="lazy" draggable={false} />
        )}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-white/75 truncate font-mono leading-tight">
          {tile.render.prompt.slice(0, 60) || '—'}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[9px] text-white/35 truncate">{tile.render.workflowSlug}</span>
          {tile.batchTotal > 1 && (
            <span className="text-[8px] text-white/25 tabular-nums flex-shrink-0">{tile.batchIndex + 1}/{tile.batchTotal}</span>
          )}
        </div>
      </div>
      {/* Type badge */}
      <span className={`text-[8px] font-mono flex-shrink-0 px-1 py-0.5 rounded ${
        mt === 'video' ? 'bg-sky-500/10 text-sky-400/60' :
        mt === 'audio' ? 'bg-purple-500/10 text-purple-400/60' :
        'bg-white/5 text-white/25'
      }`}>{mt}</span>
    </div>
  )
}
