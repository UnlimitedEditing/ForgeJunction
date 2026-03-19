import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useRenderQueueStore } from './renderQueue'
import { useWorkflowStore } from './workflows'
import { useChainTemplateStore } from './chainTemplate'

export type CanvasNodeType = 'prompt' | 'bin' | 'media' | 'utility' | 'chain' | 'skill' | 'skillsbrowser'

// ── Run history ────────────────────────────────────────────────────────────

export interface PromptRunItem {
  url: string
  mediaType: string
  timestamp: number
}

export interface PromptRun {
  id: string
  promptSnapshot: string
  items: PromptRunItem[]
  startedAt: number
}

// ── Input queue ────────────────────────────────────────────────────────────

export interface InputQueueItem {
  id: string
  url: string
  mediaType: string
  name: string
  status: 'pending' | 'processing' | 'done' | 'error'
}

// ── Bin ───────────────────────────────────────────────────────────────────

export interface BinFilter {
  fileType: 'image' | 'video' | 'audio' | ''
  promptContains: string
  resolution: string
}

export interface BinItem {
  url: string
  mediaType: string
  prompt: string
  sourceNodeId: string
  timestamp: number
}

// ── Canvas node ────────────────────────────────────────────────────────────

export interface CanvasNode {
  id: string
  type: CanvasNodeType
  position: { x: number; y: number }
  size: { w: number; h: number }

  // Prompt
  prompt: string
  status: 'idle' | 'queued' | 'active' | 'done' | 'error'
  renderQueueId: string | null
  resultUrl: string | null
  resultMediaType: string | null
  error: string | null
  runs: PromptRun[]
  totalRenderCount: number
  inputQueue: InputQueueItem[]
  // Output display state
  outputCollapsed: boolean
  unfurled: boolean
  carouselIndex: number
  selectedOutputIndex: number | null
  outputH: number

  // Bin
  filters: BinFilter
  items: BinItem[]

  // Media
  mediaUrl: string
  mediaName: string

  // /imageN: slug ports — key is e.g. 'image1', value is the registered slug
  imageSlots: Record<string, string>

  // Skill node — optional pinned skill
  skillSlug: string | null
  skillName: string | null

  // Chain template node
  templateId?: string
  formValues?: Record<string, string>
  chainStatus?: 'idle' | 'running' | 'done' | 'error'
  chainError?: string | null
  chainResultUrls?: Array<{ url: string; mediaType: string }>
}

// ── Edge ──────────────────────────────────────────────────────────────────

export interface CanvasEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  edgeType: 'result' | 'media' | 'pipe'
  fromItemIndex: number | null
}

export interface CanvasViewport { x: number; y: number; zoom: number }

// ── Layout constants (shared with components) ─────────────────────────────

export const OUTPUT_HEADER_H = 28
export const ITEM_ROW_H = 76   // height of each output row in the gallery list
export const ITEM_IMAGE_H = 64 // thumbnail height inside each row

export function outputPortRelY(
  node: CanvasNode,
  itemIndex: number | null,
  totalItems: number,
): number {
  if (totalItems === 0 || itemIndex === null) return node.size.h / 2
  return node.size.h + OUTPUT_HEADER_H + itemIndex * ITEM_ROW_H + ITEM_ROW_H / 2
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }

const DEFAULT_FILTERS: BinFilter = { fileType: '', promptContains: '', resolution: '' }

function blankNode(type: CanvasNodeType, pos: { x: number; y: number }, size: { w: number; h: number }): CanvasNode {
  return {
    id: makeId(), type, position: pos, size,
    prompt: '', status: 'idle',
    renderQueueId: null, resultUrl: null, resultMediaType: null, error: null,
    runs: [], totalRenderCount: 0, inputQueue: [],
    outputCollapsed: false, unfurled: false, carouselIndex: 0,
    selectedOutputIndex: null, outputH: 0,
    filters: { ...DEFAULT_FILTERS }, items: [],
    mediaUrl: '', mediaName: '',
    imageSlots: {},
    skillSlug: null, skillName: null,
  }
}

// ── Store interface ────────────────────────────────────────────────────────

interface CanvasState {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: CanvasViewport
  selectedNodeId: string | null
  selectedNodeIds: string[]

