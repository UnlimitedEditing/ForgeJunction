import { create } from 'zustand'
import { useProjectsStore } from './projects'
import { useRenderQueueStore } from './renderQueue'

export interface ChainNode {
  id: string
  workflowSlug: string
  workflowName: string
  prompt: string
  position: { x: number; y: number }
  status: 'idle' | 'waiting' | 'active' | 'done' | 'error'
  resultUrl: string | null
  error: string | null
}

export interface ChainEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  /** Which input field on the destination node this edge feeds. */
  toPortField: string
  /** Placeholder key used when this edge feeds a controlnet port (e.g. "ctrl1"). */
  controlnetSlug?: string
}

// ── Graph utilities (exported for component use) ──────────────────────────────

export function findComponents(nodes: ChainNode[], edges: ChainEdge[]): ChainNode[][] {
  const visited = new Set<string>()
  const components: ChainNode[][] = []
  for (const node of nodes) {
    if (visited.has(node.id)) continue
    const component: ChainNode[] = []
    const queue = [node.id]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const n = nodes.find(n => n.id === id)
      if (n) component.push(n)
      for (const e of edges) {
        if (e.fromNodeId === id && !visited.has(e.toNodeId)) queue.push(e.toNodeId)
        if (e.toNodeId === id && !visited.has(e.fromNodeId)) queue.push(e.fromNodeId)
      }
    }
    components.push(component)
  }
  return components
}

