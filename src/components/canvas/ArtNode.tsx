import React, { useRef, useEffect } from 'react'
import { useCanvasStore, type CanvasNode } from '@/stores/canvasStore'
import { useAnnotationStore } from '@/stores/annotations'
import { drawAnnotationsToCanvas } from './DrawingLayer'

interface Props {
  node: CanvasNode
  isSelected: boolean
  animationClass?: string
  onContextMenu: (e: React.MouseEvent) => void
  onStartEdge: (fromNodeId: string, fromWorldPos: { x: number; y: number }, fromType: 'prompt' | 'media') => void
}

export default function ArtNode({ node, isSelected, animationClass = '', onContextMenu, onStartEdge }: Props): React.ReactElement {
  const { updateNode, setSelectedNode, moveNodes, removeNode, addMediaNode } = useCanvasStore()
  const { annotations, getInBounds } = useAnnotationStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragState = useRef<{ sx: number; sy: number; startPos: Record<string, {x:number;y:number}>; ids: string[] } | null>(null)
  const resizeState = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null)

  const HEADER_H = 32
  const artLayers = (node.artLayerIds ?? []).map(id => annotations.find(a => a.id === id)).filter(Boolean) as typeof annotations

  // Render preview into canvas element
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const bounds = node.artBounds ?? { x: 0, y: 0, w: node.size.w, h: node.size.h - HEADER_H }
    c.width = bounds.w; c.height = bounds.h
    ctx.fillStyle = '#0c0a14'
    ctx.fillRect(0, 0, c.width, c.height)
    drawAnnotationsToCanvas(ctx, artLayers, bounds.x, bounds.y)
  }, [artLayers, node.artBounds, node.size])

  function onHeaderMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    const store = useCanvasStore.getState()
    const isInSelection = store.selectedNodeIds.includes(node.id)
    if (!isInSelection) setSelectedNode(node.id)
    const ids = isInSelection ? store.selectedNodeIds : [node.id]
    const startPos: Record<string, {x:number;y:number}> = {}
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
      const positions: Record<string, {x:number;y:number}> = {}
      for (const id of dragState.current.ids) {
        const s = dragState.current.startPos[id]
        if (s) positions[id] = { x: s.x + dx, y: s.y + dy }
      }
      moveNodes(positions)
    }
    function onUp() { dragState.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  function onResizeMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    resizeState.current = { sx: e.clientX, sy: e.clientY, sw: node.size.w, sh: node.size.h }
    function onMove(ev: MouseEvent) {
      if (!resizeState.current) return
      const zoom = useCanvasStore.getState().viewport.zoom
      updateNode(node.id, { size: { w: Math.max(160, resizeState.current.sw + (ev.clientX - resizeState.current.sx) / zoom), h: Math.max(160, resizeState.current.sh + (ev.clientY - resizeState.current.sy) / zoom) } })
    }
    function onUp() { resizeState.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  function onOutputPortMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    onStartEdge(node.id, { x: node.position.x + node.size.w, y: node.position.y + node.size.h / 2 }, 'media')
  }

  async function handleExport() {
    const bounds = node.artBounds ?? { x: 0, y: 0, w: node.size.w, h: node.size.h - HEADER_H }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bounds.w)
    canvas.height = Math.round(bounds.h)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const capturedAnns = artLayers.length > 0
      ? artLayers
      : getInBounds(bounds)
    drawAnnotationsToCanvas(ctx, capturedAnns, bounds.x, bounds.y)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    const blob = await (await fetch(dataUrl)).blob()
    const url = URL.createObjectURL(blob)

    // Check if any output edges connect from this node
    const outEdges = useCanvasStore.getState().edges.filter(e => e.fromNodeId === node.id)
    if (outEdges.length > 0) {
      const store = useCanvasStore.getState()
      for (const edge of outEdges) {
        const target = store.nodes.find(n => n.id === edge.toNodeId)
        if (target && (target.type === 'prompt' || target.type === 'skill')) {
          store.addInputMedia(edge.toNodeId, [{ url, mediaType: 'image/jpeg', name: 'art-export.jpg' }])
        } else if (target && target.type === 'bin') {
          store.updateNode(target.id, { items: [...target.items, { url, mediaType: 'image/jpeg', prompt: 'Art Node export', sourceNodeId: node.id, timestamp: Date.now() }] })
        }
      }
    } else {
      // Spawn orphan MediaNode
      addMediaNode(url, 'image/jpeg', { x: node.position.x + node.size.w + 30, y: node.position.y }, 'art-export.jpg')
    }
  }

  const mediaH = node.size.h - HEADER_H

  return (
    <div
      data-node={node.id}
      className={`absolute overflow-visible ${animationClass}`}
      style={{ left: node.position.x, top: node.position.y, width: node.size.w, height: node.size.h }}
      onClick={(e) => { e.stopPropagation(); setSelectedNode(node.id) }}
      onContextMenu={onContextMenu}
    >
      <div className={`absolute inset-0 rounded-xl overflow-hidden border transition-colors ${
        isSelected
          ? 'border-[#6c47ff]/60 shadow-[0_0_0_1px_rgba(108,71,255,0.2),0_4px_32px_rgba(0,0,0,0.6)]'
          : 'border-[#6c47ff]/20 shadow-[0_2px_16px_rgba(0,0,0,0.5)]'
      } bg-[#0c0a14]`}>

        {/* Header */}
        <div
          className="flex items-center gap-1.5 px-2 bg-[#110e1c] border-b border-white/8 cursor-grab active:cursor-grabbing"
          style={{ height: HEADER_H }}
          onMouseDown={onHeaderMouseDown}
        >
          <span className="text-[#6c47ff]/70 text-sm select-none">✦</span>
          <span className="text-[10px] text-white/60 flex-1 select-none font-semibold">Art Node</span>
          {artLayers.length > 0 && (
            <span className="text-[9px] text-[#6c47ff]/60 bg-[#6c47ff]/10 px-1.5 rounded-full select-none">
              {artLayers.length} layer{artLayers.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            className="w-4 h-4 flex items-center justify-center rounded text-[9px] text-white/45 hover:text-white/80 hover:bg-white/8 transition-colors"
            onMouseDown={e => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); removeNode(node.id) }}
          >✕</button>
        </div>

        {/* Canvas preview */}
        <div style={{ height: mediaH - 40 }} className="overflow-hidden bg-[#0a0810] flex items-center justify-center">
          {artLayers.length > 0 ? (
            <canvas
              ref={canvasRef}
              className="w-full h-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <div className="text-center px-4">
              <p className="text-[#6c47ff]/30 text-2xl mb-2">✦</p>
              <p className="text-[10px] text-white/25">Shift+drag to select annotations on canvas</p>
            </div>
          )}
        </div>

        {/* Footer: layer list + export */}
        <div className="h-10 flex items-center gap-2 px-2 border-t border-white/6">
          {artLayers.length === 0 ? (
            <p className="text-[9px] text-white/25 flex-1">No layers captured</p>
          ) : (
            <div className="flex items-center gap-1 flex-1 overflow-hidden">
              {artLayers.slice(0, 6).map(a => (
                <span
                  key={a.id}
                  className="w-3 h-3 rounded-sm flex-shrink-0 border border-white/20"
                  style={{ backgroundColor: a.color }}
                  title={a.type}
                />
              ))}
              {artLayers.length > 6 && <span className="text-[9px] text-white/30">+{artLayers.length - 6}</span>}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleExport() }}
            className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-[#6c47ff]/20 hover:bg-[#6c47ff]/35 border border-[#6c47ff]/30 text-[10px] text-[#a78bfa] hover:text-white transition-all"
          >
            Export JPEG
          </button>
        </div>
      </div>

      {/* Output port */}
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full border cursor-crosshair transition-all z-10 bg-[#6c47ff]/60 border-[#6c47ff] hover:bg-[#6c47ff] hover:scale-125"
        onMouseDown={onOutputPortMouseDown}
        title="Drag to connect to a prompt node"
      />

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize opacity-20 hover:opacity-50 transition-opacity z-10"
        onMouseDown={onResizeMouseDown}
        style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '3px 3px', backgroundPosition: 'bottom 3px right 3px', backgroundRepeat: 'repeat' }}
      />
    </div>
  )
}