  setViewport: (v: Partial<CanvasViewport>) => void
  addPromptNode: (pos: { x: number; y: number }, prompt?: string) => string
  addSkillNode: (pos: { x: number; y: number }, prompt?: string, skillSlug?: string, skillName?: string) => string
  addSkillsBrowserNode: (pos: { x: number; y: number }) => string
  addBinNode: (pos: { x: number; y: number }) => string
  addMediaNode: (url: string, mediaType: string, pos: { x: number; y: number }, name?: string) => string
  addMethodNode: (pos: { x: number; y: number }) => string
  removeNode: (id: string) => void
  duplicateNode: (id: string) => void
  updateNode: (id: string, patch: Partial<CanvasNode>) => void
  moveNodes: (positions: Record<string, { x: number; y: number }>) => void
  addEdge: (from: string, to: string, fromItemIndex?: number | null) => void
  removeEdge: (id: string) => void
  setSelectedNode: (id: string | null) => void
  setSelectedNodes: (ids: string[]) => void
  runNode: (id: string) => void
  runSkillNode: (id: string) => void
  cancelNode: (id: string) => void
  runAllNodes: () => void
  cancelAllNodes: () => void
  addInputMedia: (nodeId: string, items: Pick<InputQueueItem, 'url' | 'mediaType' | 'name'>[]) => void
  toggleOutputCollapsed: (nodeId: string) => void
  toggleUnfurled: (nodeId: string) => void
  setCarouselIndex: (nodeId: string, index: number) => void
  setSelectedOutputIndex: (nodeId: string, index: number | null) => void
  setOutputH: (nodeId: string, h: number) => void
  setImageSlot: (nodeId: string, key: string, slug: string) => void
  clearImageSlot: (nodeId: string, key: string) => void
  routeOutputToBins: (srcId: string, url: string, mediaType: string, prompt: string) => void
  addChainNode: (templateId: string, pos: { x: number; y: number }) => string
  updateChainFormValue: (nodeId: string, fieldId: string, value: string) => void
  runChainNode: (nodeId: string) => void
  clearCanvas: () => void
}

// ── Internal render helpers (defined outside create to avoid esbuild issues) ──

type GetFn = () => CanvasState
type SetFn = (partial: Partial<CanvasState> | ((s: CanvasState) => Partial<CanvasState>)) => void

// Watches for a specific render to recover from 'error' → 'done' (late backend result).
// Self-terminates when the result arrives or 20 minutes from submission elapses.
function setupRecoveryWatcher(nodeId: string, renderId: string, runId: string, get: GetFn) {
  const entry = useRenderQueueStore.getState().queue.find(r => r.id === renderId)
  if (!entry?.renderHash) return  // backend never received the request — nothing to recover

  const remaining = 20 * 60_000 - (Date.now() - entry.submittedAt)
  if (remaining <= 0) return

  let watching = true
  let unsub: (() => void) | undefined

  const cutoff = setTimeout(() => {
    watching = false
    unsub?.()
  }, remaining)

  unsub = useRenderQueueStore.subscribe((state) => {
    if (!watching) return
    const r = state.queue.find(q => q.id === renderId)
    if (!r || r.status !== 'done') return

    watching = false
    clearTimeout(cutoff)
    unsub?.()

    const newItems: PromptRunItem[] = (r.resultUrls?.length
      ? r.resultUrls
      : r.resultUrl ? [{ url: r.resultUrl, mediaType: r.mediaType }] : []
    ).map(item => ({ url: item.url, mediaType: item.mediaType ?? 'image', timestamp: Date.now() }))
    if (!newItems.length) return

    const nodeNow = get().nodes.find(n => n.id === nodeId)
    if (!nodeNow) return

    const updatedRuns = nodeNow.runs.map(run =>
      run.id === runId ? { ...run, items: [...run.items, ...newItems] } : run
    )
    const allItems = updatedRuns.flatMap(run => run.items)
    get().updateNode(nodeId, {
      status: 'done',
      resultUrl: newItems[0].url,
      resultMediaType: newItems[0].mediaType,
      runs: updatedRuns,
      carouselIndex: allItems.length - 1,
    })
    get().routeOutputToBins(nodeId, r.resultUrl ?? newItems[0].url, r.mediaType ?? 'image', nodeNow.prompt)
    routeOutputToPrompts(nodeId, newItems, get)
  })
}

