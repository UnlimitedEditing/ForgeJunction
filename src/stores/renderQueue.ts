import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { submitRender, cancelRender, fetchRenderInfo, resolveMediaUrl, connectRenderWebSocket, type SSEEvent } from '@/api/graydient'
import { useProjectsStore } from './projects'

// Per-render abort controllers keyed by render id
const activeAbortControllers = new Map<string, AbortController>()
// Per-render WebSocket cleanup functions
const activeWebSockets = new Map<string, () => void>()

// Minimum gap between consecutive render starts to prevent the server
// from coalescing concurrent SSE streams into the same job
const RENDER_START_GAP_MS = 5000
let lastRenderStartTime = 0

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
  selectedRenderId: string | null
  enqueue: (prompt: string, workflowSlug: string, sourceMedia?: { initImage?: string; placeholders?: Record<string, string>; optionPairs?: string[] }) => void
  processNext: () => void
  cancelById: (id: string) => void
  cancelActive: () => void
  cancelAll: () => void
  removeCompleted: () => void
  setSelectedRender: (id: string | null) => void
  getSelectedRender: () => QueuedRender | null
  getActiveRender: () => QueuedRender | null
  getQueueLength: () => number
}

export const useRenderQueueStore = create<RenderQueueState>()(persist((set, get) => {
  /** Poll until the referenced render is done; returns its resultUrl or null on failure. */
  function waitForPendingRender(pendingId: string): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      function check() {
        const render = get().queue.find((r) => r.id === pendingId)
        if (!render || render.status === 'error') { resolve(null); return }
        if (render.status === 'done' && render.resultUrl) { resolve(render.resultUrl); return }
        setTimeout(check, 500)
      }
      check()
    })
  }

  async function runRender(id: string): Promise<void> {
    // Guard: only process items that are still queued (prevents double-start)
    const item = get().queue.find((r) => r.id === id)
    if (!item || item.status !== 'queued') return

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

    const controller = new AbortController()
    activeAbortControllers.set(id, controller)
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, 20 * 60 * 1000)

    try {
      let resolvedHash: string | null = null
      let doneHandled = false

      // Resolve any pending render reference in the source media
      let resolvedSourceMedia = item.sourceMedia
      if (item.sourceMedia?.initImage?.startsWith('pending:')) {
        const pendingId = item.sourceMedia.initImage.slice('pending:'.length)
        appendLog({ timestamp: Date.now(), type: 'progress', data: 'Waiting for source render to complete…' })
        const resolvedUrl = await waitForPendingRender(pendingId)
        if (!resolvedUrl) {
          update({ status: 'error', error: 'Source render failed or was cancelled', completedAt: Date.now() })
          get().processNext()
          return
        }
        resolvedSourceMedia = { ...resolvedSourceMedia, initImage: resolvedUrl }
        appendLog({ timestamp: Date.now(), type: 'progress', data: 'Source render ready — submitting…' })
      }

      async function handleRenderHash(hash: string) {
        if (resolvedHash) return // already handled
        resolvedHash = hash
        update({ renderHash: hash })

        // Open WebSocket for real-time progress events
        const wsCleanup = connectRenderWebSocket(hash, (wsEvent) => {
          const ts = Date.now()
          if (wsEvent.event === 'started') {
            appendLog({ timestamp: ts, type: 'progress', data: 'Rendering started on worker' })
            update({ status: 'streaming', progress: 5, startedAt: ts })
          } else if (wsEvent.event === 'image_done') {
            appendLog({ timestamp: ts, type: 'progress', data: 'Image completed' })
            update({ progress: 80 })
          } else if (wsEvent.event === 'done' && !doneHandled) {
            doneHandled = true
            appendLog({ timestamp: ts, type: 'done', data: 'Render complete' })
            update({ progress: 100 })
            // Extract images from WS done payload
            const images = wsEvent.data.images as Array<{ url?: string; media?: Array<{ url: string; media_type?: string }> }> | undefined
            if (images?.length) {
              const first = images[0]
              const thumbnailUrl = first.url ?? null
              const media = first.media?.[0]
              update({
                status: 'done',
                resultUrl: media?.url ?? first.url ?? null,
                mediaType: media?.media_type ?? null,
                thumbnailUrl,
                completedAt: ts,
              })
            }
          } else if (wsEvent.event === 'error') {
            const msg = (wsEvent.data.message as string | undefined) ?? 'WebSocket render error'
            appendLog({ timestamp: ts, type: 'error', data: msg })
          }
        }, controller.signal)
        activeWebSockets.set(id, wsCleanup)
      }

      console.log(`[RQ] START id=${id} prompt="${item.prompt}"`)
      await submitRender(item.prompt, item.workflowSlug, (event: SSEEvent) => {
        const ts = Date.now()
        if ('rendering_progress' in event) {
          appendLog({ timestamp: ts, type: 'progress', data: `Progress: ${event.rendering_progress.percent}%` })
          // Only update SSE progress if WS hasn't taken over
          const current = get().queue.find((r) => r.id === id)
          if (current && current.progress < 5) {
            update({ status: 'streaming', progress: event.rendering_progress.percent })
          }
        } else if ('rendering_done' in event) {
          const hash = event.rendering_done.render_hash
          console.log(`[RQ] DONE  id=${id} hash=${hash}`)
          appendLog({ timestamp: ts, type: 'done', data: `Done — hash: ${hash}` })
          update({ status: 'streaming', progress: 100, renderHash: hash })
          handleRenderHash(hash)
        } else if ('rendering_error' in event) {
          appendLog({ timestamp: ts, type: 'error', data: `Error: ${event.rendering_error.message}` })
          update({ status: 'error', error: event.rendering_error.message, completedAt: Date.now() })
        }
      }, resolvedSourceMedia, controller.signal, (earlyHash) => {
        // onHash — fires as soon as any SSE event contains a render_hash
        handleRenderHash(earlyHash)
      })

      // If WS already handled the done event, skip fetchRenderInfo
      if (resolvedHash && !doneHandled) {
        doneHandled = true
        const info = await fetchRenderInfo(resolvedHash)
        const resolved = resolveMediaUrl(info)
        update({
          status: 'done',
          resultUrl: resolved?.url ?? null,
          mediaType: resolved?.mediaType ?? null,
          thumbnailUrl: resolved?.thumbnailUrl ?? null,
          completedAt: Date.now(),
        })
      }

      // Re-fetch after a short delay to correct any stale/wrong image URL
      if (resolvedHash) {
        setTimeout(async () => {
          try {
            const refreshedInfo = await fetchRenderInfo(resolvedHash!)
            const refreshed = resolveMediaUrl(refreshedInfo)
            update({
              resultUrl: refreshed?.url ?? null,
              mediaType: refreshed?.mediaType ?? null,
              thumbnailUrl: refreshed?.thumbnailUrl ?? null,
            })
          } catch {
            // ignore refresh errors
          }
        }, 4000)
      } else {
        const current = get().queue.find((r) => r.id === id)
        if (current && current.status !== 'error') {
          update({ status: 'done', completedAt: Date.now() })
        }
      }
    } catch (e) {
      const err = e as Error
      const current = get().queue.find((r) => r.id === id)
      if (current && current.status !== 'error' && current.status !== 'done') {
        const msg = err.name === 'AbortError' ? 'Cancelled' : err.message
        appendLog({ timestamp: Date.now(), type: 'error', data: msg })
        update({ status: 'error', error: msg, completedAt: Date.now() })
      }
    } finally {
      activeAbortControllers.delete(id)
      clearTimeout(timeoutId)
      // WebSocket is closed via AbortController signal or left open briefly for image_done events
      // Ensure cleanup after a short grace period
      setTimeout(() => {
        activeWebSockets.get(id)?.()
        activeWebSockets.delete(id)
      }, 6000)
    }

    // Notify projects store if this render completed successfully
    const completedRender = get().queue.find(r => r.id === id)
    if (completedRender?.status === 'done' && completedRender.resultUrl) {
      useProjectsStore.getState().notifyRenderComplete({
        id: completedRender.id,
        workflowSlug: completedRender.workflowSlug,
        prompt: completedRender.prompt,
        resultUrl: completedRender.resultUrl,
        thumbnailUrl: completedRender.thumbnailUrl,
        mediaType: completedRender.mediaType ?? 'image',
        completedAt: completedRender.completedAt ?? Date.now(),
      })
    }

    // Kick off the next queued render
    get().processNext()
  }

  return {
    queue: [],
    maxConcurrent: 5,
    totalRendersThisSession: 0,
    selectedRenderId: null,

    enqueue: (prompt, workflowSlug, sourceMedia) => {
      // Inject project size if active project has dimensions and prompt doesn't already specify /size:
      const activeProject = useProjectsStore.getState().getActiveProject()
      const dim = activeProject?.dimensions
      const effectivePrompt = dim && !/\/size:/i.test(prompt)
        ? `/size:${dim.width}x${dim.height} ${prompt}`
        : prompt

      const newRender: QueuedRender = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        prompt: effectivePrompt,
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

      // Stagger render starts to prevent the server from coalescing
      // concurrent SSE streams into the same job
      const now = Date.now()
      const gap = now - lastRenderStartTime
      if (gap < RENDER_START_GAP_MS) {
        setTimeout(() => get().processNext(), RENDER_START_GAP_MS - gap)
        return
      }

      lastRenderStartTime = now
      runRender(next.id)
    },

    cancelById: (id: string) => {
      const target = get().queue.find((r) => r.id === id)
      if (!target) return

      const controller = activeAbortControllers.get(id)
      controller?.abort()
      activeAbortControllers.delete(id)
      activeWebSockets.get(id)?.()
      activeWebSockets.delete(id)

      set((s) => ({
        queue: s.queue.map((r) =>
          r.id === id
            ? { ...r, status: 'error' as const, error: 'Cancelled', completedAt: Date.now() }
            : r
        ),
      }))

      if (target.renderHash) {
        cancelRender(target.renderHash)
      }
    },

    cancelActive: () => {
      const active = get().queue.find((r) => r.status === 'active' || r.status === 'streaming')
      if (!active) return

      // Abort the in-flight SSE stream for this specific render
      const controller = activeAbortControllers.get(active.id)
      controller?.abort()
      activeAbortControllers.delete(active.id)
      activeWebSockets.get(active.id)?.()
      activeWebSockets.delete(active.id)

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
      // Abort all active renders
      activeAbortControllers.forEach((controller) => controller.abort())
      activeAbortControllers.clear()
      activeWebSockets.forEach((cleanup) => cleanup())
      activeWebSockets.clear()

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

    setSelectedRender: (id) => set({ selectedRenderId: id }),

    getSelectedRender: () => {
      const { queue, selectedRenderId } = get()
      return queue.find((r) => r.id === selectedRenderId) ?? null
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
}, {
  name: 'fj-render-queue',
  partialize: (state) => ({ queue: state.queue, selectedRenderId: state.selectedRenderId }),
  onRehydrateStorage: () => (state) => {
    if (!state) return
    // Any renders that were active/streaming/queued when the app closed can't resume — mark as error
    state.queue = state.queue.map((r) =>
      r.status === 'active' || r.status === 'streaming' || r.status === 'queued'
        ? { ...r, status: 'error' as const, error: 'Interrupted — app was closed', completedAt: r.completedAt ?? Date.now() }
        : r
    )
  },
}))
