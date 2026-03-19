import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useCanvasStore, type CanvasNode, OUTPUT_HEADER_H, outputPortRelY } from '@/stores/canvasStore'
import PromptNode from './PromptNode'
import SkillNode from './SkillNode'
import SkillsBrowserNode from './SkillsBrowserNode'
import BinNode from './BinNode'
import MediaNode from './MediaNode'
import MethodBrowserNode from './MethodBrowserNode'
import ChainCanvasNode from './ChainCanvasNode'
import RadialMenu, { type RadialMenuModifiers } from './RadialMenu'
import MediaLightbox from './MediaLightbox'

const MIN_ZOOM = 0.08
const MAX_ZOOM = 5

interface PendingEdge {
  fromNodeId: string
  fromNodeType: 'prompt' | 'media'
  fromPos: { x: number; y: number }
  currentPos: { x: number; y: number }
  snapToNodeId: string | null
  fromItemIndex: number | null
}

interface RadialMenuState {
  screenX: number; screenY: number
  worldX: number; worldY: number
  modifiers: RadialMenuModifiers
  context: 'canvas' | 'node'
  nodeId?: string
}

interface Props { onOpenSettings?: () => void }

// ── Edge position helpers (must stay in sync with PromptNode.tsx) ──────────

function promptOutputPortWorld(node: CanvasNode, fromItemIndex: number | null): { x: number; y: number } {
  const allItems = node.runs.flatMap(r => r.items)
  return {
    x: node.position.x + node.size.w,
    y: node.position.y + outputPortRelY(node, fromItemIndex, allItems.length),
  }
}

function genericOutputPortWorld(node: CanvasNode): { x: number; y: number } {
  return { x: node.position.x + node.size.w, y: node.position.y + node.size.h / 2 }
}

function inputPortWorld(node: CanvasNode): { x: number; y: number } {
  return { x: node.position.x, y: node.position.y + node.size.h / 2 }
}

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const cp = Math.max(50, Math.abs(to.x - from.x) * 0.45)
  return `M ${from.x} ${from.y} C ${from.x + cp} ${from.y} ${to.x - cp} ${to.y} ${to.x} ${to.y}`
}

// Route an edge around any node whose bounding box intersects the straight line path
function avoidedEdgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  allNodes: CanvasNode[],
  fromNodeId: string,
  toNodeId: string,
): string {
  const cp = Math.max(50, Math.abs(to.x - from.x) * 0.45)
  let vertOffset = 0
  const pathLeft  = Math.min(from.x, to.x) + 10
  const pathRight = Math.max(from.x, to.x) - 10
  for (const n of allNodes) {
    if (n.id === fromNodeId || n.id === toNodeId) continue
    if (n.position.x + n.size.w < pathLeft || n.position.x > pathRight) continue
    const cx = n.position.x + n.size.w / 2
    const t  = Math.max(0, Math.min(1, (cx - from.x) / ((to.x - from.x) || 1)))
    const lineY = from.y + (to.y - from.y) * t
    if (lineY > n.position.y - 15 && lineY < n.position.y + n.size.h + 15) {
      const delta = n.position.y + n.size.h + 40 - Math.max(from.y, to.y)
      vertOffset = Math.max(vertOffset, delta)
    }
  }
  return `M ${from.x} ${from.y} C ${from.x + cp} ${from.y + vertOffset} ${to.x - cp} ${to.y + vertOffset} ${to.x} ${to.y}`
}

// Pending wire physics — sags when reeled back toward origin (slack = excess wire)
function physicsPendingPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  slack: number,
): string {
  const cp   = Math.max(50, Math.abs(to.x - from.x) * 0.45)
  const sagY = Math.min(slack * 0.3, 180)
  return `M ${from.x} ${from.y} C ${from.x + cp} ${from.y + sagY} ${to.x - cp} ${to.y + sagY} ${to.x} ${to.y}`
}

