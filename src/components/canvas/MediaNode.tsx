import React, { useRef } from 'react'
import { useCanvasStore, type CanvasNode } from '@/stores/canvasStore'

interface Props {
  node: CanvasNode
  isSelected: boolean
  animationClass?: string
  onStartEdge: (fromNodeId: string, fromWorldPos: { x: number; y: number }, fromType: 'prompt' | 'media') => void
  onContextMenu: (e: React.MouseEvent) => void
}

export default function MediaNode({ node, isSelected, animationClass = '', onStartEdge, onContextMenu }: Props): React.ReactElement {
  const { updateNode, setSelectedNode, moveNodes, removeNode } = useCanvasStore()
  const dragState = useRef<{ sx: number; sy: number; startPos: Record<string, { x: number; y: number }>; ids: string[] } | null>(null)
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
          w: Math.max(80, resizeState.current.sw + (ev.clientX - resizeState.current.sx) / zoom),
          h: Math.max(80, resizeState.current.sh + (ev.clientY - resizeState.current.sy) / zoom),
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

  function onOutputPortMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    onStartEdge(node.id, {
      x: node.position.x + node.size.w,
      y: node.position.y + node.size.h / 2,
    }, 'media')
  }

  const HEADER_H = 28
  const mediaH = node.size.h - HEADER_H

  return (
    <div
      data-node={node.id}
      className={`absolute rounded-xl border overflow-hidden transition-colors ${
        isSelected
          ? 'border-amber-400/60 shadow-[0_0_0_1px_rgba(251,191,36,0.2),0_4px_32px_rgba(0,0,0,0.6)]'
          : 'border-white/10 shadow-[0_2px_16px_rgba(0,0,0,0.5)]'
      } bg-[#141410] ${animationClass}`}
      style={{ left: node.position.x, top: node.position.y, width: node.size.w, height: node.size.h }}
      onClick={(e) => { e.stopPropagation(); setSelectedNode(node.id) }}
      onContextMenu={onContextMenu}
    >
      {/* Header */}
      <div
        className="flex items-center gap-1.5 px-2 bg-[#1c1c14] border-b border-white/8 cursor-grab active:cursor-grabbing"
        style={{ height: HEADER_H }}
        onMouseDown={onHeaderMouseDown}
      >
        <span className="text-amber-400/50 text-[10px] select-none flex-shrink-0">◻</span>
        <span className="text-[10px] text-white/30 truncate flex-1 select-none font-mono" title={node.mediaName}>
          {node.mediaName}
        </span>
        <button
          className="w-4 h-4 flex items-center justify-center rounded text-[9px] text-white/20 hover:text-white/60 hover:bg-white/8 transition-colors flex-shrink-0"
          onMouseDown={e => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); removeNode(node.id) }}
          title="Remove"
        >✕</button>
      </div>

      {/* Media preview */}
      <div style={{ height: mediaH }} className="overflow-hidden">
        {node.resultMediaType?.includes('video') ? (
          <video
            src={node.mediaUrl}
            className="w-full h-full object-cover"
            onMouseDown={e => e.stopPropagation()}
          />
        ) : (
          <img
            src={node.mediaUrl}
            className="w-full h-full object-cover"
            draggable={false}
            onMouseDown={e => e.stopPropagation()}
          />
        )}
      </div>

      {/* Output port */}
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-amber-500/60 border border-amber-400 cursor-crosshair hover:bg-amber-400 hover:scale-125 transition-all z-10"
        onMouseDown={onOutputPortMouseDown}
        title="Drag to connect as input to a prompt node"
      />

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize opacity-20 hover:opacity-50 transition-opacity"
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
