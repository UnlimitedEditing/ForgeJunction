import { create } from 'zustand'
import { submitRender, cancelRender, fetchRenderInfo, resolveMediaUrl, type SSEEvent } from '@/api/graydient'

// Module-level controller — one active render at a time, so one controller suffices
let activeAbortController: AbortController | null = null

export interface QueuedRender {
  id: string
  prompt: string
  workflowSlug: string
  sourceMedia: { initImage?: string; placeholders?: Record<string, string>; optionPairs?: string[] } | undefined
  status: 'queued' | 'active' | 'streaming' | 'done' | 'error'
  progress: number
  renderHash: string | null
  resultUrl: string | null
  mediaType: string | null
  thumbnailUrl: string | null
  error: string | null
  submittedAt: number
  startedAt: number | null
  completedAt: number | null
  eta: number | null
  serverLog: Array<{ timestamp: number; type: string; data: string }>
}

interface RenderQueueState {
  queue: QueuedRender[]
  maxConcurrent: number
  totalRendersThisSession: number
  enqueue: (prompt: string, workflowSlug: string, sourceMedia?: { initImage?: string; placeholders?: Record<string, string>; optionPairs?: string[] }) => void
  processNext: () => void
  cancelActive: () => void
  cancelAll: () => void
  removeCompleted: () => void
  getActiveRender: () => QueuedRender | null
  getQueueLength: () => number
}

export const useRenderQueueStore = create<RenderQueueState>((set, get) => {
  async function runRender(id: string): Promise<void> {
    const startedAt = Date.now()

    set((s) => ({
      queue: s.queue.map((r) =>
        r.id === id ? { ...r, status: 'active' as const, startedAt } : r
      ),
      totalRendersThisSession: s.totalRendersThisSession + 1,
    }))

    function appendLog(entry: { timestamp: number; type: string; data: string }) {
      set((s) => ({
        queue: s.queue.map((r) =>
          r.id === id ? { ...r, serverLog: [...r.serverLog, entry] } : r
        ),
      }))
    }

    function update(patch: Partial<QueuedRender>) {
      set((s) => ({
        queue: s.queue.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      }))
    }

    const item = get().queue.find((r) => r.id === id)
    if (!item) return

    const controller = new AbortController()
    activeAbortController = controller

    try {
      let resolvedHash: string | null = null

      await submitRender(item.prompt, item.workflowSlug, (event: SSEEvent) => {
        const ts = Date.now()
        if ('rendering_progress' in event) {
          appendLog({ timestamp: ts, type: 'progress', data: `Progress: ${event.rendering_progress.percent}%` })
          update({ status: 'streaming', progress: event.rendering_progress.percent })
        } else if ('rendering_done' in event) {
          resolvedHash = event.rendering_done.render_hash
          appendLog({ timestamp: ts, type: 'done', data: `Done — hash: ${resolvedHash}` })
          update({ status: 'streaming', progress: 100, renderHash: resolvedHash })
        } else if ('rendering_error' in event) {
          appendLog({ timestamp: ts, type: 'error', data: `Error: ${event.rendering_error.message}` })
          update({ status: 'error', error: event.rendering_error.message, completedAt: Date.now() })
        }
      }, item.sourceMedia, controller.signal)

      if (resolvedHash) {
        const info = await fetchRenderInfo(resolvedHash)
        const resolved = resolveMediaUrl(info)
        update({
          status: 'done',
          resultUrl: resolved?.url ?? null,
          mediaType: resolved?.mediaType ?? null,
          thumbnailUrl: resolved?.thumbnailUrl ?? null,
          completedAt: Date.now(),
        })
      } else {
        const current = get().queue.find((r) => r.id === id)
        if (current && current.status !== 'error') {
          update({ status: 'done', completedAt: Date.now() })
        }
      }
    } catch (e) {
      const err = e as Error
      // AbortError means the user cancelled — only update state if not already set
      const current = get().queue.find((r) => r.id === id)
      if (current && current.status !== 'error' && current.status !== 'done') {
        const msg = err.name === 'AbortError' ? 'Cancelled' : err.message
        appendLog({ timestamp: Date.now(), type: 'error', data: msg })
        update({ status: 'error', error: msg, completedAt: Date.now() })
      }
    } finally {
      if (activeAbortController === controller) activeAbortController = null
    }

    // Kick off the next queued render
    get().processNext()
  }

  return {
    queue: [],
    maxConcurrent: 1,
    totalRendersThisSession: 0,

    enqueue: (prompt, workflowSlug, sourceMedia) => {
      const newRender: QueuedRender = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        prompt,
        workflowSlug,
        sourceMedia,
        status: 'queued',
        progress: 0,
        renderHash: null,
        resultUrl: null,
        mediaType: null,
        thumbnailUrl: null,
        error: null,
        submittedAt: Date.now(),
        startedAt: null,
        completedAt: null,
        eta: null,
        serverLog: [],
      }
      set((s) => ({ queue: [...s.queue, newRender] }))
      setTimeout(() => get().processNext(), 0)
    },

    processNext: () => {
      const { queue, maxConcurrent } = get()
      const activeCount = queue.filter(
        (r) => r.status === 'active' || r.status === 'streaming'
      ).length
      if (activeCount >= maxConcurrent) return
      const next = queue.find((r) => r.status === 'queued')
      if (!next) return
      runRender(next.id)
    },

    cancelActive: () => {
      const active = get().queue.find((r) => r.status === 'active' || r.status === 'streaming')
      if (!active) return

      // Abort the in-flight SSE stream immediately
      activeAbortController?.abort()

      // Optimistically update UI — runRender's catch block will see status already set
      set((s) => ({
        queue: s.queue.map((r) =>
          r.id === active.id
            ? { ...r, status: 'error' as const, error: 'Cancelled', completedAt: Date.now() }
            : r
        ),
      }))

      // Best-effort server-side cancel (fire and forget)
      if (active.renderHash) {
        cancelRender(active.renderHash)
      }
    },

    cancelAll: () => {
      // Cancel active render too
      const active = get().queue.find((r) => r.status === 'active' || r.status === 'streaming')
      if (active) activeAbortController?.abort()

      set((s) => ({
        queue: s.queue.map((r) =>
          r.status === 'queued' || r.status === 'active' || r.status === 'streaming'
            ? { ...r, status: 'error' as const, error: 'Cancelled', completedAt: Date.now() }
            : r
        ),
      }))
    },

    removeCompleted: () => {
      set((s) => ({
        queue: s.queue.filter((r) => r.status !== 'done' && r.status !== 'error'),
      }))
    },

    getActiveRender: () => {
      return (
        get().queue.find((r) => r.status === 'active' || r.status === 'streaming') ?? null
      )
    },

    getQueueLength: () => {
      return get().queue.filter((r) => r.status === 'queued').length
    },
  }
})
