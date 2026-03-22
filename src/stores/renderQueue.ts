import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { submitRender, submitSkill, cancelRender, fetchRenderInfo, resolveMediaUrl, resolveAllMedia, connectRenderWebSocket } from '@/api/graydient'
import { useProjectsStore } from './projects'

// Per-render abort controllers keyed by render id
const activeAbortControllers = new Map<string, AbortController>()
// Per-render WebSocket cleanup functions
const activeWebSockets = new Map<string, () => void>()
// IDs of renders the user explicitly cancelled (vs stream drop / timeout)
const userCancelledIds = new Set<string>()
// Active late-result recovery poll timers keyed by render id
const activeRecoveryPollers = new Map<string, ReturnType<typeof setTimeout>>()


export interface QueuedRender {
  id: string
  prompt: string
  workflowSlug: string
  isSkill: boolean
  skillSlug: string | null
  sourceMedia: { initImage?: string; placeholders?: Record<string, string>; optionPairs?: string[] } | undefined
  status: 'queued' | 'active' | 'streaming' | 'done' | 'error'
  progress: number
  renderHash: string | null
  resultUrl: string | null
  resultUrls: Array<{ url: string; mediaType: string | null }>
  mediaType: string | null
  thumbnailUrl: string | null
  isNsfw: boolean
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
  enqueueSkill: (prompt: string, skillSlug?: string, sourceMedia?: { initImage?: string }) => string
  markNsfw: (id: string, nsfw: boolean) => void
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
  /**
   * Poll fetchRenderInfo every 30 s for a render that errored due to a stream
   * drop, timeout, or server-side transient failure.  Stops automatically when
   * the result arrives or 20 minutes have elapsed since submission.
   * Only started for non-user-initiated errors (stream drops, timeouts, etc.).
   */
  function startLateResultPoller(id: string, renderHash: string, submittedAt: number) {
    const POLL_INTERVAL_MS = 30_000
    const CUTOFF_MS = 20 * 60_000

    function poll() {
      activeRecoveryPollers.delete(id)
      if (Date.now() - submittedAt > CUTOFF_MS) return
      const render = get().queue.find((r) => r.id === id)
      if (!render || render.status === 'done') return

      fetchRenderInfo(renderHash)
        .then((info) => {
          const resolved = resolveAllMedia(info)
          if (resolved.length > 0) {
            const first = resolved[0]
            set((s) => ({
              queue: s.queue.map((r) =>
                r.id === id
                  ? {
                      ...r,
                      status: 'done' as const,
                      resultUrl: first.url,
                      resultUrls: resolved.map((m) => ({ url: m.url, mediaType: m.mediaType })),
                      mediaType: first.mediaType,
                      thumbnailUrl: first.thumbnailUrl,
                      completedAt: Date.now(),
                      progress: 100,
                      error: null,
                    }
                  : r
              ),
            }))
            const completedRender = get().queue.find((r) => r.id === id)
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
          } else {
            const timer = setTimeout(poll, POLL_INTERVAL_MS)
            activeRecoveryPollers.set(id, timer)
          }
        })
        .catch(() => {
          const timer = setTimeout(poll, POLL_INTERVAL_MS)
          activeRecoveryPollers.set(id, timer)
        })
    }

    const timer = setTimeout(poll, POLL_INTERVAL_MS)
    activeRecoveryPollers.set(id, timer)
  }

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

      // Submit the render via SSE stream. A WebSocket is opened in parallel as
      // soon as render_queued fires — it's the reliable completion path if the
      // server closes the SSE connection before rendering_done is delivered.
      console.log(`[RQ] SUBMIT id=${id} prompt="${item.prompt}"`)

      let renderHash = ''
      let totalEtaSec = 0
      let progressTimer: ReturnType<typeof setInterval> | null = null
      let doneImages: Array<{ url?: string; media?: Array<{ url: string; media_type?: string }> }> | null = null
      let streamError: string | null = null

      // WebSocket parallel monitor — captures images if SSE stream closes before rendering_done
      let wsImages: Array<{ url?: string; media?: Array<{ url: string; media_type?: string }> }> | null = null
      let resolveWsPromise: (() => void) | null = null
      const wsPromise = new Promise<void>(resolve => { resolveWsPromise = resolve })

      const streamEventHandler = (eventName: string, data: Record<string, unknown>) => {
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

            // Open WebSocket now that we have a render hash.
            // This is the reliable completion path — if the SSE stream closes before
            // rendering_done fires (server may close the SSE connection early), the
            // WS will still deliver the done event with image URLs.
            const wsCleanup = connectRenderWebSocket(renderHash, (wsEvent) => {
              if (wsEvent.event === 'done') {
                wsImages = (wsEvent.data.images as typeof wsImages) ?? null
                resolveWsPromise?.()
              } else if (wsEvent.event === 'error') {
                resolveWsPromise?.()
              }
            }, controller.signal, () => {
              // WS closed for any reason (auth failure, network drop, etc.) —
              // resolve immediately so we fall through to fetchRenderInfo rather
              // than blocking for the full 5-minute timeout.
              resolveWsPromise?.()
            })
            activeWebSockets.set(id, wsCleanup)

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
      }

      let hash: string, streamDoneImages: typeof doneImages
      if (item.isSkill) {
        ;({ renderHash: hash, doneImages: streamDoneImages } = await submitSkill(
          item.prompt,
          streamEventHandler,
          item.skillSlug ?? undefined,
          resolvedSourceMedia ? { initImage: resolvedSourceMedia.initImage } : undefined,
          controller.signal
        ))
      } else {
        ;({ renderHash: hash, doneImages: streamDoneImages } = await submitRender(
          item.prompt,
          item.workflowSlug,
          streamEventHandler,
          resolvedSourceMedia,
          controller.signal
        ))
      }