function routeOutputToPrompts(srcId: string, newItems: PromptRunItem[], get: GetFn) {
  const { nodes, edges } = get()
  for (const edge of edges.filter(e => e.fromNodeId === srcId && e.edgeType === 'pipe')) {
    const target = nodes.find(n => n.id === edge.toNodeId && n.type === 'prompt')
    if (!target || !target.prompt.trim()) continue
    const queueItems = newItems.map(item => ({
      id: makeId(),
      url: item.url,
      mediaType: item.mediaType,
      name: `↳ pipe`,
      status: 'pending' as const,
    }))
    get().updateNode(target.id, { inputQueue: [...target.inputQueue, ...queueItems] })
    const fresh = get().nodes.find(n => n.id === target.id)
    if (fresh && fresh.status !== 'queued' && fresh.status !== 'active') {
      advanceInputQueue(target.id, get)
    }
  }
}

function advanceInputQueue(nodeId: string, get: GetFn) {
  const node = get().nodes.find(n => n.id === nodeId)
  if (!node) return
  const next = node.inputQueue.find(qi => qi.status === 'pending')
  if (!next) {
    const nodeNow = get().nodes.find(n => n.id === nodeId)
    if (nodeNow?.status !== 'done') get().updateNode(nodeId, { status: 'idle' })
    return
  }
  get().updateNode(nodeId, {
    inputQueue: node.inputQueue.map(qi => qi.id === next.id ? { ...qi, status: 'processing' as const } : qi),
  })
  submitRender(nodeId, get, next.url, next.id)
}

function submitRender(nodeId: string, get: GetFn, initImageUrl?: string, queueItemId?: string) {
  const node = get().nodes.find(n => n.id === nodeId)
  if (!node) return

  const { workflows } = useWorkflowStore.getState()
  const fallback = workflows[0]?.slug ?? 'sdxl'
  // Prefer the /run:slug embedded in the prompt for correct queue display
  const runMatch = node.prompt.match(/\/run:(\S+)/)
  const workflowSlug = runMatch ? runMatch[1] : fallback

  const existing = node.runs.find(r => r.promptSnapshot === node.prompt)
  const runId = existing?.id ?? makeId()
  if (!existing) {
    get().updateNode(nodeId, {
      runs: [...node.runs, { id: runId, promptSnapshot: node.prompt, items: [], startedAt: Date.now() }],
    })
  }

  get().updateNode(nodeId, { status: 'queued', error: null, totalRenderCount: node.totalRenderCount + 1 })

  // Build /imageN:slug option pairs from registered slots
  const slotPairs = Object.entries(node.imageSlots ?? {}).map(([k, slug]) => `/${k}:${slug}`)
  const sourceMedia = {
    ...(initImageUrl ? { initImage: initImageUrl } : {}),
    ...(slotPairs.length ? { optionPairs: slotPairs } : {}),
  }
  const renderId = useRenderQueueStore.getState().enqueue(node.prompt, workflowSlug, Object.keys(sourceMedia).length ? sourceMedia : undefined)
  get().updateNode(nodeId, { renderQueueId: renderId })

  // Each subscription is uniquely scoped to this renderId+nodeId pair.
  // `active` is the single source of truth for whether we should still be listening.
  // We do NOT use nodeNow.renderQueueId as a guard — that field can be transiently
  // null or stale during in-flight canvasStore updates and would cause premature
  // unsubscription of concurrent renders.
  let active = true
  let lastStatus = ''

  const unsubscribe = useRenderQueueStore.subscribe((state) => {
    if (!active) return

    const render = state.queue.find(r => r.id === renderId)
    if (!render) { active = false; unsubscribe(); return }

    // Skip if status hasn't changed — avoids re-entrant processing from progress
    // timer updates or enqueue calls inside advanceInputQueue.
    if (render.status === lastStatus) return
    lastStatus = render.status

    const nodeNow = get().nodes.find(n => n.id === nodeId)
    if (!nodeNow) { active = false; unsubscribe(); return }

    if (render.status === 'active' || render.status === 'streaming') {
      if (nodeNow.status !== 'active') get().updateNode(nodeId, { status: 'active' })
    } else if (render.status === 'done') {
      active = false
      unsubscribe()
      const newItems: PromptRunItem[] = (render.resultUrls?.length
        ? render.resultUrls
        : render.resultUrl ? [{ url: render.resultUrl, mediaType: render.mediaType }] : []
      ).map(r => ({ url: r.url, mediaType: r.mediaType ?? 'image', timestamp: Date.now() }))
      if (!newItems.length) {
        get().updateNode(nodeId, { renderQueueId: null })
        advanceInputQueue(nodeId, get)
        return
      }
      const updatedRuns = get().nodes.find(n => n.id === nodeId)?.runs.map(r =>
        r.id === runId ? { ...r, items: [...r.items, ...newItems] } : r
      ) ?? []
      const allItems = updatedRuns.flatMap(r => r.items)
      get().updateNode(nodeId, {
        status: 'done',
        renderQueueId: null,
        resultUrl: newItems[0].url,
        resultMediaType: newItems[0].mediaType,
        runs: updatedRuns,
        carouselIndex: allItems.length - 1,
      })
      get().routeOutputToBins(nodeId, render.resultUrl, render.mediaType ?? 'image', nodeNow.prompt)
      routeOutputToPrompts(nodeId, newItems, get)
      if (queueItemId) {
        const cur = get().nodes.find(n => n.id === nodeId)
        if (cur) get().updateNode(nodeId, { inputQueue: cur.inputQueue.map(qi => qi.id === queueItemId ? { ...qi, status: 'done' as const } : qi) })
      }
      advanceInputQueue(nodeId, get)
    } else if (render.status === 'error') {
      active = false
      unsubscribe()
      get().updateNode(nodeId, { status: 'error', renderQueueId: null, error: render.error })
      if (queueItemId) {
        const cur = get().nodes.find(n => n.id === nodeId)
        if (cur) get().updateNode(nodeId, { inputQueue: cur.inputQueue.map(qi => qi.id === queueItemId ? { ...qi, status: 'error' as const } : qi) })
      }
      // Watch for a late result from the backend (up to 20 min from submission).
      // If the render queue's recovery poller resolves this render later, the
      // watcher updates the node's result without requiring user action.
      setupRecoveryWatcher(nodeId, renderId, runId, get)
      advanceInputQueue(nodeId, get)
    }
  })
}