// Returns cleaned clipboard text suitable for a prompt, or null if it looks like non-prompt content.
// Strips /run:xxx commands but preserves render params like /images:, /size:, /steps: etc.
function sanitizeClipboardForPrompt(raw: string): string | null {
  // Strip workflow run commands
  let text = raw.replace(/\/run:\S+/gi, '').trim()
  if (!text) return null
  // URL
  if (/^\w+:\/\//i.test(text)) return null
  // All numeric / punctuation with no letters
  if (/^[\d\s.,()[\]{}\-+*/=]+$/.test(text)) return null
  // Single token (no spaces) — probably a hash, slug, or bare command
  if (!/\s/.test(text)) return null
  // Pure command string — every token starts with / and has no prose words
  const tokens = text.split(/\s+/).filter(Boolean)
  const proseTokens = tokens.filter(t => !t.startsWith('/') && t.length > 1)
  if (proseTokens.length === 0) return null
  return text
}

function isEdgeHighlighted(edge: { fromItemIndex: number | null }, fromNode: CanvasNode): boolean {
  if (edge.fromItemIndex === null) return false
  return fromNode.selectedOutputIndex === edge.fromItemIndex
}

// ── Component ──────────────────────────────────────────────────────────────

export default function InfiniteCanvas({ onOpenSettings }: Props): React.ReactElement {
  const {
    nodes, edges, viewport, setViewport,
    addPromptNode, addSkillNode, addSkillsBrowserNode, addBinNode, addMediaNode, addMethodNode, addChainNode, addInputMedia,
    updateNode, removeNode, duplicateNode, addEdge,
    setSelectedNode, setSelectedNodes, selectedNodeIds,
    runNode, runSkillNode, cancelNode, runAllNodes, cancelAllNodes,
    clearCanvas,
  } = useCanvasStore()

  const containerRef  = useRef<HTMLDivElement>(null)
  const viewportRef   = useRef(viewport)
  const nodesRef      = useRef(nodes)
  const animFrameRef  = useRef<number | null>(null)
  useEffect(() => { viewportRef.current = viewport }, [viewport])
  useEffect(() => { nodesRef.current = nodes },       [nodes])

  const [lightboxItem, setLightboxItem] = useState<{ url: string; mediaType: string } | null>(null)

  const [isPanning,   setIsPanning]   = useState(false)
  const [panStart,    setPanStart]    = useState<{ mx: number; my: number; vpx: number; vpy: number } | null>(null)
  const [spaceDown,   setSpaceDown]   = useState(false)
  const [pendingEdge, setPendingEdge] = useState<PendingEdge | null>(null)
  const [radialMenu,  setRadialMenu]  = useState<RadialMenuState | null>(null)
  const pendingMenuRef = useRef<RadialMenuState | null>(null)

  // Marquee (rubber-band) selection
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const marqueeRef       = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const marqueeStartRef  = useRef<{ sx: number; sy: number } | null>(null)
  const marqueeActiveRef = useRef(false)
  const justDidMarqueeRef = useRef(false)

  // Port proximity detection
  const [nearInputNodeId,  setNearInputNodeId]  = useState<string | null>(null)
  const [nearOutputNodeId, setNearOutputNodeId] = useState<string | null>(null)
  const nearInputNodeIdRef  = useRef<string | null>(null)
  const nearOutputNodeIdRef = useRef<string | null>(null)

  // Wire physics — max distance ever reached during current pending drag
  const pendingMaxReachRef = useRef<number>(0)

  // Mirror pendingEdge into a ref so the mousemove/mouseup handlers can read
  // current values without being included in the useEffect dependency array.
  // This prevents the effect from re-subscribing (and briefly losing listeners)
  // on every mouse-move state update — which was causing wires to drop.
  const pendingEdgeRef = useRef<PendingEdge | null>(null)
  pendingEdgeRef.current = pendingEdge
  const isDraggingEdge = pendingEdge !== null

  // Connection pulse — track newly-added edges
  const [pulsingEdgeIds, setPulsingEdgeIds] = useState<Set<string>>(new Set())
  const prevEdgeIdsRef = useRef(new Set(edges.map(e => e.id)))

  function openMenu(menu: RadialMenuState) {
    if (radialMenu) {
      pendingMenuRef.current = menu
    } else {
      setRadialMenu(menu)
    }
  }

  function handleMenuClose() {
    const pending = pendingMenuRef.current
    pendingMenuRef.current = null
    setRadialMenu(null)
    if (pending) setTimeout(() => setRadialMenu(pending), 16)
  }

  // Node spawn / despawn animation tracking
  const knownNodeIds = useRef(new Set(nodes.map(n => n.id)))
  const [spawnIds,   setSpawnIds]   = useState(new Set<string>())
  const [despawnIds, setDespawnIds] = useState(new Set<string>())

  useEffect(() => {
    const newIds = nodes.filter(n => !knownNodeIds.current.has(n.id)).map(n => n.id)
    newIds.forEach(id => knownNodeIds.current.add(id))
    if (!newIds.length) return
    setSpawnIds(prev => new Set([...prev, ...newIds]))
    const t = setTimeout(() => setSpawnIds(prev => { const s = new Set(prev); newIds.forEach(id => s.delete(id)); return s }), 440)
    return () => clearTimeout(t)
  }, [nodes])

  // Detect newly added edges → trigger connection pulse
  useEffect(() => {
    const prevIds = prevEdgeIdsRef.current
    const newIds  = edges.filter(e => !prevIds.has(e.id)).map(e => e.id)
    prevEdgeIdsRef.current = new Set(edges.map(e => e.id))
    if (!newIds.length) return
    setPulsingEdgeIds(prev => new Set([...prev, ...newIds]))
    const t = setTimeout(() => {
      setPulsingEdgeIds(prev => { const s = new Set(prev); newIds.forEach(id => s.delete(id)); return s })
    }, 700)
    return () => clearTimeout(t)
  }, [edges])

  function deleteWithAnimation(id: string) {
    setDespawnIds(prev => new Set([...prev, id]))
    setTimeout(() => {
      removeNode(id)
      setDespawnIds(prev => { const s = new Set(prev); s.delete(id); return s })
    }, 680)
  }

  function nodeAnimClass(id: string): string {
    if (despawnIds.has(id)) return 'animate-canvas-node-out'
    if (spawnIds.has(id))   return 'animate-canvas-node-in'
    return ''
  }

  // Smooth-pan the canvas to center a world point, preserving zoom
  function smoothPanToNode(node: CanvasNode) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const vp      = viewportRef.current
    const targetX = rect.width  / 2 - (node.position.x + node.size.w / 2) * vp.zoom
    const targetY = rect.height / 2 - (node.position.y + node.size.h / 2) * vp.zoom
    const startX  = vp.x
    const startY  = vp.y
    const duration = 480
    const t0 = performance.now()
    if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current)
    function step(now: number) {
      const raw  = Math.min(1, (now - t0) / duration)
      // Cubic ease-in-out for a smooth swoosh
      const ease = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2
      setViewport({ zoom: viewportRef.current.zoom, x: startX + (targetX - startX) * ease, y: startY + (targetY - startY) * ease })
      if (raw < 1) animFrameRef.current = requestAnimationFrame(step)
      else animFrameRef.current = null
    }
    animFrameRef.current = requestAnimationFrame(step)
  }

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const vp = viewportRef.current
    return { x: (sx - rect.left - vp.x) / vp.zoom, y: (sy - rect.top - vp.y) / vp.zoom }
  }, [])

  // Non-passive wheel
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect   = el!.getBoundingClientRect()
      const vp     = viewportRef.current
      const scaleBy = e.deltaY > 0 ? 0.92 : 1.085
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.zoom * scaleBy))
      const ratio   = newZoom / vp.zoom
      const cx = e.clientX - rect.left; const cy = e.clientY - rect.top
      setViewport({ zoom: newZoom, x: cx - (cx - vp.x) * ratio, y: cy - (cy - vp.y) * ratio })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setViewport])

  // Keyboard
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      if (e.code === 'Space' && !e.ctrlKey) { e.preventDefault(); setSpaceDown(true) }
      if (e.code === 'Space' && e.ctrlKey) {
        e.preventDefault()
        // Fit-to-screen without disturbing selection
        const ns = nodesRef.current
        if (!ns.length) { setViewport({ x: 0, y: 0, zoom: 1 }); return }
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        const minX = Math.min(...ns.map(n => n.position.x))
        const minY = Math.min(...ns.map(n => n.position.y))
        const maxX = Math.max(...ns.map(n => n.position.x + n.size.w))
        const maxY = Math.max(...ns.map(n => n.position.y + n.size.h))
        const pad  = 80; const ww = maxX - minX + pad * 2; const wh = maxY - minY + pad * 2
        const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(rect.width / ww, rect.height / wh)))
        setViewport({ zoom, x: (rect.width - ww * zoom) / 2 - (minX - pad) * zoom, y: (rect.height - wh * zoom) / 2 - (minY - pad) * zoom })
      }
      if (e.code === 'Escape') { setRadialMenu(null); setPendingEdge(null) }
      if (e.code === 'Enter' && e.ctrlKey) {
        const { selectedNodeIds: ids, runNode: run } = useCanvasStore.getState()
        ids.forEach(id => run(id))
      }
      if (e.code === 'Tab') {
        e.preventDefault()
        const ns = nodesRef.current
        if (!ns.length) return
        const { selectedNodeId, setSelectedNode: selectNode } = useCanvasStore.getState()
        const idx     = selectedNodeId ? ns.findIndex(n => n.id === selectedNodeId) : -1
        const nextIdx = (idx + 1) % ns.length
        const next    = ns[nextIdx]
        selectNode(next.id)
        smoothPanToNode(next)
      }
    }
    function onKeyUp(e: KeyboardEvent) { if (e.code === 'Space') setSpaceDown(false) }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup',   onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [])

  // Global edge drag tracking.
  // Depends only on isDraggingEdge (a boolean), NOT on pendingEdge itself.
  // This means listeners are registered once when dragging starts and removed
  // once when it ends — never torn down and re-added on every mouse-move update.
  // All live data is read from pendingEdgeRef (always current) to avoid stale closures.
  useEffect(() => {
    if (!isDraggingEdge) return
    function onMove(e: MouseEvent) {
      const pe = pendingEdgeRef.current
      if (!pe) return
      const world = screenToWorld(e.clientX, e.clientY)
      const dist = Math.hypot(world.x - pe.fromPos.x, world.y - pe.fromPos.y)
      if (dist > pendingMaxReachRef.current) pendingMaxReachRef.current = dist
      const ns = nodesRef.current; const vp = viewportRef.current
      let snapToNodeId: string | null = null
      for (const n of ns) {
        const snapDist = 44 / vp.zoom
        const px = n.position.x; const py = n.position.y + n.size.h / 2
        const isPromptLike = pe.fromNodeType === 'prompt'
        if (isPromptLike && n.type === 'bin') {
          if (Math.hypot(world.x - px, world.y - py) < snapDist) { snapToNodeId = n.id; break }
        }
        if (isPromptLike && (n.type === 'prompt' || n.type === 'skill') && n.id !== pe.fromNodeId) {
          if (Math.hypot(world.x - px, world.y - py) < snapDist) { snapToNodeId = n.id; break }
        }
        if (pe.fromNodeType === 'media' && (n.type === 'prompt' || n.type === 'skill')) {
          if (Math.hypot(world.x - px, world.y - py) < snapDist) { snapToNodeId = n.id; break }
        }
      }
      setPendingEdge(prev => prev ? { ...prev, currentPos: world, snapToNodeId } : null)
    }
    function onUp() {
      const pe = pendingEdgeRef.current
      if (pe?.snapToNodeId) addEdge(pe.fromNodeId, pe.snapToNodeId, pe.fromItemIndex)
      setPendingEdge(null)
      pendingMaxReachRef.current = 0
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [isDraggingEdge, addEdge, screenToWorld])

  // Capture-phase handler — fires before node stopPropagation
  function onMouseDownCapture(e: React.MouseEvent) {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault()
      e.stopPropagation()
      // Cancel any in-flight tab-pan animation
      if (animFrameRef.current !== null) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
      setIsPanning(true)
      setPanStart({ mx: e.clientX, my: e.clientY, vpx: viewport.x, vpy: viewport.y })
    }
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button === 0 && !spaceDown && !pendingEdge && !(e.target as HTMLElement).closest('[data-node]')) {
      marqueeStartRef.current  = { sx: e.clientX, sy: e.clientY }
      marqueeActiveRef.current = false
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (isPanning && panStart) {
      setViewport({ x: panStart.vpx + (e.clientX - panStart.mx), y: panStart.vpy + (e.clientY - panStart.my) })
      return
    }
    if (marqueeStartRef.current) {
      const dx = e.clientX - marqueeStartRef.current.sx
      const dy = e.clientY - marqueeStartRef.current.sy
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        marqueeActiveRef.current = true
        const m = {
          x1: Math.min(marqueeStartRef.current.sx, e.clientX),
          y1: Math.min(marqueeStartRef.current.sy, e.clientY),
          x2: Math.max(marqueeStartRef.current.sx, e.clientX),
          y2: Math.max(marqueeStartRef.current.sy, e.clientY),
        }
        marqueeRef.current = m
        setMarquee(m)
      }
    }

    // Port proximity detection — 44px screen-space threshold
    const cRect = containerRef.current?.getBoundingClientRect()
    if (cRect) {
      const vp = viewportRef.current
      const PROX = 44
      let newNearInput:  string | null = null
      let newNearOutput: string | null = null
      for (const n of nodesRef.current) {
        if (!newNearInput && n.type !== 'media' && n.type !== 'skillsbrowser') {
          const sx = n.position.x * vp.zoom + vp.x + cRect.left
          const sy = (n.position.y + n.size.h / 2) * vp.zoom + vp.y + cRect.top
          if (Math.hypot(e.clientX - sx, e.clientY - sy) < PROX) newNearInput = n.id
        }
        if (!newNearOutput) {
          const allItems = n.runs?.flatMap((r: any) => r.items) ?? []
          if ((n.type === 'prompt' || n.type === 'skill') && allItems.length > 0) {
            // Check each per-item output port position
            for (let i = 0; i < allItems.length; i++) {
              const portPos = promptOutputPortWorld(n, i)
              const sx = portPos.x * vp.zoom + vp.x + cRect.left
              const sy = portPos.y * vp.zoom + vp.y + cRect.top
              if (Math.hypot(e.clientX - sx, e.clientY - sy) < PROX) { newNearOutput = n.id; break }
            }
          } else {
            const sx = (n.position.x + n.size.w) * vp.zoom + vp.x + cRect.left
            const sy = (n.position.y + n.size.h / 2) * vp.zoom + vp.y + cRect.top
            if (Math.hypot(e.clientX - sx, e.clientY - sy) < PROX) newNearOutput = n.id
          }
        }
        if (newNearInput && newNearOutput) break
      }
      if (newNearInput  !== nearInputNodeIdRef.current)  { nearInputNodeIdRef.current  = newNearInput;  setNearInputNodeId(newNearInput) }
      if (newNearOutput !== nearOutputNodeIdRef.current) { nearOutputNodeIdRef.current = newNearOutput; setNearOutputNodeId(newNearOutput) }
    }
  }

  function onMouseUp() {
    setIsPanning(false); setPanStart(null)
    if (marqueeActiveRef.current && marqueeRef.current) {
      justDidMarqueeRef.current = true
      const rect = containerRef.current?.getBoundingClientRect()
      const m    = marqueeRef.current
      if (rect) {
        const vp  = viewportRef.current
        const wx1 = (m.x1 - rect.left - vp.x) / vp.zoom
        const wy1 = (m.y1 - rect.top  - vp.y) / vp.zoom
        const wx2 = (m.x2 - rect.left - vp.x) / vp.zoom
        const wy2 = (m.y2 - rect.top  - vp.y) / vp.zoom
        const hit = nodesRef.current
          .filter(n => n.position.x < wx2 && n.position.x + n.size.w > wx1 && n.position.y < wy2 && n.position.y + n.size.h > wy1)
          .map(n => n.id)
        setSelectedNodes(hit)
      }
    }
    marqueeStartRef.current  = null
    marqueeRef.current       = null
    marqueeActiveRef.current = false
    setMarquee(null)
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    const world = screenToWorld(e.clientX, e.clientY)
    openMenu({ screenX: e.clientX, screenY: e.clientY, worldX: world.x, worldY: world.y, modifiers: { alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey }, context: 'canvas' })
  }

  function onDoubleClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    const world = screenToWorld(e.clientX, e.clientY)
    addSkillNode({ x: world.x - 140, y: world.y - 90 })
  }

  function onCanvasClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    if (justDidMarqueeRef.current) { justDidMarqueeRef.current = false; return }
    setSelectedNode(null)
  }

  function onDragOver(e: React.DragEvent) {
    const types = e.dataTransfer.types
    if (
      types.includes('application/fj-media') ||
      types.includes('application/fj-workflow') ||
      types.includes('application/fj-concept') ||
      types.includes('Files')
    ) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const fjWorkflow = e.dataTransfer.getData('application/fj-workflow')
    if (fjWorkflow) {
      try {
        const { slug } = JSON.parse(fjWorkflow) as { slug: string; name: string }
        const world = screenToWorld(e.clientX, e.clientY)
        let clipPrompt = ''
        try {
          const clip = await navigator.clipboard.readText()
          clipPrompt = sanitizeClipboardForPrompt(clip) ?? ''
        } catch { /* clipboard access denied or empty */ }
        const prompt = clipPrompt ? `/run:${slug} ${clipPrompt}` : `/run:${slug}`
        const id = addPromptNode({ x: world.x - 140, y: world.y - 90 }, prompt)
        setSelectedNode(id)
      } catch { /* malformed drag data */ }
      return
    }
    const fjConcept = e.dataTransfer.getData('application/fj-concept')
    if (fjConcept) {
      try {
        const { token } = JSON.parse(fjConcept) as { token: string; name: string }
        const snippet = `<${token}:0.8>`
        const nodeEl = (e.target as HTMLElement).closest('[data-node]')
        const nodeId = nodeEl?.getAttribute('data-node')
        if (nodeId) {
          const target = nodes.find(n => n.id === nodeId && n.type === 'prompt')
          if (target) {
            updateNode(nodeId, { prompt: target.prompt.trim() ? `${target.prompt.trim()} ${snippet}` : snippet })
          }
        } else {
          const world = screenToWorld(e.clientX, e.clientY)
          const id = addPromptNode({ x: world.x - 140, y: world.y - 90 }, snippet)
          setSelectedNode(id)
        }
      } catch { /* malformed drag data */ }
      return
    }

    const nodeEl  = (e.target as HTMLElement).closest('[data-node]')
    const nodeId  = nodeEl?.getAttribute('data-node')
    const world   = screenToWorld(e.clientX, e.clientY)
    const fjMedia = e.dataTransfer.getData('application/fj-media')
    if (fjMedia) {
      try {
        const { url, mediaType, name } = JSON.parse(fjMedia) as { url: string; mediaType: string; name: string }
        if (nodeId) {
          const target = nodes.find(n => n.id === nodeId)
          if (target?.type === 'prompt') addInputMedia(nodeId, [{ url, mediaType, name }])
        } else {
          addMediaNode(url, mediaType, { x: world.x - 90, y: world.y - 90 }, name)
        }
      } catch { /* ignore */ }
      return
    }
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('image/') || f.type.startsWith('video/') || f.type.startsWith('audio/')
    )
    if (!files.length) return
    function fileMediaType(f: File) {
      return f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : 'image'
    }
    if (nodeId) {
      const target = nodes.find(n => n.id === nodeId)
      if (target?.type === 'prompt') {
        addInputMedia(nodeId, files.map(f => ({ url: URL.createObjectURL(f), mediaType: fileMediaType(f), name: f.name })))
      }
    } else {
      files.forEach((f, i) => addMediaNode(URL.createObjectURL(f), fileMediaType(f), { x: world.x + i * 200, y: world.y }, f.name))
    }
  }

  function fitView() {
    if (!nodes.length) { setViewport({ x: 0, y: 0, zoom: 1 }); return }
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const minX = Math.min(...nodes.map(n => n.position.x)); const minY = Math.min(...nodes.map(n => n.position.y))
    const maxX = Math.max(...nodes.map(n => n.position.x + n.size.w)); const maxY = Math.max(...nodes.map(n => n.position.y + n.size.h))
    const pad = 80; const ww = maxX - minX + pad * 2; const wh = maxY - minY + pad * 2
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(rect.width / ww, rect.height / wh)))
    setViewport({ zoom, x: (rect.width - ww * zoom) / 2 - (minX - pad) * zoom, y: (rect.height - wh * zoom) / 2 - (minY - pad) * zoom })
  }

  function handleRadialAction(action: string) {
    const menu = radialMenu
    if (!menu) return
    switch (action) {
      case 'add-skill':         addSkillNode({ x: menu.worldX - 140, y: menu.worldY - 90 }); break
      case 'add-prompt':        addPromptNode({ x: menu.worldX - 140, y: menu.worldY - 90 }); break
      case 'add-bin':           addBinNode({ x: menu.worldX - 150, y: menu.worldY - 150 }); break
      case 'add-method':        addMethodNode({ x: menu.worldX - 160, y: menu.worldY - 240 }); break
      case 'add-skills-browser':addSkillsBrowserNode({ x: menu.worldX - 160, y: menu.worldY - 240 }); break
      case 'fit-view':      fitView(); break
      case 'run-all':       runAllNodes(); break
      case 'cancel-all':    cancelAllNodes(); break
      case 'clear-canvas':  if (window.confirm('Clear all nodes?')) clearCanvas(); break
      case 'run-node': {
        if (menu.nodeId) {
          const n = nodes.find(nd => nd.id === menu.nodeId)
          if (n?.type === 'skill') runSkillNode(menu.nodeId)
          else runNode(menu.nodeId)
        }
        break
      }
      case 'cancel-node':   if (menu.nodeId) cancelNode(menu.nodeId); break
      case 'duplicate-node':if (menu.nodeId) duplicateNode(menu.nodeId); break
      case 'delete-node': {
        // Delete entire selection if the right-clicked node is part of it, else just that node
        const ids = menu.nodeId && selectedNodeIds.includes(menu.nodeId) && selectedNodeIds.length > 1
          ? [...selectedNodeIds]
          : menu.nodeId ? [menu.nodeId] : []
        ids.forEach(id => deleteWithAnimation(id))
        break
      }
      case 'open-settings': onOpenSettings?.(); break
    }
  }

  function startEdge(fromNodeId: string, fromWorldPos: { x: number; y: number }, fromType: 'prompt' | 'media', fromItemIndex?: number) {
    pendingMaxReachRef.current = 0
    setPendingEdge({ fromNodeId, fromNodeType: fromType, fromPos: fromWorldPos, currentPos: fromWorldPos, snapToNodeId: null, fromItemIndex: fromItemIndex ?? null })
  }

  // Compute wire slack for physics droop (how much wire has been reeled out beyond current reach)
  const pendingSlack = pendingEdge
    ? Math.max(0, pendingMaxReachRef.current - Math.hypot(
        pendingEdge.currentPos.x - pendingEdge.fromPos.x,
        pendingEdge.currentPos.y - pendingEdge.fromPos.y,
      ))
    : 0

  const cursor = isPanning ? 'cursor-grabbing' : spaceDown ? 'cursor-grab' : pendingEdge ? 'cursor-crosshair' : 'cursor-default'

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-[#090909] select-none ${cursor}`}
      onMouseDownCapture={onMouseDownCapture}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
      onContextMenu={onContextMenu} onDoubleClick={onDoubleClick} onClick={onCanvasClick}
      onDragOver={onDragOver} onDrop={onDrop}
    >
      {/* Ambient blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="canvas-blob-ember" />
        <div className="canvas-blob-arc" />
        <div className="canvas-blob-sage" />
      </div>

      {/* Line grid — fades at edges via radial mask */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ maskImage: 'radial-gradient(ellipse 88% 88% at 50% 50%, black 10%, transparent 100%)' }}
      >
        <defs>
          <pattern
            id="canvas-grid"
            x={((viewport.x % (60 * viewport.zoom)) + 60 * viewport.zoom) % (60 * viewport.zoom)}
            y={((viewport.y % (60 * viewport.zoom)) + 60 * viewport.zoom) % (60 * viewport.zoom)}
            width={60 * viewport.zoom} height={60 * viewport.zoom}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${60 * viewport.zoom} 0 L 0 0 L 0 ${60 * viewport.zoom}`}
              fill="none" stroke="rgba(255,255,255,0.032)" strokeWidth="0.6"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#canvas-grid)" />
      </svg>

      {/* World */}
      <div className="absolute origin-top-left" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, transformOrigin: '0 0' }}>

        {/* Edge SVG */}
        <svg className="absolute pointer-events-none" style={{ overflow: 'visible', width: 0, height: 0 }}>
          <defs>
            <filter id="glow-orange" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feFlood floodColor="rgba(255,140,0,0.8)" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glow-pulse" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feFlood floodColor="rgba(180,120,255,0.95)" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Connected edges — autopathed around obstructing nodes */}
          {edges.map(edge => {
            const fromNode = nodes.find(n => n.id === edge.fromNodeId)
            const toNode   = nodes.find(n => n.id === edge.toNodeId)
            if (!fromNode || !toNode) return null

            const fromPos = (fromNode.type === 'prompt' || fromNode.type === 'skill')
              ? promptOutputPortWorld(fromNode, edge.fromItemIndex)
              : genericOutputPortWorld(fromNode)
            const toPos = inputPortWorld(toNode)

            const highlighted = fromNode.type === 'prompt' && isEdgeHighlighted(edge, fromNode)
            const stroke = edge.edgeType === 'media'
              ? 'rgba(251,191,36,0.45)'
              : edge.edgeType === 'pipe'
                ? 'rgba(192,100,255,0.50)'
                : highlighted ? 'rgba(255,140,0,1)' : 'rgba(108,71,255,0.22)'

            const isPipe = edge.edgeType === 'pipe'
            const d = avoidedEdgePath(fromPos, toPos, nodes, edge.fromNodeId, edge.toNodeId)

            return (
              <path
                key={edge.id}
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={highlighted ? 2 : 1.5}
                filter={highlighted ? 'url(#glow-orange)' : undefined}
                pathLength={1}
                strokeDasharray={isPipe ? '0.06 0.03' : undefined}
                style={isPipe
                  ? { animation: 'pipe-flow 1.2s linear infinite' }
                  : { animation: 'edge-draw 420ms cubic-bezier(0.4,0,0.2,1) both', strokeDasharray: 1 }
                }
              />
            )
          })}

          {/* Connection pulses — bright segment travels from destination back to origin */}
          {[...pulsingEdgeIds].map(edgeId => {
            const edge = edges.find(e => e.id === edgeId)
            if (!edge) return null
            const fromNode = nodes.find(n => n.id === edge.fromNodeId)
            const toNode   = nodes.find(n => n.id === edge.toNodeId)
            if (!fromNode || !toNode) return null
            const fromPos = (fromNode.type === 'prompt' || fromNode.type === 'skill')
              ? promptOutputPortWorld(fromNode, edge.fromItemIndex)
              : genericOutputPortWorld(fromNode)
            const toPos = inputPortWorld(toNode)
            const d = avoidedEdgePath(fromPos, toPos, nodes, edge.fromNodeId, edge.toNodeId)
            return (
              <path
                key={`pulse-${edgeId}`}
                d={d}
                fill="none"
                stroke="rgba(220,200,255,0.95)"
                strokeWidth={2.5}
                pathLength={1}
                strokeDasharray="0.05 0.95"
                filter="url(#glow-pulse)"
                style={{ animation: 'pulse-travel 700ms cubic-bezier(0.4, 0, 0.6, 1) both' }}
              />
            )
          })}

          {/* Pending edge — physics wire (tense when extending, droops when reeled back) */}
          {pendingEdge && (
            <path
              d={physicsPendingPath(pendingEdge.fromPos, pendingEdge.currentPos, pendingSlack)}
              fill="none"
              stroke={pendingEdge.fromNodeType === 'media' ? 'rgba(251,191,36,0.7)' : 'rgba(108,71,255,0.7)'}
              strokeWidth={1.5}
              strokeDasharray="6 3"
            />
          )}
        </svg>

        {/* Nodes */}
        {nodes.map(node => {
          const shared = {
            key: node.id, node,
            isSelected: selectedNodeIds.includes(node.id),
            onContextMenu: (e: React.MouseEvent) => {
              e.preventDefault(); e.stopPropagation()
              openMenu({ screenX: e.clientX, screenY: e.clientY, worldX: node.position.x, worldY: node.position.y, modifiers: { alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey }, context: 'node', nodeId: node.id })
            },
          }
          const animationClass = nodeAnimClass(node.id)
          if (node.type === 'prompt') return (
            <PromptNode
              {...shared} animationClass={animationClass}
              isSnapTarget={pendingEdge?.snapToNodeId === node.id}
              isNearInputPort={nearInputNodeId === node.id}
              isNearOutputPort={nearOutputNodeId === node.id}
              onStartEdge={startEdge}
              onOpenLightbox={setLightboxItem}
            />
          )
          if (node.type === 'skill') return (
            <SkillNode
              {...shared} animationClass={animationClass}
              isSnapTarget={pendingEdge?.snapToNodeId === node.id}
              isNearInputPort={nearInputNodeId === node.id}
              isNearOutputPort={nearOutputNodeId === node.id}
              onStartEdge={startEdge}
              onOpenLightbox={setLightboxItem}
            />
          )
          if (node.type === 'skillsbrowser') return (
            <SkillsBrowserNode
              key={node.id} node={node}
              isSelected={selectedNodeIds.includes(node.id)}
              animationClass={nodeAnimClass(node.id)}
              onContextMenu={shared.onContextMenu}
            />
          )
          if (node.type === 'media') return (
            <MediaNode
              {...shared} animationClass={animationClass}
              isNearOutputPort={nearOutputNodeId === node.id}
              onStartEdge={startEdge}
              onOpenLightbox={setLightboxItem}
            />
          )
          if (node.type === 'utility') return (
            <MethodBrowserNode
              key={node.id} node={node}
              isSelected={selectedNodeIds.includes(node.id)}
              animationClass={nodeAnimClass(node.id)}
              onContextMenu={shared.onContextMenu}
            />
          )
          if (node.type === 'chain') return (
            <ChainCanvasNode
              key={node.id} node={node}
              isSelected={selectedNodeIds.includes(node.id)}
              animationClass={nodeAnimClass(node.id)}
              onContextMenu={shared.onContextMenu}
            />
          )
          return (
            <BinNode
              {...shared} animationClass={animationClass}
              isSnapTarget={pendingEdge?.snapToNodeId === node.id}
              isNearInputPort={nearInputNodeId === node.id}
              onOpenLightbox={setLightboxItem}
            />
          )
        })}
      </div>

      {/* Empty hint */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <div className="text-center space-y-2">
            <p className="text-white/20 text-sm">Double-click to add a prompt node</p>
            <p className="text-white/10 text-xs">Right-click for menu · Scroll to zoom · Middle-drag or Space+drag to pan</p>
            <p className="text-white/8 text-xs">Drop images onto canvas · ALT/CTRL/SHIFT+right-click for more</p>
          </div>
        </div>
      )}

      <div className="absolute bottom-3 right-3 text-[10px] text-white/15 pointer-events-none font-mono tabular-nums">
        {Math.round(viewport.zoom * 100)}%
      </div>

      {nodes.some(n => n.status === 'active' || n.status === 'queued') && (
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 pointer-events-none">
          <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
          <span className="text-[10px] text-white/25">
            {nodes.filter(n => n.status === 'active').length} active
            {nodes.filter(n => n.status === 'queued').length > 0 && ` · ${nodes.filter(n => n.status === 'queued').length} queued`}
          </span>
        </div>
      )}

      {/* Marquee selection rect */}
      {marquee && (() => {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return null
        return (
          <div
            className="absolute pointer-events-none z-50 border border-brand/60 bg-brand/8"
            style={{
              left:   marquee.x1 - rect.left,
              top:    marquee.y1 - rect.top,
              width:  marquee.x2 - marquee.x1,
              height: marquee.y2 - marquee.y1,
            }}
          />
        )
      })()}

      {radialMenu && (
        <RadialMenu
          screenX={radialMenu.screenX} screenY={radialMenu.screenY}
          modifiers={radialMenu.modifiers} context={radialMenu.context}
          onAction={handleRadialAction} onClose={handleMenuClose}
        />
      )}

      {lightboxItem && (
        <MediaLightbox
          url={lightboxItem.url}
          mediaType={lightboxItem.mediaType}
          onClose={() => setLightboxItem(null)}
        />
      )}
    </div>
  )
}
