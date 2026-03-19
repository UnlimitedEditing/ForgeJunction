import React, { useRef } from 'react'
import { useCanvasStore, type CanvasNode } from '@/stores/canvasStore'

interface Props {
  node: CanvasNode
  isSelected: boolean
  isSnapTarget: boolean
  isNearInputPort?: boolean
  animationClass?: string
  onContextMenu: (e: React.MouseEvent) => void
  onOpenLightbox?: (item: { url: string; mediaType: string }) => void
}

export default function BinNode({ node, isSelected, isSnapTarget, isNearInputPort = false, animationClass = '', onContextMenu, onOpenLightbox }: Props): React.ReactElement {
  const { updateNode, setSelectedNode, moveNodes } = useCanvasStore()
  const dragState   = useRef<{ sx: number; sy: number; startPos: Record<string, { x: number; y: number }>; ids: string[] } | null>(null)
  const resizeState = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null)

  function onHeaderMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    const store = useCanvasStore.getState()
    const isInSelection = store.selectedNodeIds.includes(node.id)
    if (!isInSelection) setSelectedNode(node.id)
    const ids = isInSelection ? store.selectedNodeIds : [node.id]
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

  function onResizeMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    resizeState.current = { sx: e.clientX, sy: e.clientY, sw: node.size.w, sh: node.size.h }
    function onMove(ev: MouseEvent) {
      if (!resizeState.current) return
      const zoom = useCanvasStore.getState().viewport.zoom
      updateNode(node.id, {
        size: {
          w: Math.max(220, resizeState.current.sw + (ev.clientX - resizeState.current.sx) / zoom),
          h: Math.max(200, resizeState.current.sh + (ev.clientY - resizeState.current.sy) / zoom),
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

  const filters  = node.filters
  const items    = node.items ?? []
  const HEADER_H = 36
  const FILTER_H = 90
  const colCount = Math.max(2, Math.floor((node.size.w - 16) / 110))
  const gridH    = node.size.h - HEADER_H - FILTER_H

  return (
    // Outer wrapper: overflow-visible so ports extend freely beyond node boundary
    <div
      data-node={node.id}
      className={`absolute overflow-visible ${animationClass}`}
      style={{ left: node.position.x, top: node.position.y, width: node.size.w, height: node.size.h }}
      onClick={(e) => { e.stopPropagation(); setSelectedNode(node.id) }}
      onContextMenu={onContextMenu}
    >
      {/* Inner content box — handles border, background, rounded corners, overflow clipping */}
      <div className={`absolute inset-0 rounded-xl overflow-hidden border transition-colors ${
        isSnapTarget
          ? 'border-emerald-400/80 shadow-[0_0_0_2px_rgba(52,211,153,0.3),0_4px_32px_rgba(0,0,0,0.6)]'
          : isSelected
            ? 'border-emerald-500/50 shadow-[0_0_0_1px_rgba(52,211,153,0.2),0_4px_32px_rgba(0,0,0,0.6)]'
            : 'border-white/10 shadow-[0_2px_16px_rgba(0,0,0,0.5)]'
      } bg-[#111815]`}>

        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 bg-[#162019] border-b border-white/8 cursor-grab active:cursor-grabbing flex-shrink-0"
          style={{ height: HEADER_H }}
          onMouseDown={onHeaderMouseDown}
        >
          <span className="text-emerald-400/50 text-xs select-none">⬡</span>
          <span className="text-[11px] text-white/35 font-medium select-none flex-1 tracking-wide">Bin</span>
          <span className="text-[10px] text-white/20 select-none tabular-nums">{items.length}</span>
        </div>

        {/* Filters */}
        <div
          className="px-2.5 py-2 border-b border-white/5 space-y-1.5 flex-shrink-0"
          style={{ height: FILTER_H }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-white/20 w-14 flex-shrink-0 select-none uppercase tracking-wide">Type</span>
            <select
              className="flex-1 bg-white/5 text-white/45 text-[10px] rounded px-1.5 py-0.5 outline-none cursor-pointer"
              value={filters.fileType}
              onChange={e => updateNode(node.id, { filters: { ...filters, fileType: e.target.value as any } })}
              onMouseDown={e => e.stopPropagation()}
            >
              <option value="">Any</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-white/20 w-14 flex-shrink-0 select-none uppercase tracking-wide">Prompt</span>
            <input
              type="text"
              className="flex-1 bg-white/5 text-white/45 text-[10px] rounded px-1.5 py-0.5 outline-none placeholder-white/15"
              placeholder="contains…"
              value={filters.promptContains}
              onChange={e => updateNode(node.id, { filters: { ...filters, promptContains: e.target.value } })}
              onMouseDown={e => e.stopPropagation()}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-white/20 w-14 flex-shrink-0 select-none uppercase tracking-wide">Size</span>
            <input
              type="text"
              className="flex-1 bg-white/5 text-white/45 text-[10px] rounded px-1.5 py-0.5 outline-none placeholder-white/15"
              placeholder="1024x1024"
              value={filters.resolution}
              onChange={e => updateNode(node.id, { filters: { ...filters, resolution: e.target.value } })}
              onMouseDown={e => e.stopPropagation()}
            />
          </div>
        </div>

        {/* Items grid */}
        <div
          className="p-2 overflow-y-auto"
          style={{ height: gridH }}
          onMouseDown={e => e.stopPropagation()}
        >
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-1 pointer-events-none">
              <span className="text-[18px] text-white/8 select-none">⬡</span>
              <span className="text-[9px] text-white/15 select-none">Connect a prompt node to collect outputs</span>
            </div>
          ) : (
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
            >
              {items.map((item, i) => (
                <div
                  key={i}
                  className="relative aspect-square rounded-lg overflow-hidden bg-white/5 group cursor-pointer"
                  onDoubleClick={(e) => { e.stopPropagation(); onOpenLightbox?.({ url: item.url, mediaType: item.mediaType ?? 'image' }) }}
                >
                  {item.mediaType?.includes('video') ? (
                    <video src={item.url} className="w-full h-full object-cover" />
                  ) : (
                    <img src={item.url} className="w-full h-full object-cover" draggable={false} />
                  )}
                  <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                    <span className="text-[8px] text-white/70 line-clamp-3 leading-tight">{item.prompt}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input port — outside inner overflow-hidden, always fully visible */}
      <div
        className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border z-10 transition-all ${
          isSnapTarget
            ? 'bg-emerald-400 border-emerald-300 scale-150 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
            : isNearInputPort
              ? 'bg-emerald-400/90 border-emerald-300 scale-[1.8] shadow-[0_0_6px_rgba(52,211,153,0.7)]'
              : 'bg-emerald-500/50 border-emerald-500/80'
        }`}
        title="Input port"
      />

      {/* Resize handle — outside inner overflow-hidden */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize opacity-20 hover:opacity-50 transition-opacity rounded-br-xl z-10"
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