function submitSkillRender(nodeId: string, get: GetFn, initImageUrl?: string) {
  const node = get().nodes.find(n => n.id === nodeId)
  if (!node) return

  const existing = node.runs.find(r => r.promptSnapshot === node.prompt)
  const runId = existing?.id ?? makeId()
  if (!existing) {
    get().updateNode(nodeId, {
      runs: [...node.runs, { id: runId, promptSnapshot: node.prompt, items: [], startedAt: Date.now() }],
    })
  }

  get().updateNode(nodeId, { status: 'queued', error: null, totalRenderCount: node.totalRenderCount + 1 })

  const sourceMedia = initImageUrl ? { initImage: initImageUrl } : undefined
  const renderId = useRenderQueueStore.getState().enqueueSkill(
    node.prompt,
    node.skillSlug ?? undefined,
    sourceMedia
  )
  get().updateNode(nodeId, { renderQueueId: renderId })

  let active = true
  let lastStatus = ''

  const unsubscribe = useRenderQueueStore.subscribe((state) => {
    if (!active) return
    const render = state.queue.find(r => r.id === renderId)
    if (!render) { active = false; unsubscribe(); return }
    if (render.status === lastStatus) return
    lastStatus = render.status

    const nodeNow = get().nodes.find(n => n.id === nodeId)
    if (!nodeNow) { active = false; unsubscribe(); return }

    if (render.status === 'active' || render.status === 'streaming') {
      if (nodeNow.status !== 'active') get().updateNode(nodeId, { status: 'active' })
    } else if (render.status === 'done') {
      active = false
      unsubscribe()
      const newItems: PromptRunItem[] = (render.resultUrls?.length
        ? render.resultUrls
        : render.resultUrl ? [{ url: render.resultUrl, mediaType: render.mediaType }] : []
      ).map(r => ({ url: r.url, mediaType: r.mediaType ?? 'image', timestamp: Date.now() }))
      if (!newItems.length) {
        get().updateNode(nodeId, { renderQueueId: null, status: 'idle' })
        return
      }
      const updatedRuns = get().nodes.find(n => n.id === nodeId)?.runs.map(r =>
        r.id === runId ? { ...r, items: [...r.items, ...newItems] } : r
      ) ?? []
      const allItems = updatedRuns.flatMap(r => r.items)
      get().updateNode(nodeId, {
        status: 'done',
        renderQueueId: null,
        resultUrl: newItems[0].url,
        resultMediaType: newItems[0].mediaType,
        runs: updatedRuns,
        carouselIndex: allItems.length - 1,
      })
      get().routeOutputToBins(nodeId, render.resultUrl, render.mediaType ?? 'image', nodeNow.prompt)
      routeOutputToPrompts(nodeId, newItems, get)
    } else if (render.status === 'error') {
      active = false
      unsubscribe()
      get().updateNode(nodeId, { status: 'error', renderQueueId: null, error: render.error })
      setupRecoveryWatcher(nodeId, renderId, runId, get)
    }
  })
}

