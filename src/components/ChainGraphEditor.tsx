import React, { useRef, useState, useEffect } from 'react'
import { useChainGraphStore, findComponents, getChainRoot, type ChainNode, type ChainEdge } from '@/stores/chainGraph'
import { useWorkflowStore } from '@/stores/workflows'
import { getInputPorts, inputPortY } from '@/utils/workflowPorts'
import { parseTelegramPrompt, type Workflow } from '@/api/graydient'
import HighlightedPromptInput from '@/components/HighlightedPromptInput'

const NODE_W = 230
const NODE_H = 114   // header (40) + prompt (74)
const PORT_R = 7

// ── Compatibility helpers ─────────────────────────────────────────────────────

type MediaType = 'image' | 'video' | 'audio'

function workflowOutputType(wf: Workflow): MediaType | null {
  if (wf.supports_txt2img || wf.supports_img2img || wf.supports_vid2img) return 'image'
  if (wf.supports_txt2vid || wf.supports_img2vid || wf.supports_vid2vid) return 'video'
  if (wf.supports_txt2wav || wf.supports_vid2wav) return 'audio'
  return null
}

// ── Port position helpers ─────────────────────────────────────────────────────

function inputPortPos(node: ChainNode, portIdx: number, portCount: number) {
  return { x: node.position.x, y: node.position.y + inputPortY(portIdx, portCount) }
}
function outputPortPos(node: ChainNode) {
  return { x: node.position.x + NODE_W, y: node.position.y + NODE_H / 2 }
}
function bezierPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const cp = Math.max(80, Math.abs(to.x - from.x) * 0.5)
  return `M ${from.x} ${from.y} C ${from.x + cp} ${from.y} ${to.x - cp} ${to.y} ${to.x} ${to.y}`
}

function statusColor(status: ChainNode['status']) {
  if (status === 'done') return 'text-green-400'
  if (status === 'error') return 'text-red-400'
  if (status === 'active') return 'text-brand animate-pulse'
  if (status === 'waiting') return 'text-white/30'
  return 'text-white/20'
}
function statusLabel(node: ChainNode) {
  if (node.status === 'done') return '✓ Done'
  if (node.status === 'error') return `✕ ${node.error ?? 'Error'}`
  if (node.status === 'active') return 'Rendering…'
  if (node.status === 'waiting') return 'Waiting…'
  return ''
}

