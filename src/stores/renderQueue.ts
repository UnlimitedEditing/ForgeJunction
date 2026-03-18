import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { submitRender, cancelRender, fetchRenderInfo, resolveMediaUrl, resolveAllMedia, connectRenderWebSocket } from '@/api/graydient'
import { useProjectsStore } from './projects'

// Per-render abort controllers keyed by render id
const activeAbortControllers = new Map<string, AbortController>()
// Per-render WebSocket cleanup functions
const activeWebSockets = new Map<string, () => void>()


export interface QueuedRender {
  id: string
  prompt: string
  workflowSlug: string
  sourceMedia: { initImage?: string; placeholders?: Record<string, string>; optionPairs?: string[] } | undefined
  status: 'queued' | 'active' | 'streaming' | 'done' | 'error'
  progress: number
  renderHash: string | null
  resultUrl: string | null
  resultUrls: Array<{ url: string; mediaType: string | null }>
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
  enqueue: (prompt: string, workflowSlug: string, sourceMedia?: { initImage?: string; placeholders?: Record<string, string>; optionPairs?: string[] }) => string
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

    set((s) => ({
      queue: s.queue.map((r) =>
        r.id === id ? { ...r, status: 'active' as const, startedAt: Date.now() } : r
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
    const timeoutId = setTimeout(() => { controller.abort() }, 6 * 60 * 1000)

    try {
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

      // Stream the render — events arrive inline until rendering_done.
      // The HTTP stream IS the real-time feed; no WebSocket or polling needed.
      console.log(`[RQ] SUBMIT id=${id} prompt="${item.prompt}"`)

      let renderHash = ''
      let totalEtaSec = 0
      let progressTimer: ReturnType<typeof setInterval> | null = null
      let doneImages: Array<{ url?: string; media?: Array<{ url: string; media_type?: string }> }> | null = null
      let streamError: string | null = null

      const { renderHash: hash, estimatedRenderTime, estimatedWaitTime, doneImages: streamDoneImages } = await submitRender(
        item.prompt,
        item.workflowSlug,
        (eventName, data) => {
          const ts = Date.now()
          if (eventName === 'render_queued') {
            renderHash = (data.render_hash as string | undefined) ?? renderHash
            const etaSec = ((data.estimated_render_time as number | null) ?? 0)
              + ((data.estimated_wait_time as number | null) ?? 0)
            totalEtaSec = etaSec
            update({
              renderHash,
              eta: etaSec > 0 ? ts + etaSec * 1000 : null,
              status: 'streaming',
              progress: 2,
            })
            appendLog({ timestamp: ts, type: 'progress', data: `Queued — hash: ${renderHash} | ETA ~${etaSec}s` })

            // Start time-based progress simulation now that we have ETA
            const etaMs = etaSec > 0 ? etaSec * 1000 : 60_000
            const start = ts
            progressTimer = setInterval(() => {
              const elapsed = Date.now() - start
              const frac = Math.min(elapsed / etaMs, 1)
              const simulated = Math.round(2 + 86 * (1 - Math.pow(1 - frac, 2)))
              const cur = get().queue.find((r) => r.id === id)
              if (cur && cur.status === 'streaming' && cur.progress < simulated) {
                update({ progress: simulated })
              }
            }, 1000)
          } else if (eventName === 'rendering_started') {
            appendLog({ timestamp: ts, type: 'progress', data: 'Rendering started on worker' })
            update({ startedAt: ts })
          } else if (eventName === 'rendering_done') {
            doneImages = data.images as typeof doneImages
            appendLog({ timestamp: ts, type: 'done', data: 'Render complete' })
            update({ progress: 95 })
          } else if (eventName === 'rendering_error') {
            streamError = (data.message as string | undefined) ?? 'Render failed'
            appendLog({ timestamp: ts, type: 'error', data: streamError })
          }
        },
        resolvedSourceMedia,
        controller.signal
      )

      // Use values from the resolved result if the event callback didn't set them
      if (!renderHash) renderHash = hash
      if (!doneImages) doneImages = streamDoneImages

      if (progressTimer) clearInterval(progressTimer)
      if (controller.signal.aborted) return

      if (streamError) {
        update({ status: 'error', error: streamError, completedAt: Date.now() })
      } else {
        // Try to resolve media from the stream's done payload first;
        // fall back to fetchRenderInfo (needed for video media[] URLs).
        let resolvedAll: import('@/api/graydient').ResolvedMedia[] = []
        if (doneImages?.length) {
          resolvedAll = resolveAllMedia({ render_hash: renderHash, images: doneImages })
        }
        if (!resolvedAll.length) {
          try {
            const info = await fetchRenderInfo(renderHash)
            resolvedAll = resolveAllMedia(info)
          } catch { /* ignore */ }
        }
        const first = resolvedAll[0] ?? null
        update({
          status: 'done',
          resultUrl: first?.url ?? null,
          resultUrls: resolvedAll.map(r => ({ url: r.url, mediaType: r.mediaType })),
          mediaType: first?.mediaType ?? null,
          thumbnailUrl: first?.thumbnailUrl ?? null,
          completedAt: Date.now(),
          progress: 100,
        })
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

    enqueue: (prompt, workflowSlug, sourceMedia): string => {
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
        resultUrls: [],
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
      return newRender.id
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