/** Node in the chain with no incoming edge — the execution start point. */
export function getChainRoot(chain: ChainNode[], edges: ChainEdge[]): ChainNode {
  return chain.find(n => !edges.some(e => e.toNodeId === n.id)) ?? chain[0]
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface ChainGraphState {
  nodes: ChainNode[]
  edges: ChainEdge[]
  selectedNodeId: string | null
  selectedNodeIds: string[]
  /** Ordered list of chain root-node IDs — determines chain run order. */
  chainOrder: string[]
  isRunning: boolean
  isPaused: boolean
  runStartTime: number | null

  addNode: (workflowSlug: string, workflowName: string, position: { x: number; y: number }) => string
  removeNode: (id: string) => void
  updateNode: (id: string, patch: Partial<Pick<ChainNode, 'prompt' | 'position' | 'workflowSlug' | 'workflowName'>>) => void
  addEdge: (fromNodeId: string, toNodeId: string, toPortField: string, controlnetSlug?: string) => void
  removeEdge: (id: string) => void
  updateEdge: (id: string, patch: Partial<Pick<ChainEdge, 'controlnetSlug'>>) => void
  setSelectedNode: (id: string | null) => void
  toggleSelectNode: (id: string) => void
  selectAllNodes: () => void
  clearSelection: () => void
  duplicateSelected: () => void
  reorderChain: (rootNodeId: string, direction: 'up' | 'down') => void
  clearGraph: () => void
  loadFromTemplate: (template: import('@/stores/chainTemplate').ChainTemplate) => void
  runChain: () => Promise<void>
  retryFailed: () => Promise<void>
  setPaused: (paused: boolean) => void
}

export const useChainGraphStore = create<ChainGraphState>((set, get) => {

  function setNodeStatus(id: string, status: ChainNode['status'], extra: Partial<ChainNode> = {}) {
    set(s => ({ nodes: s.nodes.map(n => n.id === id ? { ...n, status, ...extra } : n) }))
  }

  /** Execute all nodes in one connected component, respecting their DAG order.
   *  Pass preResults to seed already-completed nodes (used by retryFailed). */
  async function runChainNodes(
    nodeIds: string[],
    allEdges: ChainEdge[],
    preResults?: Map<string, string | null>
  ): Promise<void> {
    // Build multi-input map: nodeId → all incoming edges (one per port)
    const incomingEdges = new Map<string, ChainEdge[]>()
    for (const id of nodeIds) incomingEdges.set(id, [])
    for (const edge of allEdges) {
      if (incomingEdges.has(edge.toNodeId)) incomingEdges.get(edge.toNodeId)!.push(edge)
    }

    const results   = new Map<string, string | null>(preResults)
    const completed = new Set<string>(preResults ? [...preResults.keys()].filter(id => nodeIds.includes(id)) : [])
    const failed    = new Set<string>()

    async function executeNode(node: ChainNode): Promise<void> {
      setNodeStatus(node.id, 'active')

      // Strip /run:slug from node prompt — node.workflowSlug is authoritative in chain context;
      // a /run: directive in the prompt text would otherwise override the node header selection.
      const cleanPrompt = node.prompt.replace(/\/run:\S+\s*/gi, '').trim()

      // Inject project size constraint if set and not already in prompt
      const activeProject = useProjectsStore.getState().getActiveProject()
      const dim = activeProject?.dimensions
      const nodePrompt = dim && !/\/size:/i.test(cleanPrompt)
        ? `/size:${dim.width}x${dim.height} ${cleanPrompt}`
        : cleanPrompt

      const deps = incomingEdges.get(node.id) ?? []

      // Build sourceMedia from all incoming edges
      const sourceMedia: {
        initImage?: string
        placeholders?: Record<string, string>
        optionPairs?: string[]
      } = {}
      for (const dep of deps) {
        const upstreamUrl = results.get(dep.fromNodeId) ?? null
        if (!upstreamUrl) continue
        const field = dep.toPortField ?? 'init_image_filename'
        if (field === 'init_image_filename') {
          sourceMedia.initImage = upstreamUrl
        } else {
          const key = dep.controlnetSlug?.trim() || field
          sourceMedia.placeholders ??= {}
          sourceMedia.placeholders[key] = upstreamUrl
          sourceMedia.optionPairs ??= []
          sourceMedia.optionPairs.push(`/${field}:${key}`)
        }
      }

      // Route through the render queue so stagger + cancellation are handled centrally
      const renderId = useRenderQueueStore.getState().enqueue(
        nodePrompt,
        node.workflowSlug,
        Object.keys(sourceMedia).length > 0 ? sourceMedia : undefined
      )

      // Poll until render finishes. Once done, wait up to 10s for resultUrl to populate.
      const render = await new Promise<import('./renderQueue').QueuedRender | null>(resolve => {
        let doneAt: number | null = null
        function check() {
          const r = useRenderQueueStore.getState().queue.find(q => q.id === renderId)
          if (!r) { resolve(null); return }
          if (r.status === 'error') { resolve(r); return }
          if (r.status === 'done' && r.resultUrl) { resolve(r); return }
          if (r.status === 'done') {
            // Waiting for resultUrl — give it up to 10s then accept whatever we have
            if (!doneAt) doneAt = Date.now()
            if (Date.now() - doneAt > 10_000) { resolve(r); return }
          }
          setTimeout(check, 400)
        }
        check()
      })

      if (render?.status === 'done') {
        const url = render.resultUrl ?? null
        results.set(node.id, url)
        setNodeStatus(node.id, 'done', { resultUrl: url })
        completed.add(node.id)
      } else {
        failed.add(node.id)
        setNodeStatus(node.id, 'error', { error: render?.error ?? 'Render failed' })
      }
    }

    async function executeNodeSafe(node: ChainNode): Promise<void> {
      try {
        await executeNode(node)
      } catch (e) {
        // Catch any unexpected throws so a single node never crashes the whole chain
        failed.add(node.id)
        setNodeStatus(node.id, 'error', { error: (e as Error).message ?? 'Unexpected error' })
      }
    }

    function getReadyNodes(): ChainNode[] {
      return get().nodes.filter(n => {
        if (!nodeIds.includes(n.id)) return false
        if (completed.has(n.id) || failed.has(n.id) || n.status === 'active') return false
        const deps = incomingEdges.get(n.id) ?? []
        if (deps.length === 0) return true
        if (deps.some(d => failed.has(d.fromNodeId))) return false
        return deps.every(d => completed.has(d.fromNodeId))
      })
    }

    function propagateFailures() {
      let changed = true
      while (changed) {
        changed = false
        for (const id of nodeIds) {
          if (completed.has(id) || failed.has(id)) continue
          const deps = incomingEdges.get(id) ?? []
          if (deps.some(d => failed.has(d.fromNodeId))) {
            failed.add(id)
            setNodeStatus(id, 'error', { error: 'Upstream node failed' })
            changed = true
          }
        }
      }
    }

    function waitForWave(wave: ChainNode[]): Promise<void> {
      return new Promise(resolve => {
        function check() {
          if (wave.every(n => completed.has(n.id) || failed.has(n.id))) resolve()
          else setTimeout(check, 300)
        }
        check()
      })
    }

    // Mark non-root nodes as waiting (skip already-completed seeded nodes)
    set(s => ({
      nodes: s.nodes.map(n => {
        if (!nodeIds.includes(n.id) || completed.has(n.id)) return n
        const deps = incomingEdges.get(n.id) ?? []
        return deps.length > 0 ? { ...n, status: 'waiting' as const } : n
      })
    }))

    while (completed.size + failed.size < nodeIds.length) {
      propagateFailures()
      const ready = getReadyNodes()
      if (ready.length === 0) break
      // Fire all ready nodes — the render queue handles stagger and concurrency limits
      for (const node of ready) executeNodeSafe(node) // intentionally not awaited
      await waitForWave(ready)
    }
  }

  return {
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedNodeIds: [],
    chainOrder: [],
    isRunning: false,
    isPaused: false,
    runStartTime: null,

    addNode: (workflowSlug, workflowName, position) => {
      const node: ChainNode = {
        id: makeId(), workflowSlug, workflowName, prompt: '',
        position, status: 'idle', resultUrl: null, error: null,
      }
      set(s => ({ nodes: [...s.nodes, node] }))
      return node.id
    },

    removeNode: (id) => {
      set(s => ({
        nodes: s.nodes.filter(n => n.id !== id),
        edges: s.edges.filter(e => e.fromNodeId !== id && e.toNodeId !== id),
        selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
        selectedNodeIds: s.selectedNodeIds.filter(sid => sid !== id),
        chainOrder: s.chainOrder.filter(cid => cid !== id),
      }))
    },

    updateNode: (id, patch) => {
      set(s => ({ nodes: s.nodes.map(n => n.id === id ? { ...n, ...patch } : n) }))
    },

    addEdge: (fromNodeId, toNodeId, toPortField, controlnetSlug) => {
      const { edges } = get()
      if (fromNodeId === toNodeId) return
      // Prevent duplicate: same source→destination port combination
      if (edges.some(e => e.fromNodeId === fromNodeId && e.toNodeId === toNodeId && e.toPortField === toPortField)) return
      // One edge per destination port
      if (edges.some(e => e.toNodeId === toNodeId && e.toPortField === toPortField)) return
      set(s => ({ edges: [...s.edges, { id: makeId(), fromNodeId, toNodeId, toPortField, controlnetSlug }] }))
    },

    removeEdge: (id) => {
      set(s => ({ edges: s.edges.filter(e => e.id !== id) }))
    },

    updateEdge: (id, patch) => {
      set(s => ({ edges: s.edges.map(e => e.id === id ? { ...e, ...patch } : e) }))
    },

    setSelectedNode: (id) => set({
      selectedNodeId: id,
      selectedNodeIds: id ? [id] : [],
    }),

    toggleSelectNode: (id) => set(s => {
      const already = s.selectedNodeIds.includes(id)
      return {
        selectedNodeId: id,
        selectedNodeIds: already
          ? s.selectedNodeIds.filter(sid => sid !== id)
          : [...s.selectedNodeIds, id],
      }
    }),

    selectAllNodes: () => set(s => ({
      selectedNodeIds: s.nodes.map(n => n.id),
      selectedNodeId: s.nodes[0]?.id ?? null,
    })),

    clearSelection: () => set({ selectedNodeId: null, selectedNodeIds: [] }),

    duplicateSelected: () => {
      const { nodes, edges, selectedNodeIds } = get()
      if (selectedNodeIds.length === 0) return
      const idMap = new Map<string, string>()
      const newNodes: ChainNode[] = []
      for (const node of nodes.filter(n => selectedNodeIds.includes(n.id))) {
        const newId = makeId()
        idMap.set(node.id, newId)
        newNodes.push({
          ...node, id: newId,
          position: { x: node.position.x + 40, y: node.position.y + 40 },
          status: 'idle', resultUrl: null, error: null,
        })
      }
      const newEdges = edges
        .filter(e => idMap.has(e.fromNodeId) && idMap.has(e.toNodeId))
        .map(e => ({ id: makeId(), fromNodeId: idMap.get(e.fromNodeId)!, toNodeId: idMap.get(e.toNodeId)! }))
      const newIds = newNodes.map(n => n.id)
      set(s => ({
        nodes: [...s.nodes, ...newNodes],
        edges: [...s.edges, ...newEdges],
        selectedNodeIds: newIds,
        selectedNodeId: newIds[0] ?? null,
      }))
    },

    reorderChain: (rootNodeId, direction) => {
      const { nodes, edges, chainOrder } = get()
      const components = findComponents(nodes, edges)
      const allRoots = components.map(c => getChainRoot(c, edges).id)
      const ordered = [...allRoots].sort((a, b) => {
        const ia = chainOrder.indexOf(a), ib = chainOrder.indexOf(b)
        const na = nodes.find(n => n.id === a), nb = nodes.find(n => n.id === b)
        if (ia === -1 && ib === -1) return (na?.position.x ?? 0) - (nb?.position.x ?? 0)
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })
      const idx = ordered.indexOf(rootNodeId)
      if (idx === -1) return
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= ordered.length) return
      const newOrder = [...ordered];
      [newOrder[idx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[idx]]
      set({ chainOrder: newOrder })
    },

    clearGraph: () => set({
      nodes: [], edges: [], selectedNodeId: null, selectedNodeIds: [], chainOrder: [],
    }),

    loadFromTemplate: (template) => {
      const idMap = new Map<string, string>()
      const newNodes: ChainNode[] = template.nodes.map(tn => {
        const newId = makeId()
        idMap.set(tn.id, newId)
        return {
          id: newId,
          workflowSlug: tn.workflowSlug,
          workflowName: tn.workflowName,
          prompt: tn.promptTemplate,
          position: { ...tn.position },
          status: 'idle' as const,
          resultUrl: null,
          error: null,
        }
      })
      const newEdges: ChainEdge[] = template.edges
        .filter(e => idMap.has(e.fromNodeId) && idMap.has(e.toNodeId))
        .map(e => ({
          id: makeId(),
          fromNodeId: idMap.get(e.fromNodeId)!,
          toNodeId: idMap.get(e.toNodeId)!,
          toPortField: e.toPortField ?? 'init_image_filename',
          controlnetSlug: e.controlnetSlug,
        }))
      set({
        nodes: newNodes,
        edges: newEdges,
        selectedNodeId: null,
        selectedNodeIds: [],
        chainOrder: [],
      })
    },

    setPaused: (paused) => set({ isPaused: paused }),

    runChain: async () => {
      const { nodes, edges } = get()
      if (nodes.length === 0) return

      // Mark untyped nodes as errors, proceed with the rest
      set(s => ({
        nodes: s.nodes.map(n => !n.workflowSlug
          ? { ...n, status: 'error' as const, error: 'No workflow selected' }
          : { ...n, status: 'idle' as const, resultUrl: null, error: null }
        ),
      }))
      const typedNodes = get().nodes.filter(n => n.workflowSlug)
      if (typedNodes.length === 0) return

      set({ isRunning: true, runStartTime: Date.now(), isPaused: false })

      const { chainOrder } = get()
      const components = findComponents(typedNodes, edges)

      // Sort components by explicit chain order, falling back to canvas X position
      const sorted = [...components].sort((a, b) => {
        const ra = getChainRoot(a, edges), rb = getChainRoot(b, edges)
        const ia = chainOrder.indexOf(ra.id), ib = chainOrder.indexOf(rb.id)
        if (ia === -1 && ib === -1) return ra.position.x - rb.position.x
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })

      for (const chain of sorted) {
        await runChainNodes(chain.map(n => n.id), edges)

        // Pause between chains if requested
        if (get().isPaused) {
          await new Promise<void>(resolve => {
            function check() { !get().isPaused ? resolve() : setTimeout(check, 500) }
            check()
          })
        }
      }

      set({ isRunning: false, runStartTime: null })
    },

    retryFailed: async () => {

      const { nodes, edges, chainOrder } = get()
      const failedNodes = nodes.filter(n => n.workflowSlug && n.status === 'error')
      if (failedNodes.length === 0) return

      // Seed results from nodes that already completed successfully
      const preResults = new Map<string, string | null>()
      for (const n of nodes) {
        if (n.status === 'done') preResults.set(n.id, n.resultUrl)
      }

      // Reset only the errored nodes
      set(s => ({
        nodes: s.nodes.map(n =>
          n.status === 'error' && n.workflowSlug
            ? { ...n, status: 'idle' as const, resultUrl: null, error: null }
            : n
        ),
      }))

      set({ isRunning: true, runStartTime: Date.now(), isPaused: false })

      const components = findComponents(get().nodes, edges)
      const sorted = [...components].sort((a, b) => {
        const ra = getChainRoot(a, edges), rb = getChainRoot(b, edges)
        const ia = chainOrder.indexOf(ra.id), ib = chainOrder.indexOf(rb.id)
        if (ia === -1 && ib === -1) return ra.position.x - rb.position.x
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })

      for (const chain of sorted) {
        const chainIds = chain.map(n => n.id)
        const hasIncomplete = chainIds.some(id => {
          const n = get().nodes.find(nd => nd.id === id)
          return n && n.status !== 'done'
        })
        if (!hasIncomplete) continue
        await runChainNodes(chainIds, edges, preResults)

        if (get().isPaused) {
          await new Promise<void>(resolve => {
            function check() { !get().isPaused ? resolve() : setTimeout(check, 500) }
            check()
          })
        }
      }

      set({ isRunning: false, runStartTime: null })
    },
  }
})
