import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useCanvasStore, type CanvasNode, OUTPUT_HEADER_H, outputPortRelY } from '@/stores/canvasStore'
import PromptNode from './PromptNode'
import BinNode from './BinNode'
import MediaNode from './MediaNode'
import RadialMenu, { type RadialMenuModifiers } from './RadialMenu'

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

function isEdgeHighlighted(edge: { fromItemIndex: number | null }, fromNode: CanvasNode): boolean {
  if (edge.fromItemIndex === null) return false
  return fromNode.selectedOutputIndex === edge.fromItemIndex
}

// ── Component ──────────────────────────────────────────────────────────────

export default function InfiniteCanvas({ onOpenSettings }: Props): React.ReactElement {
  const {
    nodes, edges, viewport, setViewport,
    addPromptNode, addBinNode, addMediaNode, addInputMedia,
    removeNode, duplicateNode, addEdge,
    setSelectedNode, setSelectedNodes, selectedNodeIds,
    runNode, cancelNode, runAllNodes, cancelAllNodes,
    clearCanvas,
  } = useCanvasStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef(viewport)
  const nodesRef = useRef(nodes)
  useEffect(() => { viewportRef.current = viewport }, [viewport])
  useEffect(() => { nodesRef.current = nodes }, [nodes])

  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState<{ mx: number; my: number; vpx: number; vpy: number } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [pendingEdge, setPendingEdge] = useState<PendingEdge | null>(null)
  const [radialMenu, setRadialMenu] = useState<RadialMenuState | null>(null)
  const pendingMenuRef = useRef<RadialMenuState | null>(null)

  // Marquee (rubber-band) selection
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const marqueeRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const marqueeStartRef = useRef<{ sx: number; sy: number } | null>(null)
  const marqueeActiveRef = useRef(false)
  const justDidMarqueeRef = useRef(false)

  function openMenu(menu: RadialMenuState) {
    if (radialMenu) {
      // Current menu is open — queue the new one; RadialMenu's own mousedown
      // listener will trigger its exit animation. We mount the pending menu
      // inside handleMenuClose once the exit animation finishes.
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
  const [spawnIds, setSpawnIds] = useState(new Set<string>())
  const [despawnIds, setDespawnIds] = useState(new Set<string>())

  useEffect(() => {
    const newIds = nodes.filter(n => !knownNodeIds.current.has(n.id)).map(n => n.id)
    newIds.forEach(id => knownNodeIds.current.add(id))
    if (!newIds.length) return
    setSpawnIds(prev => new Set([...prev, ...newIds]))
    const t = setTimeout(() => setSpawnIds(prev => { const s = new Set(prev); newIds.forEach(id => s.delete(id)); return s }), 440)
    return () => clearTimeout(t)
  }, [nodes])

  function deleteWithAnimation(id: string) {
    setDespawnIds(prev => new Set([...prev, id]))
    setTimeout(() => {
      removeNode(id)
      setDespawnIds(prev => { const s = new Set(prev); s.delete(id); return s })
    }, 680)
  }

  function nodeAnimClass(id: string): string {
    if (despawnIds.has(id)) return 'animate-canvas-node-out'
    if (spawnIds.has(id)) return 'animate-canvas-node-in'
    return ''
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
      const rect = el!.getBoundingClientRect()
      const vp = viewportRef.current
      const scaleBy = e.deltaY > 0 ? 0.92 : 1.085
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.zoom * scaleBy))
      const ratio = newZoom / vp.zoom
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
      if (e.code === 'Space' && t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') { e.preventDefault(); setSpaceDown(true) }
      if (e.code === 'Escape') { setRadialMenu(null); setPendingEdge(null) }
    }
    function onKeyUp(e: KeyboardEvent) { if (e.code === 'Space') setSpaceDown(false) }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [])

  // Global edge drag tracking
  useEffect(() => {
    if (!pendingEdge) return
    function onMove(e: MouseEvent) {
      const world = screenToWorld(e.clientX, e.clientY)
      const ns = nodesRef.current; const vp = viewportRef.current
      let snapToNodeId: string | null = null
      for (const n of ns) {
        const snapDist = 32 / vp.zoom
        const px = n.position.x; const py = n.position.y + n.size.h / 2
        if (pendingEdge.fromNodeType === 'prompt' && n.type === 'bin') {
          if (Math.hypot(world.x - px, world.y - py) < snapDist) { snapToNodeId = n.id; break }
        }
        if (pendingEdge.fromNodeType === 'prompt' && n.type === 'prompt' && n.id !== pendingEdge.fromNodeId) {
          if (Math.hypot(world.x - px, world.y - py) < snapDist) { snapToNodeId = n.id; break }
        }
        if (pendingEdge.fromNodeType === 'media' && n.type === 'prompt') {
          if (Math.hypot(world.x - px, world.y - py) < snapDist) { snapToNodeId = n.id; break }
        }
      }
      setPendingEdge(prev => prev ? { ...prev, currentPos: world, snapToNodeId } : null)
    }
    function onUp() {
      setPendingEdge(prev => {
        if (prev?.snapToNodeId) addEdge(prev.fromNodeId, prev.snapToNodeId, prev.fromItemIndex)
        return null
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [pendingEdge, addEdge, screenToWorld])

  // Capture-phase handler — fires before any node's stopPropagation can swallow the event.
  // This ensures Space+drag and middle-drag pan the canvas even over large nodes.
  function onMouseDownCapture(e: React.MouseEvent) {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault()
      e.stopPropagation() // prevent the node's drag handler from also firing
      setIsPanning(true)
      setPanStart({ mx: e.clientX, my: e.clientY, vpx: viewport.x, vpy: viewport.y })
    }
  }

  function onMouseDown(e: React.MouseEvent) {
    // Panning is handled in the capture phase above.
    if (e.button === 0 && !spaceDown && !pendingEdge && !(e.target as HTMLElement).closest('[data-node]')) {
      marqueeStartRef.current = { sx: e.clientX, sy: e.clientY }
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
  }
  function onMouseUp() {
    setIsPanning(false); setPanStart(null)
    if (marqueeActiveRef.current && marqueeRef.current) {
      justDidMarqueeRef.current = true
      const rect = containerRef.current?.getBoundingClientRect()
      const m = marqueeRef.current
      if (rect) {
        const vp = viewportRef.current
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
    marqueeStartRef.current = null
    marqueeRef.current = null
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
    addPromptNode({ x: world.x - 140, y: world.y - 90 })
  }

  function onCanvasClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    if (justDidMarqueeRef.current) { justDidMarqueeRef.current = false; return }
    setSelectedNode(null)
  }

  // File drop
  function onDragOver(e: React.DragEvent) {
    const types = e.dataTransfer.types
    if (types.includes('application/fj-media') || types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const nodeEl = (e.target as HTMLElement).closest('[data-node]')
    const nodeId = nodeEl?.getAttribute('data-node')
    const world = screenToWorld(e.clientX, e.clientY)

    // Gallery item dragged out of a prompt node
    const fjMedia = e.dataTransfer.getData('application/fj-media')
    if (fjMedia) {
      try {
        const { url, mediaType, name } = JSON.parse(fjMedia) as { url: string; mediaType: string; name: string }
        if (nodeId) {
          // Dropped onto a prompt node — add to its input queue
          const target = nodes.find(n => n.id === nodeId)
          if (target?.type === 'prompt') addInputMedia(nodeId, [{ url, mediaType, name }])
        } else {
          // Dropped onto canvas — spawn orphan media node
          addMediaNode(url, mediaType, { x: world.x - 90, y: world.y - 90 }, name)
        }
      } catch { /* ignore malformed drag data */ }
      return
    }

    // External file drop
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (!files.length) return
    if (nodeId) {
      const target = nodes.find(n => n.id === nodeId)
      if (target?.type === 'prompt') {
        addInputMedia(nodeId, files.map(f => ({ url: URL.createObjectURL(f), mediaType: f.type.startsWith('video/') ? 'video' : 'image', name: f.name })))
      }
    } else {
      files.forEach((f, i) => addMediaNode(URL.createObjectURL(f), f.type.startsWith('video/') ? 'video' : 'image', { x: world.x + i * 200, y: world.y }, f.name))
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
    // RadialMenu self-manages its exit animation and calls onClose when done.
    // We execute the action immediately; do NOT call setRadialMenu(null) here.
    const menu = radialMenu
    if (!menu) return
    switch (action) {
      case 'add-prompt':    addPromptNode({ x: menu.worldX - 140, y: menu.worldY - 90 }); break
      case 'add-bin':       addBinNode({ x: menu.worldX - 150, y: menu.worldY - 150 }); break
      case 'fit-view':      fitView(); break
      case 'run-all':       runAllNodes(); break
      case 'cancel-all':    cancelAllNodes(); break
      case 'clear-canvas':  if (window.confirm('Clear all nodes?')) clearCanvas(); break
      case 'run-node':      if (menu.nodeId) runNode(menu.nodeId); break
      case 'cancel-node':   if (menu.nodeId) cancelNode(menu.nodeId); break
      case 'duplicate-node':if (menu.nodeId) duplicateNode(menu.nodeId); break
      case 'delete-node':   if (menu.nodeId) deleteWithAnimation(menu.nodeId); break
      case 'open-settings': onOpenSettings?.(); break
    }
  }

  function startEdge(fromNodeId: string, fromWorldPos: { x: number; y: number }, fromType: 'prompt' | 'media', fromItemIndex?: number) {
    setPendingEdge({ fromNodeId, fromNodeType: fromType, fromPos: fromWorldPos, currentPos: fromWorldPos, snapToNodeId: null, fromItemIndex: fromItemIndex ?? null })
  }

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
          </defs>

          {edges.map(edge => {
            const fromNode = nodes.find(n => n.id === edge.fromNodeId)
            const toNode = nodes.find(n => n.id === edge.toNodeId)
            if (!fromNode || !toNode) return null

            const fromPos = fromNode.type === 'prompt'
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

            return (
              <path
                key={edge.id}
                d={edgePath(fromPos, toPos)}
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

          {/* Pending edge */}
          {pendingEdge && (
            <path
              d={edgePath(pendingEdge.fromPos, pendingEdge.currentPos)}
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
          if (node.type === 'prompt') return <PromptNode {...shared} animationClass={animationClass} isSnapTarget={pendingEdge?.snapToNodeId === node.id} onStartEdge={startEdge} />
          if (node.type === 'media') return <MediaNode {...shared} animationClass={animationClass} onStartEdge={startEdge} />
          return <BinNode {...shared} animationClass={animationClass} isSnapTarget={pendingEdge?.snapToNodeId === node.id} />
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
              left: marquee.x1 - rect.left,
              top:  marquee.y1 - rect.top,
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
    </div>
  )
}