export default function ChainGraphEditor({ onClose }: { onClose: () => void }): React.ReactElement {
  const {
    nodes, edges,
    addNode, removeNode, updateNode,
    addEdge, removeEdge, updateEdge,
    setSelectedNode, toggleSelectNode, selectAllNodes, clearSelection,
    duplicateSelected, reorderChain,
    selectedNodeId, selectedNodeIds,
    chainOrder,
    clearGraph, runChain, isRunning,
    isPaused, setPaused, runStartTime,
  } = useChainGraphStore()
  const { workflows } = useWorkflowStore()

  // Elapsed-time ticker for the mini run bar
  const [elapsedSec, setElapsedSec] = useState(0)
  useEffect(() => {
    if (!runStartTime) { setElapsedSec(0); return }
    setElapsedSec(Math.floor((Date.now() - runStartTime) / 1000))
    const t = setInterval(() => setElapsedSec(Math.floor((Date.now() - runStartTime) / 1000)), 1000)
    return () => clearInterval(t)
  }, [runStartTime])

  // Compute sorted chain list (for badges + run-bar counts)
  const chains = React.useMemo(() => {
    if (nodes.length === 0) return []
    const components = findComponents(nodes, edges)
    return [...components].sort((a, b) => {
      const ra = getChainRoot(a, edges), rb = getChainRoot(b, edges)
      const ia = chainOrder.indexOf(ra.id), ib = chainOrder.indexOf(rb.id)
      if (ia === -1 && ib === -1) return ra.position.x - rb.position.x
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
  }, [nodes, edges, chainOrder])

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // Node enter / exit animations
  const mountedNodeIds = useRef<Set<string>>(new Set())
  const [dyingNodeIds, setDyingNodeIds] = useState<Set<string>>(new Set())

  function handleDeleteNode(id: string) {
    setDyingNodeIds(prev => new Set([...prev, id]))
    setTimeout(() => {
      removeNode(id)
      setDyingNodeIds(prev => { const n = new Set(prev); n.delete(id); return n })
    }, 250)
  }

  const canvasRef = useRef<HTMLDivElement>(null)
  const panRef = useRef({ x: 80, y: 60 })
  const zoomRef = useRef(1)
  const [, forceUpdate] = useState(0)
  const rerender = () => forceUpdate(v => v + 1)

  // Pending edge (dragging from output port)
  const pendingEdgeRef = useRef<{ fromNodeId: string; currentPos: { x: number; y: number } } | null>(null)

  // Workflow picker
  const [pickerTargetNodeId, setPickerTargetNodeId] = useState<string | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')

  // Incompatible port flash: "nodeId:portField"
  const [incompatiblePortId, setIncompatiblePortId] = useState<string | null>(null)

  // Controlnet slug editing on edges
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null)
  const [edgeSlugDraft, setEdgeSlugDraft] = useState('')

  // Mark-as-field state
  const [nodeFieldMark, setNodeFieldMark] = useState<{ nodeId: string; start: number; end: number } | null>(null)
  const [markFieldLabel, setMarkFieldLabel] = useState('')

  function confirmMark() {
    if (!nodeFieldMark || !markFieldLabel.trim()) return
    const { nodeId, start, end } = nodeFieldMark
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    const fieldId = markFieldLabel.trim().toLowerCase().replace(/\s+/g, '_')
    const newPrompt = node.prompt.slice(0, start) + `{{${fieldId}}}` + node.prompt.slice(end)
    updateNode(nodeId, { prompt: newPrompt })
    setNodeFieldMark(null)
    setMarkFieldLabel('')
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement

      if (e.key === 'Escape') {
        if (editingEdgeId !== null) { setEditingEdgeId(null); return }
        if (pickerTargetNodeId !== null) { setPickerTargetNodeId(null); setPickerSearch('') }
        else onClose()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
        selectedNodeIds.forEach(id => handleDeleteNode(id))
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !inInput) {
        e.preventDefault()
        selectAllNodes()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && !inInput) {
        e.preventDefault()
        duplicateSelected()
        return
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedNodeIds, pickerTargetNodeId, editingEdgeId, onClose, removeNode, selectAllNodes, duplicateSelected])

  function toCanvas(clientX: number, clientY: number) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (clientY - rect.top - panRef.current.y) / zoomRef.current,
    }
  }

  function handleCanvasMouseDown(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest('[data-node]') && !target.closest('[data-port]') && !target.closest('[data-edge-label]')) {
      if (editingEdgeId) { setEditingEdgeId(null); return }
      clearSelection()
      const startPan = { ...panRef.current }
      const startMouse = { x: e.clientX, y: e.clientY }
      function onMove(ev: MouseEvent) {
        panRef.current = {
          x: startPan.x + ev.clientX - startMouse.x,
          y: startPan.y + ev.clientY - startMouse.y,
        }
        rerender()
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }
  }

  function handleNodeMouseDown(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation()
    if (e.shiftKey) toggleSelectNode(nodeId)
    else setSelectedNode(nodeId)
    const node = nodes.find(n => n.id === nodeId)!
    const startPos = { ...node.position }
    const startMouse = { x: e.clientX, y: e.clientY }
    function onMove(ev: MouseEvent) {
      updateNode(nodeId, {
        position: {
          x: Math.max(0, startPos.x + (ev.clientX - startMouse.x) / zoomRef.current),
          y: Math.max(0, startPos.y + (ev.clientY - startMouse.y) / zoomRef.current),
        }
      })
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function handleOutputPortMouseDown(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation()
    const startPos = toCanvas(e.clientX, e.clientY)
    pendingEdgeRef.current = { fromNodeId: nodeId, currentPos: startPos }
    rerender()
    function onMove(ev: MouseEvent) {
      if (!pendingEdgeRef.current) return
      pendingEdgeRef.current = { ...pendingEdgeRef.current, currentPos: toCanvas(ev.clientX, ev.clientY) }
      rerender()
    }
    function onUp() {
      pendingEdgeRef.current = null
      rerender()
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function handleInputPortMouseUp(e: React.MouseEvent, toNodeId: string, toPortField: string) {
    e.stopPropagation()
    if (!pendingEdgeRef.current || pendingEdgeRef.current.fromNodeId === toNodeId) return

    const fromNode = nodes.find(n => n.id === pendingEdgeRef.current!.fromNodeId)
    const toNode   = nodes.find(n => n.id === toNodeId)

    // Port-specific compatibility check
    if (fromNode?.workflowSlug && toNode?.workflowSlug) {
      const fromWf = workflows.find(w => w.slug === fromNode.workflowSlug)
      if (fromWf) {
        const outType = workflowOutputType(fromWf)
        const ports = getInputPorts(toNode.workflowSlug)
        const port = ports.find(p => p.field === toPortField)
        if (outType && port && port.mediaType !== 'any' && port.mediaType !== outType) {
          setIncompatiblePortId(`${toNodeId}:${toPortField}`)
          setTimeout(() => setIncompatiblePortId(null), 600)
          return
        }
      }
    }

    addEdge(pendingEdgeRef.current.fromNodeId, toNodeId, toPortField)
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    zoomRef.current = Math.min(2, Math.max(0.25, zoomRef.current * factor))
    rerender()
  }

  function addNewNode() {
    const cx = (canvasRef.current!.clientWidth / 2 - panRef.current.x) / zoomRef.current
    const cy = (canvasRef.current!.clientHeight / 2 - panRef.current.y) / zoomRef.current
    addNode('', '', {
      x: cx - NODE_W / 2 + nodes.length * 24,
      y: cy - NODE_H / 2 + nodes.length * 16,
    })
  }

  async function handleCanvasDoubleClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('[data-node]') || target.closest('[data-port]') || target.closest('[data-edge-label]')) return

    const pos = toCanvas(e.clientX, e.clientY)

    let clipText = ''
    try { clipText = (await navigator.clipboard.readText()).trim() } catch { /* no permission or empty */ }

    let prompt = ''
    let workflowSlug = ''
    let workflowName = ''

    if (clipText) {
      const hasTelegramNotation = /\/run:|^\/wf\b/i.test(clipText)
      if (hasTelegramNotation) {
        const parsed = parseTelegramPrompt(clipText)
        // Reconstruct prompt with any remaining /key:value options so chain render handles them
        const optionStr = Object.entries(parsed.optionsDict).map(([k, v]) => `/${k}:${v}`).join(' ')
        prompt = [optionStr, parsed.prompt].filter(Boolean).join(' ').trim()
        if (parsed.workflowSlug) {
          workflowSlug = parsed.workflowSlug
          const wf = workflows.find(w => w.slug === workflowSlug)
          workflowName = wf?.name ?? workflowSlug
        }
      } else {
        prompt = clipText
      }
    }

    const nodeId = addNode(workflowSlug, workflowName, { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 })
    if (prompt) updateNode(nodeId, { prompt })
  }

  function openPickerForNode(nodeId: string) {
    setPickerTargetNodeId(nodeId)
    setPickerSearch('')
  }

  function handlePickerSelect(slug: string, name: string) {
    if (pickerTargetNodeId !== null) {
      updateNode(pickerTargetNodeId, { workflowSlug: slug, workflowName: name })
    }
    setPickerTargetNodeId(null)
    setPickerSearch('')
  }

  function commitEdgeSlug(edgeId: string) {
    updateEdge(edgeId, { controlnetSlug: edgeSlugDraft.trim() || undefined })
    setEditingEdgeId(null)
  }

  const pendingEdge = pendingEdgeRef.current
  const filteredWorkflows = workflows.filter(w =>
    w.name.toLowerCase().includes(pickerSearch.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-neutral-900/95 px-4 py-2 flex-shrink-0">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/40">Chain Builder</span>
        <div className="flex-1" />
        {selectedNodeIds.length > 1 && (
          <button
            onClick={duplicateSelected}
            className="rounded px-2.5 py-1 text-xs text-white/40 hover:text-white hover:bg-white/8 transition-colors"
            title="Duplicate selection (Ctrl+D)"
          >
            ⧉ Copy {selectedNodeIds.length}
          </button>
        )}
        {nodes.length > 0 && (
          <button
            onClick={clearGraph}
            disabled={isRunning}
            className="rounded px-2.5 py-1 text-xs text-white/30 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40"
          >
            Clear
          </button>
        )}
        <button
          onClick={addNewNode}
          disabled={isRunning}
          className="rounded bg-white/8 px-2.5 py-1 text-xs text-white/60 hover:bg-white/12 hover:text-white transition-colors disabled:opacity-40"
        >
          + Add Node
        </button>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-white/30 hover:text-white hover:bg-white/8 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* ── Mini run bar ── */}
      <div className="flex items-center gap-3 border-b border-white/5 bg-neutral-950/60 px-4 py-1.5 flex-shrink-0">
        <button
          onClick={isRunning ? () => setPaused(!isPaused) : runChain}
          disabled={!isRunning && nodes.length === 0}
          className={`rounded px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            isRunning
              ? isPaused
                ? 'bg-brand/20 text-brand hover:bg-brand/30'
                : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
              : 'bg-brand px-3 text-white hover:bg-brand/80'
          }`}
        >
          {isRunning ? (isPaused ? '▶ Resume' : '⏸ Pause') : '▶ Run Chain'}
        </button>
        {isRunning && (
          <>
            <span className="text-xs font-mono text-white/50">
              ⏱ {formatTime(elapsedSec)}
            </span>
            <span className="text-xs text-white/30">
              {nodes.filter(n => n.status === 'done' || n.status === 'error').length}/{nodes.length} nodes
            </span>
            <span className="text-xs text-white/20">
              {chains.length > 1 ? `${chains.length} chains` : ''}
            </span>
          </>
        )}
        {!isRunning && nodes.length > 0 && (
          <span className="text-xs text-white/20">
            {nodes.length} node{nodes.length !== 1 ? 's' : ''} · {chains.length} chain{chains.length !== 1 ? 's' : ''}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-xs text-white/15">Shift+click multi-select · Ctrl+D duplicate · Del remove</span>
      </div>

      {/* ── Canvas ── */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden cursor-default select-none"
        style={{ background: '#0d0d14' }}
        onMouseDown={handleCanvasMouseDown}
        onDoubleClick={handleCanvasDoubleClick}
        onWheel={handleWheel}
      >
        {/* Dot grid */}
        <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
          <defs>
            <pattern
              id="cg-grid"
              width={24 * zoomRef.current}
              height={24 * zoomRef.current}
              patternUnits="userSpaceOnUse"
              x={panRef.current.x % (24 * zoomRef.current)}
              y={panRef.current.y % (24 * zoomRef.current)}
            >
              <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.06)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cg-grid)" />
        </svg>

        {/* Transform layer */}
        <div
          className="absolute"
          style={{
            left: 0, top: 0,
            transform: `translate(${panRef.current.x}px,${panRef.current.y}px) scale(${zoomRef.current})`,
            transformOrigin: '0 0',
            width: 8000, height: 8000,
          }}
        >
          {/* SVG edges */}
          <svg
            className="absolute pointer-events-none"
            style={{ left: 0, top: 0, width: 8000, height: 8000, overflow: 'visible' }}
          >
            {edges.map(edge => {
              const fn = nodes.find(n => n.id === edge.fromNodeId)
              const tn = nodes.find(n => n.id === edge.toNodeId)
              if (!fn || !tn) return null
              const toPorts = getInputPorts(tn.workflowSlug)
              const toPortIdx = toPorts.findIndex(p => p.field === (edge.toPortField ?? 'init_image_filename'))
              const toPort = toPorts[toPortIdx >= 0 ? toPortIdx : 0]
              const from = outputPortPos(fn)
              const to = inputPortPos(tn, toPortIdx >= 0 ? toPortIdx : 0, toPorts.length)
              const isControlnet = toPort?.isControlnet ?? false
              const strokeColor = isControlnet ? 'rgba(251,146,60,0.55)' : 'rgba(108,71,255,0.5)'
              return (
                <g key={edge.id}>
                  <path d={bezierPath(from, to)} stroke={strokeColor} strokeWidth={2} fill="none" />
                  {/* Wide transparent hit area — click to delete */}
                  <path
                    d={bezierPath(from, to)}
                    stroke="transparent" strokeWidth={14} fill="none"
                    className="cursor-pointer"
                    style={{ pointerEvents: 'stroke' }}
                    onClick={() => removeEdge(edge.id)}
                  />
                </g>
              )
            })}
            {/* Pending edge */}
            {pendingEdge && (() => {
              const fn = nodes.find(n => n.id === pendingEdge.fromNodeId)
              if (!fn) return null
              return (
                <path
                  d={bezierPath(outputPortPos(fn), pendingEdge.currentPos)}
                  stroke="rgba(108,71,255,0.35)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  fill="none"
                />
              )
            })()}
          </svg>

          {/* ── Edge labels / controlnet slug editors ── */}
          {edges.map(edge => {
            const fn = nodes.find(n => n.id === edge.fromNodeId)
            const tn = nodes.find(n => n.id === edge.toNodeId)
            if (!fn || !tn) return null
            const toPorts = getInputPorts(tn.workflowSlug)
            const toPortIdx = toPorts.findIndex(p => p.field === (edge.toPortField ?? 'init_image_filename'))
            const toPort = toPorts[toPortIdx >= 0 ? toPortIdx : 0]
            if (!toPort) return null
            const from = outputPortPos(fn)
            const to = inputPortPos(tn, toPortIdx >= 0 ? toPortIdx : 0, toPorts.length)
            const midX = (from.x + to.x) / 2
            const midY = (from.y + to.y) / 2
            const isEditing = editingEdgeId === edge.id

            return (
              <div
                key={`label-${edge.id}`}
                data-edge-label
                className="absolute flex items-center"
                style={{ left: midX, top: midY, transform: 'translate(-50%, -50%)', zIndex: 10 }}
                onMouseDown={e => e.stopPropagation()}
              >
                {toPort.isControlnet ? (
                  isEditing ? (
                    <div className="flex items-center gap-1 bg-neutral-800 border border-orange-500/50 rounded px-1.5 py-0.5 shadow-xl">
                      <span className="text-[9px] text-white/40 shrink-0">slug:</span>
                      <input
                        autoFocus
                        value={edgeSlugDraft}
                        onChange={e => setEdgeSlugDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitEdgeSlug(edge.id)
                          if (e.key === 'Escape') setEditingEdgeId(null)
                        }}
                        placeholder="e.g. ctrl1"
                        className="w-24 bg-transparent text-[10px] text-white outline-none placeholder-white/20"
                      />
                      <button
                        onClick={() => commitEdgeSlug(edge.id)}
                        className="text-orange-300 text-[10px] hover:text-orange-200"
                        title="Confirm slug"
                      >✓</button>
                      <button
                        onClick={() => setEditingEdgeId(null)}
                        className="text-white/30 text-[10px] hover:text-white/60"
                        title="Cancel"
                      >✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingEdgeId(edge.id); setEdgeSlugDraft(edge.controlnetSlug ?? '') }}
                      title={edge.controlnetSlug
                        ? `Controlnet slug: ${edge.controlnetSlug} — click to edit`
                        : 'Controlnet edge — click to set slug (required for render)'}
                      className={`text-[9px] rounded px-1.5 py-0.5 border transition-colors ${
                        edge.controlnetSlug
                          ? 'bg-orange-900/40 border-orange-500/50 text-orange-300 hover:bg-orange-900/60'
                          : 'bg-neutral-900/80 border-orange-500/20 text-orange-400/40 hover:border-orange-500/50 hover:text-orange-300/70'
                      }`}
                    >
                      {edge.controlnetSlug ? `⊕ ${edge.controlnetSlug}` : '⊕ set slug'}
                    </button>
                  )
                ) : (
                  /* Non-controlnet: show port label as a dim read-only badge */
                  <span
                    className="text-[9px] text-white/20 bg-neutral-950/70 border border-white/5 px-1.5 py-0.5 rounded pointer-events-none select-none"
                    title={toPort.tooltip}
                  >
                    {toPort.label}
                  </span>
                )}
              </div>
            )
          })}

          {/* Chain number badges above root nodes */}
          {chains.length > 1 && chains.map((chain, idx) => {
            const root = getChainRoot(chain, edges)
            return (
              <div
                key={`badge-${root.id}`}
                className="absolute flex items-center gap-1 select-none"
                style={{ left: root.position.x + NODE_W / 2 - 20, top: root.position.y - 28 }}
                onMouseDown={e => e.stopPropagation()}
              >
                <button
                  onClick={() => reorderChain(root.id, 'up')}
                  disabled={idx === 0}
                  className="text-white/20 hover:text-white/60 disabled:opacity-0 text-[10px] leading-none transition-colors"
                >▲</button>
                <span className="rounded-full bg-brand/80 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center shadow-lg">
                  {idx + 1}
                </span>
                <button
                  onClick={() => reorderChain(root.id, 'down')}
                  disabled={idx === chains.length - 1}
                  className="text-white/20 hover:text-white/60 disabled:opacity-0 text-[10px] leading-none transition-colors"
                >▼</button>
              </div>
            )
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const isSelected = selectedNodeIds.includes(node.id)
            const showResult = node.status === 'done' && node.resultUrl
            const inputPorts = getInputPorts(node.workflowSlug)

            const isDying = dyingNodeIds.has(node.id)
            const isNew = !mountedNodeIds.current.has(node.id)
            if (isNew && !isDying) mountedNodeIds.current.add(node.id)
            const animClass = isDying ? 'animate-node-out' : isNew ? 'animate-node-in' : ''

            return (
              <div
                key={node.id}
                data-node={node.id}
                className={`absolute rounded-xl border shadow-2xl transition-colors ${animClass} ${
                  isSelected ? 'border-brand/60 ring-1 ring-brand/25' : 'border-white/10 hover:border-white/20'
                } bg-neutral-900`}
                style={{ left: node.position.x, top: node.position.y, width: NODE_W }}
              >
                {/* ── Input ports (one per workflow input slot) ── */}
                {inputPorts.map((port, portIdx) => {
                  const portKey = `${node.id}:${port.field}`
                  const isIncompat = incompatiblePortId === portKey
                  const hasEdge = edges.some(e => e.toNodeId === node.id && (e.toPortField ?? 'init_image_filename') === port.field)
                  const portY = inputPortY(portIdx, inputPorts.length)
                  const mediaIcon = port.mediaType === 'audio' ? '♪' : port.mediaType === 'video' ? '▶' : ''
                  const tooltip = `${port.label}${mediaIcon ? ` (${port.mediaType})` : ''}${port.isControlnet ? ' · Controlnet' : ''} — ${port.tooltip}`
                  return (
                    <div
                      key={port.field}
                      data-port="in"
                      title={tooltip}
                      className={`absolute rounded-full border-2 transition-colors ${
                        isIncompat
                          ? 'border-red-500 bg-red-900/60'
                          : hasEdge
                            ? port.isControlnet
                              ? 'border-orange-400/80 bg-orange-900/40'
                              : 'border-brand/80 bg-brand/30'
                            : port.isControlnet
                              ? 'border-orange-500/40 bg-neutral-800 hover:border-orange-400 hover:bg-orange-900/30'
                              : 'border-white/30 bg-neutral-800 hover:border-brand hover:bg-brand/30'
                      }`}
                      style={{
                        left: -PORT_R,
                        top: portY - PORT_R,
                        width: PORT_R * 2,
                        height: PORT_R * 2,
                        cursor: 'crosshair',
                      }}
                      onMouseUp={(e) => handleInputPortMouseUp(e, node.id, port.field)}
                    />
                  )
                })}

                {/* ── Output port ── */}
                <div
                  data-port="out"
                  title="Output — drag to connect to another node's input"
                  className="absolute rounded-full border-2 border-brand/60 bg-brand/25 hover:bg-brand hover:border-brand transition-colors"
                  style={{ right: -PORT_R, top: NODE_H / 2 - PORT_R, width: PORT_R * 2, height: PORT_R * 2, cursor: 'crosshair' }}
                  onMouseDown={(e) => handleOutputPortMouseDown(e, node.id)}
                />

                {/* ── Header — drag handle ── */}
                <div
                  className="flex items-center justify-between px-3 py-2.5 border-b border-white/8 cursor-grab active:cursor-grabbing rounded-t-xl"
                  style={{ height: 40 }}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                >
                  {node.workflowSlug ? (
                    <button
                      className="text-xs font-semibold text-white/80 hover:text-white truncate flex-1 leading-none text-left transition-colors"
                      title="Click to change workflow"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); openPickerForNode(node.id) }}
                    >
                      {node.workflowName}
                    </button>
                  ) : (
                    <button
                      className="text-xs text-brand/70 hover:text-brand truncate flex-1 leading-none text-left transition-colors"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); openPickerForNode(node.id) }}
                    >
                      Pick workflow…
                    </button>
                  )}
                  <button
                    className="text-white/20 hover:text-red-400 transition-colors ml-2 flex-shrink-0 leading-none text-xs"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id) }}
                  >
                    ✕
                  </button>
                </div>

                {/* ── Prompt ── */}
                <HighlightedPromptInput
                  value={node.prompt}
                  onChange={(v) => updateNode(node.id, { prompt: v })}
                  placeholder="Describe what to generate…"
                  rows={3}
                  wrapperClassName="px-3 py-2"
                  textClassName="text-xs leading-relaxed"
                  style={{ height: 74 }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); e.shiftKey ? toggleSelectNode(node.id) : setSelectedNode(node.id) }}
                  onMouseUp={(e) => {
                    const el = e.currentTarget
                    if (el.selectionStart !== el.selectionEnd) {
                      setNodeFieldMark({ nodeId: node.id, start: el.selectionStart, end: el.selectionEnd })
                      setMarkFieldLabel('')
                    }
                  }}
                  onKeyUp={(e) => {
                    const el = e.currentTarget
                    if (el.selectionStart !== el.selectionEnd) {
                      setNodeFieldMark({ nodeId: node.id, start: el.selectionStart, end: el.selectionEnd })
                      setMarkFieldLabel('')
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      setNodeFieldMark(prev => prev?.nodeId === node.id ? null : prev)
                    }, 150)
                  }}
                />

                {/* ── Mark-as-field UI ── */}
                {nodeFieldMark?.nodeId === node.id && (
                  <div className="px-3 pb-2 flex items-center gap-1.5" onMouseDown={e => e.stopPropagation()}>
                    {markFieldLabel === '' ? (
                      <button
                        onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
                        onClick={() => setMarkFieldLabel(' ')}
                        className="text-xs rounded bg-brand/15 border border-brand/30 px-2 py-0.5 text-brand hover:bg-brand/25 transition-colors"
                      >
                        🏷 Mark as field
                      </button>
                    ) : (
                      <>
                        <input
                          autoFocus
                          value={markFieldLabel.trim() === '' ? '' : markFieldLabel}
                          onChange={e => setMarkFieldLabel(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') confirmMark()
                            if (e.key === 'Escape') { setNodeFieldMark(null); setMarkFieldLabel('') }
                          }}
                          onMouseDown={e => e.stopPropagation()}
                          placeholder="Field name…"
                          className="flex-1 rounded bg-neutral-800 px-2 py-0.5 text-xs text-white outline-none ring-1 ring-brand"
                        />
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={confirmMark}
                          disabled={!markFieldLabel.trim()}
                          className="text-xs rounded bg-brand px-2 py-0.5 text-white disabled:opacity-40"
                        >
                          ✓
                        </button>
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={() => { setNodeFieldMark(null); setMarkFieldLabel('') }}
                          className="text-xs text-white/30 hover:text-white"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* ── Status + result ── */}
                {node.status !== 'idle' && (
                  <div className="border-t border-white/8 px-3 py-2 flex flex-col gap-1.5">
                    <span className={`text-xs font-mono ${statusColor(node.status)}`}>
                      {statusLabel(node)}
                    </span>
                    {showResult && (
                      <img
                        src={node.resultUrl!}
                        alt="result"
                        className="w-full rounded object-cover"
                        style={{ maxHeight: 120 }}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Empty state */}
          {nodes.length === 0 && (
            <div
              className="absolute flex flex-col items-center gap-3 text-center"
              style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}
            >
              <p className="text-white/20 text-sm leading-relaxed">
                Add workflow nodes and connect them<br />to build a render chain
              </p>
              <button
                onClick={addNewNode}
                className="rounded-lg bg-white/8 px-4 py-2 text-xs text-white/50 hover:bg-white/12 hover:text-white transition-colors"
              >
                + Add First Node
              </button>
            </div>
          )}
        </div>

        {/* Controls hint */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-4 text-white/15 text-xs pointer-events-none">
          <span>Double-click to add node</span>
          <span>·</span>
          <span>Drag canvas to pan</span>
          <span>·</span>
          <span>Scroll to zoom</span>
          <span>·</span>
          <span>Drag ● to connect</span>
          <span>·</span>
          <span>Click edge to delete</span>
        </div>
      </div>

      {/* ── Workflow picker ── */}
      {pickerTargetNodeId !== null && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50"
          onClick={() => { setPickerTargetNodeId(null); setPickerSearch('') }}
        >
          <div
            className="w-80 rounded-xl bg-neutral-800 border border-white/10 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
              <input
                autoFocus
                type="text"
                placeholder="Search workflows…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="flex-1 bg-neutral-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-brand"
              />
              <button
                onClick={() => { setPickerTargetNodeId(null); setPickerSearch('') }}
                className="text-white/30 hover:text-white text-xs transition-colors"
              >
                ✕
              </button>
            </div>
            <ul className="max-h-72 overflow-y-auto py-1">
              {filteredWorkflows.slice(0, 50).map(wf => (
                <li key={wf.id}>
                  <button
                    onClick={() => handlePickerSelect(wf.slug, wf.name)}
                    className="w-full text-left px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    {wf.name}
                  </button>
                </li>
              ))}
              {filteredWorkflows.length === 0 && (
                <li className="px-3 py-3 text-xs text-white/30">No workflows found</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
