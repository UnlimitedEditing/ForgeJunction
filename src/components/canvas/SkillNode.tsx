import React, { useRef, useState, useEffect } from 'react'
import SkillsIcon from '@/components/icons/SkillsIcon'
import { useCanvasStore, type CanvasNode, OUTPUT_HEADER_H, ITEM_ROW_H, ITEM_IMAGE_H } from '@/stores/canvasStore'
import { useRenderQueueStore } from '@/stores/renderQueue'

const STATUS_DOT: Record<string, string> = {
  idle:   'bg-white/15',
  queued: 'bg-amber-400',
  active: 'bg-brand animate-pulse',
  done:   'bg-emerald-400',
  error:  'bg-red-400',
}

const PORT_R = 6

interface Props {
  node: CanvasNode
  isSelected: boolean
  isSnapTarget?: boolean
  isNearInputPort?: boolean
  isNearOutputPort?: boolean
  animationClass?: string
  onStartEdge: (fromNodeId: string, fromWorldPos: { x: number; y: number }, fromType: 'prompt' | 'media', fromItemIndex?: number) => void
  onContextMenu: (e: React.MouseEvent) => void
  onOpenLightbox?: (item: { url: string; mediaType: string }) => void
}

export default function SkillNode({
  node, isSelected, isSnapTarget = false, isNearInputPort = false, isNearOutputPort = false,
  animationClass = '', onStartEdge, onContextMenu, onOpenLightbox,
}: Props): React.ReactElement {
  const {
    updateNode, setSelectedNode, moveNodes, runSkillNode, cancelNode,
    addInputMedia, toggleOutputCollapsed, setSelectedOutputIndex,
  } = useCanvasStore()

  const dragState       = useRef<{ sx: number; sy: number; startPos: Record<string, { x: number; y: number }>; ids: string[] } | null>(null)
  const bodyResizeState = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null)
  const galleryScrollRef = useRef<HTMLDivElement>(null)
  const [galleryScroll, setGalleryScroll] = useState(0)

  const allItems = node.runs.flatMap(r => r.items)
  const totalItems = allItems.length
  const hasOutput = totalItems > 0
  const renderProgress = useRenderQueueStore(s =>
    node.renderQueueId ? (s.queue.find(r => r.id === node.renderQueueId)?.progress ?? 0) : 0
  )

  // ── Drag to move ────────────────────────────────────────────────────────────

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
    function onUp() { dragState.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function onBodyResizeMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    bodyResizeState.current = { sx: e.clientX, sy: e.clientY, sw: node.size.w, sh: node.size.h }
    function onMove(ev: MouseEvent) {
      if (!bodyResizeState.current) return
      const zoom = useCanvasStore.getState().viewport.zoom
      updateNode(node.id, { size: {
        w: Math.max(220, bodyResizeState.current.sw + (ev.clientX - bodyResizeState.current.sx) / zoom),
        h: Math.max(100, bodyResizeState.current.sh + (ev.clientY - bodyResizeState.current.sy) / zoom),
      }})
    }
    function onUp() { bodyResizeState.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function startEdgeFromItem(itemIndex: number) {
    return (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      const portY = node.position.y + node.size.h + OUTPUT_HEADER_H + itemIndex * ITEM_ROW_H + ITEM_ROW_H / 2
      onStartEdge(node.id, { x: node.position.x + node.size.w, y: portY }, 'prompt', itemIndex)
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('image/') || f.type.startsWith('video/') || f.type.startsWith('audio/')
    )
    if (!files.length) return
    addInputMedia(node.id, files.map(f => ({
      url: URL.createObjectURL(f),
      mediaType: f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : 'image',
      name: f.name,
    })))
  }

  const isRunning = node.status === 'queued' || node.status === 'active'
  const HEADER_H = 36
  const bodyContentH = node.size.h - HEADER_H

  // Gallery scroll tracking for output
  function onGalleryScroll() {
    if (galleryScrollRef.current) setGalleryScroll(galleryScrollRef.current.scrollTop)
  }

  return (
    <div
      data-node={node.id}
      className={`absolute rounded-xl border overflow-visible ${
        isSnapTarget
          ? 'border-violet-400/80 shadow-[0_0_0_2px_rgba(192,100,255,0.3),0_4px_32px_rgba(0,0,0,0.6)]'
          : isSelected
            ? 'border-brand/60 shadow-[0_0_0_1px_rgba(108,71,255,0.25),0_4px_32px_rgba(0,0,0,0.6)]'
            : 'border-white/10 shadow-[0_2px_16px_rgba(0,0,0,0.5)]'
      } bg-[#141414] ${animationClass}`}
      style={{ left: node.position.x, top: node.position.y, width: node.size.w }}
      onClick={(e) => { e.stopPropagation(); setSelectedNode(node.id) }}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center gap-2 px-3 rounded-t-xl bg-[#1a1a1a] border-b border-white/8 cursor-grab active:cursor-grabbing flex-shrink-0"
        style={{ height: HEADER_H }}
        onMouseDown={onHeaderMouseDown}
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[node.status]}`} />
        <span className="text-[11px] font-medium select-none tracking-wide flex-1">
          <SkillsIcon size={12} className="text-brand/70 flex-shrink-0" />
          <span className="text-white/65 ml-1">{node.skillName ? node.skillName : 'Skill'}</span>
        </span>
        {node.inputQueue.length > 0 && (
          <span className="text-[9px] text-amber-400/60 select-none tabular-nums">
            {node.inputQueue.filter(q => q.status === 'pending').length} queued
          </span>
        )}
        <button
          className={`w-5 h-5 flex items-center justify-center rounded text-xs transition-colors ${isRunning ? 'text-amber-400 hover:text-red-400' : 'text-white/45 hover:text-white/82'}`}
          onMouseDown={e => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); isRunning ? cancelNode(node.id) : runSkillNode(node.id) }}
          title={isRunning ? 'Cancel' : 'Run'}
        >{isRunning ? '◼' : '▶'}</button>
      </div>

      {/* ── Body ── */}
      <div className="flex" style={{ height: bodyContentH }}>
        <div className="flex flex-col flex-1 min-w-0 relative">
          <textarea
            className="bg-transparent text-white/75 text-xs px-3 py-2.5 resize-none outline-none placeholder-white/20 font-mono leading-relaxed flex-1 block"
            placeholder={"Describe Anything.\n(LLM selects the best workflow for you)"}
            value={node.prompt}
            onChange={e => updateNode(node.id, { prompt: e.target.value })}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            spellCheck={false}
          />
          {node.status === 'error' && node.error && (
            <div className="px-3 pb-1.5 text-[10px] text-red-400/70 truncate leading-tight flex-shrink-0">
              {node.error}
            </div>
          )}
          {isRunning && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5 overflow-hidden flex-shrink-0">
              <div
                className="h-full bg-brand transition-all duration-300"
                style={{ width: `${renderProgress}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Body resize handle ── */}
      <div
        className="absolute cursor-se-resize opacity-20 hover:opacity-50 transition-opacity rounded-br-sm"
        style={{
          right: 0, bottom: 0, width: 20, height: 20,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '3px 3px', backgroundPosition: 'bottom 3px right 3px', backgroundRepeat: 'repeat',
        }}
        onMouseDown={onBodyResizeMouseDown}
      />

      {/* ── Input port ── */}
      <div
        data-input-port={node.id}
        className={`absolute left-0 -translate-x-1/2 w-3 h-3 rounded-full z-10 pointer-events-none transition-all ${
          isSnapTarget
            ? 'bg-violet-400 border border-violet-300 scale-150 shadow-[0_0_8px_rgba(192,100,255,0.8)]'
            : isNearInputPort
              ? 'bg-amber-400/90 border border-amber-300 scale-[1.8] shadow-[0_0_6px_rgba(251,191,36,0.7)]'
              : 'bg-brand/30 border border-brand/50'
        }`}
        style={{ top: node.size.h / 2 - PORT_R }}
      />

      {/* ── Idle output port (no results yet) ── */}
      {!hasOutput && !isRunning && (
        <div
          className={`absolute right-0 translate-x-1/2 w-3 h-3 rounded-full cursor-crosshair transition-all z-10 ${
            isNearOutputPort
              ? 'bg-brand border border-brand/80 scale-[1.8] shadow-[0_0_8px_rgba(108,71,255,0.8)]'
              : 'bg-brand/40 border border-brand/60 hover:bg-brand hover:scale-125'
          }`}
          style={{ top: node.size.h / 2 - PORT_R }}
          onMouseDown={(e) => { if (e.button !== 0) return; e.stopPropagation(); onStartEdge(node.id, { x: node.position.x + node.size.w, y: node.position.y + node.size.h / 2 }, 'prompt', undefined) }}
          title="Output — drag to connect"
        />
      )}

      {/* ── Output section ── */}
      {hasOutput && (
        <div
          className="border-t border-white/8"
          style={{ marginTop: 0 }}
        >
          {/* Output header */}
          <div
            className="flex items-center gap-2 px-3 bg-[#111] cursor-pointer select-none"
            style={{ height: OUTPUT_HEADER_H }}
            onClick={() => toggleOutputCollapsed(node.id)}
          >
            <span className="text-[10px] text-white/50 uppercase tracking-widest flex-1">
              {totalItems} result{totalItems !== 1 ? 's' : ''}
            </span>
            <span className="text-white/45 text-[10px]">{node.outputCollapsed ? '▸' : '▾'}</span>
          </div>

          {/* Output gallery */}
          {!node.outputCollapsed && (
            <div
              ref={galleryScrollRef}
              onScroll={onGalleryScroll}
              className="overflow-y-auto"
              style={{ maxHeight: 3 * ITEM_ROW_H + 8 }}
            >
              {allItems.map((item, idx) => {
                const isVideo = item.mediaType?.startsWith('video')
                const isAudio = item.mediaType?.startsWith('audio')
                const isSelected_ = node.selectedOutputIndex === idx
                return (
                  <div
                    key={`${item.url}-${idx}`}
                    className={`flex items-center gap-2 px-2 py-1 border-b border-white/5 last:border-0 cursor-pointer transition-colors ${isSelected_ ? 'bg-brand/10' : 'hover:bg-white/4'}`}
                    style={{ height: ITEM_ROW_H }}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      setSelectedOutputIndex(node.id, isSelected_ ? null : idx)
                    }}
                  >
                    {/* Thumbnail */}
                    <div
                      className="flex-shrink-0 rounded overflow-hidden bg-black/30 relative"
                      style={{ width: ITEM_IMAGE_H, height: ITEM_IMAGE_H }}
                    >
                      {isAudio ? (
                        <div className="w-full h-full flex items-center justify-center text-white/45 text-xl">♪</div>
                      ) : isVideo ? (
                        <video src={item.url} className="w-full h-full object-cover" muted />
                      ) : (
                        <img
                          src={item.url} alt=""
                          className="w-full h-full object-cover"
                          draggable={false}
                          onClick={(e) => { e.stopPropagation(); onOpenLightbox?.({ url: item.url, mediaType: item.mediaType }) }}
                        />
                      )}
                    </div>
                    {/* Per-item output port */}
                    <div
                      className={`absolute right-0 translate-x-1/2 w-3 h-3 rounded-full z-20 cursor-crosshair hover:scale-125 transition-all ${
                        isNearOutputPort
                          ? 'bg-brand border border-brand/80 scale-[1.8] shadow-[0_0_8px_rgba(108,71,255,0.8)]'
                          : 'bg-brand/60 border border-brand hover:bg-brand'
                      }`}
                      style={{ top: node.size.h + OUTPUT_HEADER_H + idx * ITEM_ROW_H + ITEM_ROW_H / 2 - PORT_R }}
                      onMouseDown={startEdgeFromItem(idx)}
                      title={`Output ${idx + 1} — drag to connect`}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