// ── Chain template DAG execution ──────────────────────────────────────────

async function runChainTemplate(nodeId: string, get: GetFn, set: SetFn): Promise<void> {
  const node = get().nodes.find(n => n.id === nodeId)
  if (!node?.templateId) return
  const template = useChainTemplateStore.getState().templates.find(t => t.id === node.templateId)
  if (!template) return

  const formValues = node.formValues ?? {}
  function resolvePrompt(tmpl: string): string {
    return tmpl.replace(/\{\{(\w+)\}\}/g, (_, id) => formValues[id] ?? '')
  }

  set(s => ({ nodes: s.nodes.map(n => n.id === nodeId ? { ...n, chainStatus: 'running', chainError: null, chainResultUrls: [] } : n) }))

  const execNodes = template.nodes.map(tn => ({ id: tn.id, workflowSlug: tn.workflowSlug, prompt: resolvePrompt(tn.promptTemplate) }))
  const execEdges = template.edges

  const incomingEdges = new Map<string, typeof execEdges>()
  for (const n of execNodes) incomingEdges.set(n.id, [])
  for (const e of execEdges) { if (incomingEdges.has(e.toNodeId)) incomingEdges.get(e.toNodeId)!.push(e) }

  const results = new Map<string, string | null>()
  const completed = new Set<string>()
  const failed = new Set<string>()

  async function executeOneNode(n: { id: string; workflowSlug: string; prompt: string }): Promise<void> {
    const deps = incomingEdges.get(n.id) ?? []
    const sourceMedia: { initImage?: string; optionPairs?: string[]; placeholders?: Record<string, string> } = {}
    for (const dep of deps) {
      const url = results.get(dep.fromNodeId) ?? null
      if (!url) continue
      const field = dep.toPortField ?? 'init_image_filename'
      if (field === 'init_image_filename') {
        sourceMedia.initImage = url
      } else {
        const key = dep.controlnetSlug?.trim() || field
        sourceMedia.placeholders ??= {}
        sourceMedia.placeholders[key] = url
        sourceMedia.optionPairs ??= []
        sourceMedia.optionPairs.push(`/${field}:${key}`)
      }
    }
    const renderId = useRenderQueueStore.getState().enqueue(n.prompt, n.workflowSlug, Object.keys(sourceMedia).length ? sourceMedia : undefined)
    const render = await new Promise<import('./renderQueue').QueuedRender | null>(resolve => {
      let doneAt: number | null = null
      function check() {
        const r = useRenderQueueStore.getState().queue.find(q => q.id === renderId)
        if (!r) { resolve(null); return }
        if (r.status === 'error') { resolve(r); return }
        if (r.status === 'done' && r.resultUrl) { resolve(r); return }
        if (r.status === 'done') {
          if (!doneAt) doneAt = Date.now()
          if (Date.now() - doneAt > 10_000) { resolve(r); return }
        }
        setTimeout(check, 400)
      }
      check()
    })
    if (render?.status === 'done') { results.set(n.id, render.resultUrl ?? null); completed.add(n.id) }
    else { failed.add(n.id) }
  }

  function getReadyChainNodes() {
    return execNodes.filter(n => {
      if (completed.has(n.id) || failed.has(n.id)) return false
      const deps = incomingEdges.get(n.id) ?? []
      if (deps.some(d => failed.has(d.fromNodeId))) { failed.add(n.id); return false }
      return deps.every(d => completed.has(d.fromNodeId))
    })
  }

  while (completed.size + failed.size < execNodes.length) {
    const ready = getReadyChainNodes()
    if (ready.length === 0) break
    await Promise.all(ready.map(n => executeOneNode(n).catch(() => { failed.add(n.id) })))
  }

  // Leaf nodes: no outgoing edges
  const nonLeafIds = new Set(execEdges.map(e => e.fromNodeId))
  const chainResultUrls: Array<{ url: string; mediaType: string }> = []
  const queueSnapshot = useRenderQueueStore.getState().queue
  for (const n of execNodes) {
    if (nonLeafIds.has(n.id) || !results.get(n.id)) continue
    const url = results.get(n.id)!
    const render = queueSnapshot.find(r => r.resultUrl === url || r.resultUrls?.some(u => u.url === url))
    if (render?.resultUrls?.length) {
      for (const u of render.resultUrls) chainResultUrls.push(u)
    } else {
      chainResultUrls.push({ url, mediaType: render?.mediaType ?? 'image' })
    }
  }

  if (failed.size > 0 && completed.size === 0) {
    set(s => ({ nodes: s.nodes.map(n => n.id === nodeId ? { ...n, chainStatus: 'error', chainError: 'One or more chain steps failed' } : n) }))
  } else {
    set(s => ({ nodes: s.nodes.map(n => n.id === nodeId ? { ...n, chainStatus: 'done', chainResultUrls } : n) }))
  }
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useCanvasStore = create<CanvasState>()(persist(
  (set, get) => ({
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeId: null,
    selectedNodeIds: [],

    setViewport: (v) => set(s => ({ viewport: { ...s.viewport, ...v } })),

    addPromptNode: (pos, prompt) => {
      const node = blankNode('prompt', pos, { w: 280, h: 180 })
      if (prompt) node.prompt = prompt
      set(s => ({ nodes: [...s.nodes, node] }))
      return node.id
    },

    addSkillNode: (pos, prompt, skillSlug, skillName) => {
      const node = blankNode('skill', pos, { w: 280, h: 180 })
      if (prompt) node.prompt = prompt
      if (skillSlug) node.skillSlug = skillSlug
      if (skillName) node.skillName = skillName
      set(s => ({ nodes: [...s.nodes, node] }))
      return node.id
    },

    addSkillsBrowserNode: (pos) => {
      const node = blankNode('skillsbrowser', pos, { w: 320, h: 480 })
      // Singleton — only one skills browser at a time
      set(s => ({
        nodes: [...s.nodes.filter(n => n.type !== 'skillsbrowser'), node],
        edges: s.edges.filter(e =>
          !s.nodes.find(n => n.id === e.fromNodeId && n.type === 'skillsbrowser') &&
          !s.nodes.find(n => n.id === e.toNodeId && n.type === 'skillsbrowser')
        ),
      }))
      return node.id
    },

    addBinNode: (pos) => {
      const node = blankNode('bin', pos, { w: 300, h: 300 })
      set(s => ({ nodes: [...s.nodes, node] }))
      return node.id
    },

    addMediaNode: (url, mediaType, pos, name = 'media') => {
      const node: CanvasNode = { ...blankNode('media', pos, { w: 180, h: 180 }), mediaUrl: url, mediaName: name, resultMediaType: mediaType }
      set(s => ({ nodes: [...s.nodes, node] }))
      return node.id
    },

    addMethodNode: (pos) => {
      const node = blankNode('utility', pos, { w: 320, h: 480 })
      // Only one browser node at a time — remove any existing ones before adding
      set(s => ({
        nodes: [...s.nodes.filter(n => n.type !== 'utility'), node],
        edges: s.edges.filter(e => !s.nodes.find(n => n.id === e.fromNodeId && n.type === 'utility') && !s.nodes.find(n => n.id === e.toNodeId && n.type === 'utility')),
      }))
      return node.id
    },

    addChainNode: (templateId, pos) => {
      const template = useChainTemplateStore.getState().templates.find(t => t.id === templateId)
      const initialFormValues: Record<string, string> = {}
      for (const f of template?.forms ?? []) initialFormValues[f.id] = ''
      const node: CanvasNode = {
        ...blankNode('chain', pos, { w: 280, h: 0 }),
        templateId,
        formValues: initialFormValues,
        chainStatus: 'idle',
        chainError: null,
        chainResultUrls: [],
      }
      set(s => ({ nodes: [...s.nodes, node] }))
      return node.id
    },

    updateChainFormValue: (nodeId, fieldId, value) => {
      const node = get().nodes.find(n => n.id === nodeId)
      if (!node) return
      get().updateNode(nodeId, { formValues: { ...(node.formValues ?? {}), [fieldId]: value } })
    },

    runChainNode: (nodeId) => {
      const node = get().nodes.find(n => n.id === nodeId)
      if (!node || node.type !== 'chain' || node.chainStatus === 'running') return
      runChainTemplate(nodeId, get, set).catch(err => {
        set(s => ({ nodes: s.nodes.map(n => n.id === nodeId ? { ...n, chainStatus: 'error', chainError: String(err) } : n) }))
      })
    },

    removeNode: (id) => set(s => ({
      nodes: s.nodes.filter(n => n.id !== id),
      edges: s.edges.filter(e => e.fromNodeId !== id && e.toNodeId !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      selectedNodeIds: s.selectedNodeIds.filter(i => i !== id),
    })),

    duplicateNode: (id) => {
      const node = get().nodes.find(n => n.id === id)
      if (!node) return
      const dup: CanvasNode = {
        ...node, id: makeId(),
        position: { x: node.position.x + 40, y: node.position.y + 40 },
        status: 'idle', renderQueueId: null, resultUrl: null, resultMediaType: null, error: null,
        runs: [], totalRenderCount: 0, inputQueue: [], items: [],
        carouselIndex: 0, selectedOutputIndex: null,
      }
      set(s => ({ nodes: [...s.nodes, dup], selectedNodeId: dup.id, selectedNodeIds: [dup.id] }))
    },

    updateNode: (id, patch) => set(s => ({ nodes: s.nodes.map(n => n.id === id ? { ...n, ...patch } : n) })),

    moveNodes: (positions) => set(s => ({
      nodes: s.nodes.map(n => positions[n.id] ? { ...n, position: positions[n.id] } : n),
    })),

    addEdge: (from, to, fromItemIndex = null) => {
      if (from === to) return
      const { edges, nodes } = get()
      if (edges.some(e => e.fromNodeId === from && e.toNodeId === to && e.fromItemIndex === fromItemIndex)) return
      const fromNode = nodes.find(n => n.id === from)
      const toNode = nodes.find(n => n.id === to)
      if (!fromNode || !toNode) return
      const isPromptLike = (t: string) => t === 'prompt' || t === 'skill'
      let edgeType: 'result' | 'media' | 'pipe' = 'result'
      if (fromNode.type === 'media' && isPromptLike(toNode.type)) edgeType = 'media'
      else if (isPromptLike(fromNode.type) && toNode.type === 'bin') edgeType = 'result'
      else if (isPromptLike(fromNode.type) && isPromptLike(toNode.type)) edgeType = 'pipe'
      else return
      set(s => ({ edges: [...s.edges, { id: makeId(), fromNodeId: from, toNodeId: to, edgeType, fromItemIndex: fromItemIndex ?? null }] }))
    },

    removeEdge: (id) => set(s => ({ edges: s.edges.filter(e => e.id !== id) })),

    setSelectedNode: (id) => set({ selectedNodeId: id, selectedNodeIds: id ? [id] : [] }),

    setSelectedNodes: (ids) => set({ selectedNodeIds: ids, selectedNodeId: ids[0] ?? null }),

    runNode: (id) => {
      const node = get().nodes.find(n => n.id === id)
      if (!node || node.type !== 'prompt' || !node.prompt.trim()) return
      if (node.status === 'queued' || node.status === 'active') return
      const pendingQueue = node.inputQueue.filter(qi => qi.status === 'pending')
      if (pendingQueue.length > 0) { advanceInputQueue(id, get); return }
      const { edges, nodes } = get()
      const mediaEdge = edges.find(e => e.toNodeId === id && e.edgeType === 'media')
      const mediaNode = mediaEdge ? nodes.find(n => n.id === mediaEdge.fromNodeId && n.type === 'media') : null
      submitRender(id, get, mediaNode?.mediaUrl)
    },

    runSkillNode: (id) => {
      const node = get().nodes.find(n => n.id === id)
      if (!node || node.type !== 'skill' || !node.prompt.trim()) return
      if (node.status === 'queued' || node.status === 'active') return
      const { edges, nodes } = get()
      const mediaEdge = edges.find(e => e.toNodeId === id && e.edgeType === 'media')
      const mediaNode = mediaEdge ? nodes.find(n => n.id === mediaEdge.fromNodeId && n.type === 'media') : null
      submitSkillRender(id, get, mediaNode?.mediaUrl)
    },

    cancelNode: (id) => {
      const node = get().nodes.find(n => n.id === id)
      if (!node?.renderQueueId) return
      useRenderQueueStore.getState().cancelById(node.renderQueueId)
      get().updateNode(id, {
        status: 'idle', renderQueueId: null,
        inputQueue: node.inputQueue.map(qi => qi.status === 'processing' ? { ...qi, status: 'pending' as const } : qi),
      })
    },

    runAllNodes: () => {
      get().nodes
        .filter(n => (n.type === 'prompt' || n.type === 'skill') && (n.status === 'idle' || n.status === 'error') && n.prompt.trim())
        .forEach(n => n.type === 'skill' ? get().runSkillNode(n.id) : get().runNode(n.id))
    },

    cancelAllNodes: () => {
      get().nodes
        .filter(n => (n.type === 'prompt' || n.type === 'skill') && (n.status === 'queued' || n.status === 'active'))
        .forEach(n => get().cancelNode(n.id))
    },

    addInputMedia: (nodeId, items) => {
      const node = get().nodes.find(n => n.id === nodeId)
      if (!node) return
      get().updateNode(nodeId, { inputQueue: [...node.inputQueue, ...items.map(i => ({ ...i, id: makeId(), status: 'pending' as const }))] })
    },

    toggleOutputCollapsed: (nodeId) => {
      const node = get().nodes.find(n => n.id === nodeId)
      if (node) get().updateNode(nodeId, { outputCollapsed: !node.outputCollapsed })
    },

    toggleUnfurled: (nodeId) => {
      const node = get().nodes.find(n => n.id === nodeId)
      if (node) get().updateNode(nodeId, { unfurled: !node.unfurled, outputCollapsed: false })
    },

    setCarouselIndex: (nodeId, index) => {
      const node = get().nodes.find(n => n.id === nodeId)
      if (!node) return
      const total = node.runs.reduce((a, r) => a + r.items.length, 0)
      get().updateNode(nodeId, { carouselIndex: Math.max(0, Math.min(total - 1, index)) })
    },

    setSelectedOutputIndex: (nodeId, index) => get().updateNode(nodeId, { selectedOutputIndex: index }),

    setOutputH: (nodeId, h) => get().updateNode(nodeId, { outputH: h }),

    setImageSlot: (nodeId, key, slug) => {
      const node = get().nodes.find(n => n.id === nodeId)
      if (node) get().updateNode(nodeId, { imageSlots: { ...node.imageSlots, [key]: slug } })
    },

    clearImageSlot: (nodeId, key) => {
      const node = get().nodes.find(n => n.id === nodeId)
      if (!node) return
      const slots = { ...node.imageSlots }
      delete slots[key]
      get().updateNode(nodeId, { imageSlots: slots })
    },

    routeOutputToBins: (srcId, url, mediaType, prompt) => {
      const { nodes, edges } = get()
      for (const edge of edges.filter(e => e.fromNodeId === srcId && e.edgeType === 'result')) {
        const bin = nodes.find(n => n.id === edge.toNodeId && n.type === 'bin')
        if (!bin) continue
        const f = bin.filters
        if (f.fileType && !mediaType.includes(f.fileType)) continue
        if (f.promptContains && !prompt.toLowerCase().includes(f.promptContains.toLowerCase())) continue
        if (f.resolution && !prompt.includes(f.resolution)) continue
        get().updateNode(bin.id, { items: [...bin.items, { url, mediaType, prompt, sourceNodeId: srcId, timestamp: Date.now() }] })
      }
    },

    clearCanvas: () => set({ nodes: [], edges: [], selectedNodeId: null, selectedNodeIds: [] }),
  }),
  {
    name: 'fj-canvas',
    partialize: (state) => ({
      nodes: state.nodes.map(n => ({
        ...n,
        status: 'idle' as const,
        renderQueueId: null,
        inputQueue: (n.inputQueue ?? []).map(qi => ({ ...qi, status: 'pending' as const })),
      })),
      edges: state.edges,
    }),
    merge: (persisted, current) => {
      const p = persisted as Partial<CanvasState>
      return {
        ...current,
        ...p,
        // Backfill any missing fields on nodes persisted from older versions
        nodes: (p.nodes ?? []).map(n => ({
          ...blankNode(n.type ?? 'prompt', n.position ?? { x: 0, y: 0 }, n.size ?? { w: 280, h: 180 }),
          ...n,
        })),
        edges: p.edges ?? [],
      }
    },
  },
))
