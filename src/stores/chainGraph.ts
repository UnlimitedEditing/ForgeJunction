import { create } from 'zustand'
import { submitRender, fetchRenderInfo, resolveMediaUrl, type SSEEvent } from '@/api/graydient'

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

  addNode: (workflowSlug: string, workflowName: string, position: { x: number; y: number }) => void
  removeNode: (id: string) => void
  updateNode: (id: string, patch: Partial<Pick<ChainNode, 'prompt' | 'position' | 'workflowSlug' | 'workflowName'>>) => void
  addEdge: (fromNodeId: string, toNodeId: string) => void
  removeEdge: (id: string) => void
  setSelectedNode: (id: string | null) => void
  toggleSelectNode: (id: string) => void
  selectAllNodes: () => void
  clearSelection: () => void
  duplicateSelected: () => void
  reorderChain: (rootNodeId: string, direction: 'up' | 'down') => void
  clearGraph: () => void
  loadFromTemplate: (template: import('@/stores/chainTemplate').ChainTemplate) => void
  runChain: () => Promise<void>
  setPaused: (paused: boolean) => void
}

export const useChainGraphStore = create<ChainGraphState>((set, get) => {

  function setNodeStatus(id: string, status: ChainNode['status'], extra: Partial<ChainNode> = {}) {
    set(s => ({ nodes: s.nodes.map(n => n.id === id ? { ...n, status, ...extra } : n) }))
  }

  /** Execute all nodes in one connected component, respecting their DAG order. */
  async function runChainNodes(nodeIds: string[], allEdges: ChainEdge[]): Promise<void> {
    const incomingEdge = new Map<string, ChainEdge | null>()
    for (const id of nodeIds) incomingEdge.set(id, null)
    for (const edge of allEdges) {
      if (incomingEdge.has(edge.toNodeId)) incomingEdge.set(edge.toNodeId, edge)
    }

    const results  = new Map<string, string | null>()
    const completed = new Set<string>()
    const failed    = new Set<string>()

    async function executeNode(node: ChainNode): Promise<void> {
      setNodeStatus(node.id, 'active')
      const dep = incomingEdge.get(node.id)
      const initImage: string | undefined = dep ? (results.get(dep.fromNodeId) ?? undefined) : undefined
      try {
        let resolvedHash: string | null = null
        await submitRender(
          node.prompt,
          node.workflowSlug,
          (event: SSEEvent) => {
            if ('rendering_done' in event) resolvedHash = event.rendering_done.render_hash
          },
          initImage ? { initImage } : undefined
        )
        if (resolvedHash) {
          const info = await fetchRenderInfo(resolvedHash)
          const resolved = resolveMediaUrl(info)
          const url = resolved?.url ?? null
          results.set(node.id, url)
          setNodeStatus(node.id, 'done', { resultUrl: url })
        } else {
          results.set(node.id, null)
          setNodeStatus(node.id, 'done')
        }
        completed.add(node.id)
      } catch (e) {
        failed.add(node.id)
        setNodeStatus(node.id, 'error', { error: (e as Error).message })
      }
    }

    function getReadyNodes(): ChainNode[] {
      return get().nodes.filter(n => {
        if (!nodeIds.includes(n.id)) return false
        if (completed.has(n.id) || failed.has(n.id) || n.status === 'active') return false
        const dep = incomingEdge.get(n.id)
        if (dep === null) return true
        if (dep && failed.has(dep.fromNodeId)) return false
        if (dep && completed.has(dep.fromNodeId)) return true
        return false
      })
    }

    function propagateFailures() {
      let changed = true
      while (changed) {
        changed = false
        for (const id of nodeIds) {
          if (completed.has(id) || failed.has(id)) continue
          const dep = incomingEdge.get(id)
          if (dep && failed.has(dep.fromNodeId)) {
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

    // Mark non-root nodes as waiting
    set(s => ({
      nodes: s.nodes.map(n => {
        if (!nodeIds.includes(n.id)) return n
        const dep = incomingEdge.get(n.id)
        return dep ? { ...n, status: 'waiting' as const } : n
      })
    }))

    let lastStart = 0
    while (completed.size + failed.size < nodeIds.length) {
      propagateFailures()
      const ready = getReadyNodes()
      if (ready.length === 0) break
      for (const node of ready) {
        const now = Date.now()
        const wait = Math.max(0, lastStart + 5000 - now)
        if (wait > 0) await new Promise(r => setTimeout(r, wait))
        lastStart = Date.now()
        executeNode(node) // intentionally not awaited — staggered parallel
      }
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

    addEdge: (fromNodeId, toNodeId) => {
      const { edges } = get()
      if (fromNodeId === toNodeId) return
      if (edges.some(e => e.fromNodeId === fromNodeId && e.toNodeId === toNodeId)) return
      if (edges.some(e => e.toNodeId === toNodeId)) return
      set(s => ({ edges: [...s.edges, { id: makeId(), fromNodeId, toNodeId }] }))
    },

    removeEdge: (id) => {
      set(s => ({ edges: s.edges.filter(e => e.id !== id) }))
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
  }
})
