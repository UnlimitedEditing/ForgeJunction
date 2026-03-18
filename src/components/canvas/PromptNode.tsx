import React, { useRef, useState, useEffect } from 'react'
import { useCanvasStore, type CanvasNode, OUTPUT_HEADER_H, ITEM_ROW_H, ITEM_IMAGE_H } from '@/stores/canvasStore'
import { useRenderQueueStore } from '@/stores/renderQueue'
import { useWorkflowStore } from '@/stores/workflows'
import { promptAcceptsImageInput, getImageSlotKeys } from '@/lib/inputWhitelist'

const STATUS_DOT: Record<string, string> = {
  idle:   'bg-white/15',
  queued: 'bg-amber-400',
  active: 'bg-brand animate-pulse',
  done:   'bg-emerald-400',
  error:  'bg-red-400',
}

const PORT_R = 6  // half of w-3 h-3 (12px)

interface Props {
  node: CanvasNode
  isSelected: boolean
  isSnapTarget?: boolean
  animationClass?: string
  onStartEdge: (fromNodeId: string, fromWorldPos: { x: number; y: number }, fromType: 'prompt' | 'media', fromItemIndex?: number) => void
  onContextMenu: (e: React.MouseEvent) => void
}

export default function PromptNode({ node, isSelected, isSnapTarget = false, animationClass = '', onStartEdge, onContextMenu }: Props): React.ReactElement {
  const {
    updateNode, setSelectedNode, moveNodes, runNode, cancelNode,
    addInputMedia, toggleOutputCollapsed,
    setSelectedOutputIndex,
  } = useCanvasStore()
  const { workflows } = useWorkflowStore()
  const dragState = useRef<{ sx: number; sy: number; startPos: Record<string, { x: number; y: number }>; ids: string[] } | null>(null)
  const bodyResizeState = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null)

  // Workflow compat check
  const runMatch = node.prompt.match(/\/run:(\S+)/)
  const selectedWorkflow = runMatch ? workflows.find(w => w.slug === runMatch[1]) : null
  const supportsImgInput = !selectedWorkflow || selectedWorkflow.supports_img2img || selectedWorkflow.supports_img2vid

  const allItems = node.runs.flatMap(r => r.items)
  const totalItems = allItems.length
  const hasOutput = totalItems > 0
  const renderProgress = useRenderQueueStore(s =>
    node.renderQueueId ? (s.queue.find(r => r.id === node.renderQueueId)?.progress ?? 0) : 0
  )

  // Input port visibility
  const imageSlotKeys = getImageSlotKeys(node.prompt)       // e.g. ['image1', 'image2']
  const hasSlotPorts  = imageSlotKeys.length > 0
  const showInputPort = !hasSlotPorts && promptAcceptsImageInput(node.prompt)

  // Animate input port in/out — keep it mounted through the exit animation
  const [inputPortMounted, setInputPortMounted] = useState(showInputPort)
  const [inputPortExiting, setInputPortExiting] = useState(false)
  useEffect(() => {
    if (showInputPort) {
      setInputPortExiting(false)
      setInputPortMounted(true)
    } else if (inputPortMounted) {
      setInputPortExiting(true)
      const t = setTimeout(() => { setInputPortMounted(false); setInputPortExiting(false) }, 260)
      return () => clearTimeout(t)
    }
  }, [showInputPort])

  // Track which slug port keys are exiting so they glitch out before unmounting
  const [exitingSlotKeys, setExitingSlotKeys] = useState<Set<string>>(new Set())
  const prevSlotKeys = useRef<string[]>(imageSlotKeys)
  useEffect(() => {
    const removed = prevSlotKeys.current.filter(k => !imageSlotKeys.includes(k))
    prevSlotKeys.current = imageSlotKeys
    if (!removed.length) return
    setExitingSlotKeys(prev => new Set([...prev, ...removed]))
    const t = setTimeout(() => {
      setExitingSlotKeys(prev => { const s = new Set(prev); removed.forEach(k => s.delete(k)); return s })
    }, 260)
    return () => clearTimeout(t)
  }, [imageSlotKeys.join(',')])

  // ── Drag to move ─────────────────────────────────────────────────────────

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

  // ── Resize body ───────────────────────────────────────────────────────────

  function onBodyResizeMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    bodyResizeState.current = { sx: e.clientX, sy: e.clientY, sw: node.size.w, sh: node.size.h }
    function onMove(ev: MouseEvent) {
      if (!bodyResizeState.current) return
      const zoom = useCanvasStore.getState().viewport.zoom
      updateNode(node.id, { size: { w: Math.max(220, bodyResizeState.current.sw + (ev.clientX - bodyResizeState.current.sx) / zoom), h: Math.max(100, bodyResizeState.current.sh + (ev.clientY - bodyResizeState.current.sy) / zoom) } })
    }
    function onUp() { bodyResizeState.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Start edge from a specific output item ────────────────────────────────

  function startEdgeFromItem(itemIndex: number) {
    return (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      const portY = node.position.y + node.size.h + OUTPUT_HEADER_H + itemIndex * ITEM_ROW_H + ITEM_ROW_H / 2
      onStartEdge(node.id, { x: node.position.x + node.size.w, y: portY }, 'prompt', itemIndex)
    }
  }

  // ── Drop files onto node ───────────────────────────────────────────────────

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (!files.length) return
    addInputMedia(node.id, files.map(f => ({ url: URL.createObjectURL(f), mediaType: f.type.startsWith('video/') ? 'video' : 'image', name: f.name })))
  }

  const isRunning = node.status === 'queued' || node.status === 'active'
  const HEADER_H = 36
  const hasQueue = node.inputQueue.length > 0
  const LEFT_W = hasQueue ? 76 : 0
  const bodyContentH = node.size.h - HEADER_H

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
        <span className="text-[11px] text-white/35 font-medium select-none flex-1 tracking-wide">Prompt</span>
        {hasQueue && <span className="text-[9px] text-amber-400/60 select-none tabular-nums">{node.inputQueue.filter(q => q.status === 'pending').length} queued</span>}
        <button
          className={`w-5 h-5 flex items-center justify-center rounded text-xs transition-colors ${isRunning ? 'text-amber-400 hover:text-red-400' : 'text-white/20 hover:text-white/60'}`}
          onMouseDown={e => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); isRunning ? cancelNode(node.id) : runNode(node.id) }}
          title={isRunning ? 'Cancel' : 'Run'}
        >{isRunning ? '◼' : '▶'}</button>
      </div>

      {/* ── Body: input queue + textarea ── */}
      <div className="flex" style={{ height: bodyContentH }}>
        {/* Left input queue panel */}
        {hasQueue && (
          <div className="border-r border-white/8 flex flex-col gap-1 p-1.5 overflow-y-auto bg-[#111] flex-shrink-0" style={{ width: LEFT_W }}>
            {node.inputQueue.map(qi => (
              <div
                key={qi.id}
                className={`relative rounded overflow-hidden flex-shrink-0 ${!supportsImgInput ? 'opacity-30 grayscale' : ''}`}
                style={{ width: LEFT_W - 12, height: LEFT_W - 12 }}
                title={!supportsImgInput ? 'Workflow does not accept image input' : qi.name}
              >
                <img src={qi.url} className="w-full h-full object-cover" draggable={false} />
                <div className={`absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full border border-black ${qi.status === 'done' ? 'bg-emerald-400' : qi.status === 'error' ? 'bg-red-400' : qi.status === 'processing' ? 'bg-brand animate-pulse' : 'bg-white/30'}`} />
              </div>
            ))}
            <div className="flex-shrink-0 rounded border border-dashed border-white/10 flex items-center justify-center text-white/15 text-[10px] select-none" style={{ width: LEFT_W - 12, height: 24 }}>+</div>
          </div>
        )}
        {/* Textarea */}
        <div className="flex flex-col flex-1 min-w-0 relative">
          <textarea
            className="bg-transparent text-white/75 text-xs px-3 py-2.5 resize-none outline-none placeholder-white/15 font-mono leading-relaxed flex-1 block"
            placeholder={"Enter your prompt…\n/run:workflow-slug to pick a workflow"}
            value={node.prompt}
            onChange={e => updateNode(node.id, { prompt: e.target.value })}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            spellCheck={false}
          />
          {node.status === 'error' && node.error && (
            <div className="px-3 pb-1.5 text-[10px] text-red-400/70 truncate leading-tight flex-shrink-0">{node.error}</div>
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

      {/* ── Standard input port (media / pipe) — only when whitelist allows ── */}
      {inputPortMounted && (
        <div
          data-input-port={node.id}
          className={`absolute left-0 -translate-x-1/2 w-3 h-3 rounded-full z-10 pointer-events-none ${
            inputPortExiting
              ? 'animate-port-out bg-amber-500/40 border border-amber-500/60'
              : isSnapTarget
                ? 'animate-port-in bg-violet-400 border border-violet-300 scale-150 shadow-[0_0_8px_rgba(192,100,255,0.8)]'
                : 'animate-port-in bg-amber-500/40 border border-amber-500/60'
          }`}
          style={{ top: node.size.h / 2 - PORT_R }}
        />
      )}

      {/* ── /imageN: slug ports — one per active + exiting slot key ── */}
      {[...new Set([...imageSlotKeys, ...exitingSlotKeys])].map((key, idx) => {
        const isExitingKey = exitingSlotKeys.has(key)
        const activeKeys = [...new Set([...imageSlotKeys, ...exitingSlotKeys])]
        const slotY = Math.round((node.size.h / (activeKeys.length + 1)) * (idx + 1))
        const hasSlug = !!(node.imageSlots?.[key])
        return (
          <div
            key={key}
            data-input-port={node.id}
            data-slot-key={key}
            className="absolute left-0 -translate-x-1/2 z-10 pointer-events-none flex flex-col items-center gap-0.5"
            style={{ top: slotY - PORT_R }}
          >
            <div className={`w-3 h-3 rounded-full border transition-all ${
              isExitingKey
                ? 'animate-port-out bg-rose-500/40 border-rose-500/60'
                : isSnapTarget
                  ? 'animate-port-in bg-violet-400 border-violet-300 scale-150 shadow-[0_0_8px_rgba(192,100,255,0.8)]'
                  : hasSlug
                    ? 'animate-port-in bg-emerald-400/70 border-emerald-400'
                    : 'animate-port-in bg-rose-500/40 border-rose-500/60'
            }`} />
            <span className="text-[7px] text-white/30 select-none -translate-x-full pr-1 whitespace-nowrap">
              /{key}
            </span>
          </div>
        )
      })}

      {/* ── Output port (idle, no results yet) ── */}
      {!hasOutput && !isRunning && (
        <div
          className="absolute right-0 translate-x-1/2 w-3 h-3 rounded-full bg-brand/40 border border-brand/60 cursor-crosshair hover:bg-brand hover:scale-125 transition-all z-10"
          style={{ top: node.size.h / 2 - PORT_R }}
          onMouseDown={(e) => { if (e.button !== 0) return; e.stopPropagation(); onStartEdge(node.id, { x: node.position.x + node.size.w, y: node.position.y + node.size.h / 2 }, 'prompt', undefined) }}
          title="Output — drag to connect"
        />
      )}

      {/* ── Output gallery ── */}
      {(hasOutput || isRunning) && (
        <div className="border-t border-white/8" onMouseDown={e => e.stopPropagation()}>
          {/* Header */}
          <div
            className="flex items-center gap-2 px-3 cursor-pointer hover:bg-white/4 transition-colors select-none"
            style={{ height: OUTPUT_HEADER_H }}
            onClick={(e) => { e.stopPropagation(); toggleOutputCollapsed(node.id) }}
          >
            <span className="text-[9px] text-white/20 w-3">{node.outputCollapsed ? '▶' : '▼'}</span>
            <span className="text-[10px] text-white/30 flex-1">
              Output {node.runs.length} · {totalItems}{isRunning ? ` + 1 rendering` : ''}
            </span>
          </div>

          {!node.outputCollapsed && (
            <div className="overflow-y-auto" style={{ maxHeight: ITEM_ROW_H * 4 }}>
              {/* Completed items */}
              {allItems.map((item, i) => {
                const isActive = node.selectedOutputIndex === i
                return (
                  <div
                    key={i}
                    className="relative flex items-center gap-1.5 pl-2 pr-5"
                    style={{ height: ITEM_ROW_H }}
                  >
                    <span className="text-[8px] text-white/20 tabular-nums w-4 text-right flex-shrink-0 select-none">
                      {i + 1}
                    </span>
                    <div
                      className={`flex-1 rounded-md overflow-hidden cursor-grab active:cursor-grabbing transition-all ${isActive ? 'ring-1 ring-orange-400' : 'opacity-80 hover:opacity-100'}`}
                      style={{ height: ITEM_IMAGE_H }}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation()
                        e.dataTransfer.setData('application/fj-media', JSON.stringify({ url: item.url, mediaType: item.mediaType, name: `output-${i + 1}` }))
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      onClick={(e) => { e.stopPropagation(); setSelectedOutputIndex(node.id, isActive ? null : i) }}
                    >
                      {item.mediaType.includes('video') ? (
                        <video src={item.url} className="w-full h-full object-cover" />
                      ) : (
                        <img src={item.url} className="w-full h-full object-cover" draggable={false} />
                      )}
                    </div>
                    {/* Per-item output port on right edge */}
                    <div
                      className={`absolute right-0 translate-x-1/2 w-3 h-3 rounded-full border cursor-crosshair hover:scale-125 transition-all z-10 animate-port-in ${
                        isActive
                          ? 'bg-orange-400 border-orange-300 shadow-[0_0_6px_rgba(251,146,60,0.8)]'
                          : 'bg-brand/60 border-brand hover:bg-brand'
                      }`}
                      style={{ top: ITEM_ROW_H / 2 - PORT_R }}
                      onMouseDown={startEdgeFromItem(i)}
                      title={`Output ${i + 1} — drag to connect`}
                    />
                  </div>
                )
              })}

              {/* Buffer item — in-progress render */}
              {isRunning && (
                <div
                  className="relative flex items-center gap-1.5 pl-2 pr-5"
                  style={{ height: ITEM_ROW_H }}
                >
                  <span className="text-[8px] text-white/15 tabular-nums w-4 text-right flex-shrink-0 select-none">
                    {totalItems + 1}
                  </span>
                  <div
                    className="flex-1 rounded-md bg-white/5 flex flex-col items-center justify-center gap-1.5"
                    style={{ height: ITEM_IMAGE_H }}
                  >
                    <div className="w-full px-3">
                      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand/50 transition-all duration-1000"
                          style={{ width: `${renderProgress}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[9px] text-white/20 tabular-nums">{renderProgress}%</span>
                  </div>
                  {/* Reserved port — not yet connectable */}
                  <div
                    className="absolute right-0 translate-x-1/2 w-3 h-3 rounded-full bg-white/10 border border-white/20 z-10"
                    style={{ top: ITEM_ROW_H / 2 - PORT_R }}
                    title="Awaiting render…"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
