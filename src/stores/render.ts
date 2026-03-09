import { create } from 'zustand'
import { submitRender, fetchRenderInfo, resolveMediaUrl, type SSEEvent } from '@/api/graydient'

type RenderStatus = 'idle' | 'submitting' | 'streaming' | 'done' | 'error'

export interface LogEntry {
  timestamp: number
  type: 'progress' | 'done' | 'error' | 'info'
  data: string
}

interface RenderState {
  status: RenderStatus
  progress: number
  renderHash: string | null
  resultUrl: string | null
  mediaType: string | null
  thumbnailUrl: string | null
  error: string | null
  serverLog: LogEntry[]
  startedAt: number | null
  elapsedMs: number | null
  submit: (rawInput: string, fallbackWorkflowSlug?: string) => Promise<void>
}

export const useRenderStore = create<RenderState>((set, get) => ({
  status: 'idle',
  progress: 0,
  renderHash: null,
  resultUrl: null,
  mediaType: null,
  thumbnailUrl: null,
  error: null,
  serverLog: [],
  startedAt: null,
  elapsedMs: null,

  submit: async (rawInput, fallbackWorkflowSlug) => {
    const startedAt = Date.now()
    set({
      status: 'submitting',
      progress: 0,
      resultUrl: null,
      mediaType: null,
      thumbnailUrl: null,
      renderHash: null,
      error: null,
      serverLog: [{ timestamp: startedAt, type: 'info', data: 'Submitting render…' }],
      startedAt,
      elapsedMs: null
    })

    function appendLog(entry: LogEntry) {
      set((s) => ({ serverLog: [...s.serverLog, entry] }))
    }

    try {
      let resolvedHash: string | null = null

      await submitRender(rawInput, fallbackWorkflowSlug, (event: SSEEvent) => {
        console.log('SSE EVENT:', JSON.stringify(event))
        const ts = Date.now()

        if ('rendering_progress' in event) {
          appendLog({ timestamp: ts, type: 'progress', data: `Progress: ${event.rendering_progress.percent}%` })
          set({ status: 'streaming', progress: event.rendering_progress.percent })
        } else if ('rendering_done' in event) {
          resolvedHash = event.rendering_done.render_hash
          appendLog({ timestamp: ts, type: 'done', data: `Done — hash: ${resolvedHash}` })
          set({ status: 'streaming', progress: 100, renderHash: resolvedHash })
        } else if ('rendering_error' in event) {
          appendLog({ timestamp: ts, type: 'error', data: `Error: ${event.rendering_error.message}` })
          set({ status: 'error', error: event.rendering_error.message })
        }
      })

      if (resolvedHash) {
        const info = await fetchRenderInfo(resolvedHash)
        const resolved = resolveMediaUrl(info)
        console.log('RESULT:', resolved)
        const elapsedMs = Date.now() - startedAt
        set({
          status: 'done',
          resultUrl: resolved?.url ?? null,
          mediaType: resolved?.mediaType ?? null,
          thumbnailUrl: resolved?.thumbnailUrl ?? null,
          elapsedMs
        })
        appendLog({ timestamp: Date.now(), type: 'info', data: `Media URL resolved in ${(elapsedMs / 1000).toFixed(1)}s` })
      } else {
        set({ status: 'done', elapsedMs: Date.now() - startedAt })
      }
    } catch (e) {
      const msg = (e as Error).message
      appendLog({ timestamp: Date.now(), type: 'error', data: msg })
      set({ status: 'error', error: msg })
    }
  }
}))