      // Use values from the resolved result if the event callback didn't set them
      if (!renderHash) renderHash = hash
      if (!doneImages) doneImages = streamDoneImages

      if (progressTimer) clearInterval(progressTimer)
      if (controller.signal.aborted) return

      // SSE ended. If it didn't deliver images and the render didn't explicitly error,
      // wait for the WebSocket to deliver the done event (up to 5 minutes).
      // The WS is already connected — it was opened when render_queued fired.
      if (!doneImages?.length && !streamError && renderHash) {
        appendLog({ timestamp: Date.now(), type: 'progress', data: 'SSE closed — awaiting WebSocket completion' })
        await Promise.race([
          wsPromise,
          new Promise<void>(resolve => setTimeout(resolve, 5 * 60_000)),
        ])
        if (wsImages?.length) {
          doneImages = wsImages
          appendLog({ timestamp: Date.now(), type: 'done', data: 'Render complete via WebSocket' })
        }
      }

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
        if (first) {
          update({
            status: 'done',
            resultUrl: first.url,
            resultUrls: resolvedAll.map(r => ({ url: r.url, mediaType: r.mediaType })),
            mediaType: first.mediaType,
            thumbnailUrl: first.thumbnailUrl,
            completedAt: Date.now(),
            progress: 100,
          })
        } else {
          // No images from SSE, WS, or REST — mark as error so the late-result
          // recovery poller (startLateResultPoller) watches for the backend result.
          // This avoids silently completing with no output and no recovery path.
          update({ status: 'error', error: 'No result received yet — recovering…', completedAt: Date.now() })
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

    // If the render errored for a non-user reason (stream drop, timeout, rendering_error)
    // and the backend received the request (we have a renderHash), start a recovery poller
    // that checks for a late result every 30 s up to the 20-minute hard cutoff.
    const wasUserCancelled = userCancelledIds.has(id)
    userCancelledIds.delete(id)
    if (completedRender?.status === 'error' && renderHash && !wasUserCancelled) {
      startLateResultPoller(id, renderHash, item.submittedAt)
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
        isSkill: false,
        skillSlug: null,
        sourceMedia,
        status: 'queued',
        progress: 0,
        renderHash: null,
        resultUrl: null,
        resultUrls: [],
        mediaType: null,
        thumbnailUrl: null,
        isNsfw: false,
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

    enqueueSkill: (prompt, skillSlug, sourceMedia): string => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const newRender: QueuedRender = {
        id,
        prompt,
        workflowSlug: 'skill',
        isSkill: true,
        skillSlug: skillSlug ?? null,
        sourceMedia,
        status: 'queued',
        progress: 0,
        renderHash: null,
        resultUrl: null,
        resultUrls: [],
        mediaType: null,
        thumbnailUrl: null,
        isNsfw: false,
        error: null,
        submittedAt: Date.now(),
        startedAt: null,
        completedAt: null,
        eta: null,
        serverLog: [],
      }
      set((s) => ({ queue: [...s.queue, newRender] }))
      setTimeout(() => get().processNext(), 0)
      return id
    },

    markNsfw: (id, nsfw) => {
      set((s) => ({
        queue: s.queue.map((r) => r.id === id ? { ...r, isNsfw: nsfw } : r),
      }))
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

      // Mark as user-initiated so runRender's catch block won't start recovery polling
      userCancelledIds.add(id)
      // Stop any in-progress recovery poller for this render
      const pollerTimer = activeRecoveryPollers.get(id)
      if (pollerTimer !== undefined) { clearTimeout(pollerTimer); activeRecoveryPollers.delete(id) }

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

      userCancelledIds.add(active.id)
      const pollerTimer = activeRecoveryPollers.get(active.id)
      if (pollerTimer !== undefined) { clearTimeout(pollerTimer); activeRecoveryPollers.delete(active.id) }

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
      // Mark all in-flight renders as user-cancelled and stop recovery pollers
      get().queue.forEach((r) => {
        if (r.status === 'queued' || r.status === 'active' || r.status === 'streaming') {
          userCancelledIds.add(r.id)
        }
      })
      activeRecoveryPollers.forEach((timer) => clearTimeout(timer))
      activeRecoveryPollers.clear()

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
    // Guard: queue may be undefined in very old persisted state
    if (!Array.isArray(state.queue)) { state.queue = []; return }
    // Normalize old renders that may be missing fields added after initial release
    state.queue = state.queue.map((r) => {
      const normalized: QueuedRender = {
        // Defaults for fields that didn't exist in older versions
        isSkill: false,
        skillSlug: null,
        isNsfw: false,
        startedAt: null,
        completedAt: null,
        eta: null,
        thumbnailUrl: null,
        error: null,
        sourceMedia: undefined,
        renderHash: null,
        // Persisted values override defaults
        ...r,
        // Array fields must always be arrays regardless of persisted value
        resultUrls: Array.isArray(r.resultUrls)
          ? r.resultUrls
          : r.resultUrl
            ? [{ url: r.resultUrl, mediaType: r.mediaType ?? null }]
            : [],
        serverLog: Array.isArray(r.serverLog) ? r.serverLog : [],
      }
      // Any renders that were active/streaming/queued when the app closed can't resume — mark as error
      if (normalized.status === 'active' || normalized.status === 'streaming' || normalized.status === 'queued') {
        return { ...normalized, status: 'error' as const, error: 'Interrupted — app was closed', completedAt: normalized.completedAt ?? Date.now() }
      }
      return normalized
    })
  },
}))
