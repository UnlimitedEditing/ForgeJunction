import React, { useRef } from 'react'
import { useCanvasStore, type CanvasNode } from '@/stores/canvasStore'

interface Props {
  node: CanvasNode
  isSelected: boolean
  animationClass?: string
  onContextMenu: (e: React.MouseEvent) => void
  onOpenLightbox?: (item: { url: string; mediaType: string }) => void
}

export default function VideoEditorOutNode({ node, isSelected, animationClass = '', onContextMenu, onOpenLightbox }: Props): React.ReactElement {
  const { updateNode, setSelectedNode, moveNodes, removeNode } = useCanvasStore()
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
          w: Math.max(200, resizeState.current.sw + (ev.clientX - resizeState.current.sx) / zoom),
          h: Math.max(140, resizeState.current.sh + (ev.clientY - resizeState.current.sy) / zoom),
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

  const HEADER_H = 32
  const videoH = node.size.h - HEADER_H

  return (
    <div
      data-node={node.id}
      className={`absolute overflow-visible ${animationClass}`}
      style={{ left: node.position.x, top: node.position.y, width: node.size.w, height: node.size.h }}
      onClick={(e) => { e.stopPropagation(); setSelectedNode(node.id) }}
      onContextMenu={onContextMenu}
    >
      {/* Inner content box */}
      <div className={`absolute inset-0 rounded-xl overflow-hidden border transition-colors ${
        isSelected
          ? 'border-[#ff6b2b]/70 shadow-[0_0_0_1px_rgba(255,107,43,0.25),0_4px_32px_rgba(0,0,0,0.7)]'
          : 'border-[#ff6b2b]/25 shadow-[0_2px_20px_rgba(0,0,0,0.6)]'
      } bg-[#110a06]`}>

        {/* Header */}
        <div
          className="flex items-center gap-2 px-2.5 border-b border-[#ff6b2b]/20 cursor-grab active:cursor-grabbing bg-[#1a0d08]"
          style={{ height: HEADER_H }}
          onMouseDown={onHeaderMouseDown}
        >
          <span className="text-[#ff6b2b]/70 text-xs select-none flex-shrink-0">✂</span>
          <span className="text-[10px] text-white/65 truncate flex-1 select-none font-mono" title={node.mediaName}>
            {node.mediaName}
          </span>
          <span className="text-[9px] text-[#ff6b2b]/50 font-mono select-none flex-shrink-0 uppercase tracking-wide">out</span>
          <button
            className="w-4 h-4 flex items-center justify-center rounded text-[9px] text-white/40 hover:text-white/75 hover:bg-white/8 transition-colors flex-shrink-0"
            onMouseDown={e => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); removeNode(node.id) }}
            title="Remove"
          >✕</button>
        </div>

        {/* Video player */}
        <div
          style={{ height: videoH }}
          className="overflow-hidden flex items-center justify-center bg-[#0a0604] cursor-zoom-in"
          onDoubleClick={(e) => {
            e.stopPropagation()
            if (node.mediaUrl) onOpenLightbox?.({ url: node.mediaUrl, mediaType: 'video/mp4' })
          }}
        >
          {node.mediaUrl ? (
            <video
              key={node.mediaUrl}
              src={node.mediaUrl}
              className="w-full h-full object-contain"
              controls
              onMouseDown={e => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation()
                onOpenLightbox?.({ url: node.mediaUrl!, mediaType: 'video/mp4' })
              }}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/25">
              <span className="text-2xl">✂</span>
              <span className="text-[10px]">No export yet</span>
            </div>
          )}
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize opacity-20 hover:opacity-50 transition-opacity z-10"
        onMouseDown={onResizeMouseDown}
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,107,43,0.6) 1px, transparent 1px)',
          backgroundSize: '3px 3px',
          backgroundPosition: 'bottom 3px right 3px',
          backgroundRepeat: 'repeat',
        }}
      />
    </div>
  )
}
