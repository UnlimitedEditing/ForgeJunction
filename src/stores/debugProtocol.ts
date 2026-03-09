import { create } from 'zustand'
import { useWorkflowStore } from './workflows'
import { submitRender, fetchRenderInfo, resolveMediaUrl } from '@/api/graydient'
import { cacheTestMediaUrl, getTestMediaUrl } from '@/utils/testMedia'
import type { Workflow } from '@/api/graydient'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DebugWorkflowResult {
  slug: string
  name: string
  category: string
  testPrompt: string
  testOptions: string
  needsInput: false | 'image' | 'video' | 'audio'
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
  startedAt: number | null
  completedAt: number | null
  elapsed: number | null
  resultUrl: string | null
  mediaType: string | null
  error: string | null
  apiResponse: string | null
  requestBody: string | null
}

interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
}

interface DebugProtocolState {
  isOpen: boolean
  isRunning: boolean
  shouldStop: boolean
  results: DebugWorkflowResult[]
  currentIndex: number
  totalWorkflows: number
  completed: number
  passed: number
  failed: number
  skipped: number
  logEntries: LogEntry[]
  open: () => void
  close: () => void
  startFullRun: () => Promise<void>
  startSingleTest: (slug: string) => Promise<void>
  retryFailed: () => Promise<void>
  stop: () => void
  reset: () => void
  exportLog: () => Promise<string>
  log: (level: 'info' | 'warn' | 'error', message: string) => void
}

// ── Test config ───────────────────────────────────────────────────────────────

interface TestConfig {
  prompt: string
  options: string
  category: string
  needsInput: false | 'image' | 'video' | 'audio'
}

function getTestConfig(workflow: Workflow): TestConfig {
  const slug = workflow.slug

  if (workflow.supports_txt2img) {
    return {
      prompt: 'a solid red circle on a plain white background, simple minimal test image',
      options: `/run:${slug} /images:1`,
      category: 'Text→Image',
      needsInput: false,
    }
  }
  if (workflow.supports_txt2vid) {
    return {
      prompt: 'a red ball bouncing slowly on a white floor, simple animation',
      options: `/run:${slug}`,
      category: 'Text→Video',
      needsInput: false,
    }
  }
  if (workflow.supports_txt2wav) {
    return {
      prompt: 'a short simple piano melody, five seconds, minimal',
      options: `/run:${slug}`,
      category: 'Text→Audio',
      needsInput: false,
    }
  }
  if (workflow.supports_img2img) {
    return {
      prompt: 'make it blue and glowing',
      options: `/run:${slug}`,
      category: 'Image→Image',
      needsInput: 'image',
    }
  }
  if (workflow.supports_img2vid) {
    return {
      prompt: 'gentle zoom in with slight movement',
      options: `/run:${slug}`,
      category: 'Image→Video',
      needsInput: 'image',
    }
  }
  if (workflow.supports_vid2vid) {
    return {
      prompt: 'enhance and smooth the video',
      options: `/run:${slug}`,
      category: 'Video→Video',
      needsInput: 'video',
    }
  }
  if (workflow.supports_vid2img) {
    return {
      prompt: 'extract key frame',
      options: `/run:${slug}`,
      category: 'Video→Image',
      needsInput: 'video',
    }
  }
  if (workflow.supports_vid2wav) {
    return {
      prompt: 'add ambient sound effects',
      options: `/run:${slug}`,
      category: 'Video→Audio',
      needsInput: 'video',
    }
  }
  if (workflow.supports_wav2txt) {
    return {
      prompt: 'transcribe this audio',
      options: `/run:${slug}`,
      category: 'Audio→Text',
      needsInput: 'audio',
    }
  }
  return {
    prompt: 'a red circle on white, simple test',
    options: `/run:${slug} /images:1`,
    category: 'Unknown',
    needsInput: false,
  }
}

const CATEGORY_ORDER: Record<string, number> = {
  'Text→Image': 0,
  'Text→Video': 1,
  'Text→Audio': 2,
  'Image→Image': 3,
  'Image→Video': 4,
  'Video→Video': 5,
  'Video→Image': 6,
  'Video→Audio': 7,
  'Audio→Text': 8,
  'Unknown': 9,
}

function ts(): string {
  return new Date().toISOString()
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useDebugProtocolStore = create<DebugProtocolState>((set, get) => {

  function log(level: 'info' | 'warn' | 'error', message: string) {
    const entry: LogEntry = { timestamp: ts(), level, message }
    console.log(`[DEBUG PROTOCOL] [${level.toUpperCase()}] ${message}`)
    set((s) => ({ logEntries: [...s.logEntries, entry] }))
  }

  function updateResult(slug: string, patch: Partial<DebugWorkflowResult>) {
    set((s) => {
      const results = s.results.map((r) => (r.slug === slug ? { ...r, ...patch } : r))
      const completed = results.filter((r) => r.status === 'passed' || r.status === 'failed' || r.status === 'skipped').length
      const passed = results.filter((r) => r.status === 'passed').length
      const failed = results.filter((r) => r.status === 'failed').length
      const skipped = results.filter((r) => r.status === 'skipped').length
      return { results, completed, passed, failed, skipped }
    })
  }

  async function runSingleTest(result: DebugWorkflowResult, sourceMediaUrl?: string): Promise<void> {
    const startedAt = Date.now()
    const rawInput = `${result.testOptions} ${result.testPrompt}`
    const reqBody = JSON.stringify({
      prompt: result.testPrompt,
      task: 'workflow',
      options: result.testOptions,
      ...(sourceMediaUrl ? { init_image: sourceMediaUrl } : {})
    }, null, 2)

    updateResult(result.slug, { status: 'running', startedAt, requestBody: reqBody, error: null, apiResponse: null })
    log('info', `Testing ${result.slug}... prompt: "${result.testPrompt}"`)

    let resolvedHash: string | null = null
    let renderError: string | null = null

    const TIMEOUT_MS = 180_000

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout (180s)')), TIMEOUT_MS)
      )

      await Promise.race([
        submitRender(rawInput, undefined, (event) => {
          if ('rendering_done' in event) {
            resolvedHash = event.rendering_done.render_hash
          } else if ('rendering_error' in event) {
            renderError = event.rendering_error.message
          }
        }, sourceMediaUrl),
        timeoutPromise,
      ])
    } catch (e) {
      renderError = (e as Error).message
    }

    if (renderError && !resolvedHash) {
      const elapsed = (Date.now() - startedAt) / 1000
      log('error', `✗ ${result.slug} FAILED (${elapsed.toFixed(1)}s) — ${renderError}`)
      updateResult(result.slug, {
        status: 'failed',
        completedAt: Date.now(),
        elapsed,
        error: renderError,
        apiResponse: renderError,
      })
      return
    }

    if (resolvedHash) {
      try {
        const info = await fetchRenderInfo(resolvedHash)
        const resolved = resolveMediaUrl(info)
        const elapsed = (Date.now() - startedAt) / 1000
        const url = resolved?.url ?? null
        const mediaType = resolved?.mediaType ?? null

        log('info', `✓ ${result.slug} PASSED (${elapsed.toFixed(1)}s) — ${url ?? 'no url'}`)
        updateResult(result.slug, {
          status: 'passed',
          completedAt: Date.now(),
          elapsed,
          resultUrl: url,
          mediaType,
          apiResponse: JSON.stringify(info, null, 2),
        })

        // Cache for subsequent tests that need input media
        if (url) {
          if (result.category === 'Text→Image') cacheTestMediaUrl('image', url)
          if (result.category === 'Text→Video') cacheTestMediaUrl('video', url)
          if (result.category === 'Text→Audio') cacheTestMediaUrl('audio', url)
        }
      } catch (e) {
        const elapsed = (Date.now() - startedAt) / 1000
        const msg = (e as Error).message
        log('error', `✗ ${result.slug} FAILED fetching result (${elapsed.toFixed(1)}s) — ${msg}`)
        updateResult(result.slug, {
          status: 'failed',
          completedAt: Date.now(),
          elapsed,
          error: msg,
        })
      }
    } else {
      const elapsed = (Date.now() - startedAt) / 1000
      const msg = renderError ?? 'No render hash received'
      log('error', `✗ ${result.slug} FAILED (${elapsed.toFixed(1)}s) — ${msg}`)
      updateResult(result.slug, {
        status: 'failed',
        completedAt: Date.now(),
        elapsed,
        error: msg,
      })
    }
  }

  async function runQueue(toRun: DebugWorkflowResult[]): Promise<void> {
    set({ isRunning: true, shouldStop: false })

    for (let i = 0; i < toRun.length; i++) {
      if (get().shouldStop) {
        log('warn', 'Debug protocol stopped by user.')
        break
      }

      const result = toRun[i]
      set({ currentIndex: get().results.findIndex((r) => r.slug === result.slug) })

      // Check if input media is needed
      if (result.needsInput) {
        const mediaUrl = getTestMediaUrl(result.needsInput)
        if (!mediaUrl) {
          log('warn', `⊘ ${result.slug} SKIPPED — No test ${result.needsInput} available (run a ${result.needsInput === 'image' ? 'Text→Image' : result.needsInput === 'video' ? 'Text→Video' : 'Text→Audio'} test first)`)
          updateResult(result.slug, {
            status: 'skipped',
            error: `No test ${result.needsInput} available`,
          })
          continue
        }
        await runSingleTest(result, mediaUrl)
      } else {
        await runSingleTest(result)
      }

      // Wait between tests (skip delay after last test)
      if (i < toRun.length - 1 && !get().shouldStop) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    }

    const { passed, failed, skipped, totalWorkflows } = get()
    log('info', `Debug protocol complete. Results: ${passed} passed, ${failed} failed, ${skipped} skipped, ${totalWorkflows} total`)
    set({ isRunning: false, currentIndex: -1 })
  }

  return {
    isOpen: false,
    isRunning: false,
    shouldStop: false,
    results: [],
    currentIndex: -1,
    totalWorkflows: 0,
    completed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    logEntries: [],

    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),

    stop: () => {
      set({ shouldStop: true })
      log('warn', 'Stop requested — finishing current test then stopping.')
    },

    reset: () => {
      set((s) => ({
        results: s.results.map((r) => ({
          ...r,
          status: 'pending' as const,
          startedAt: null,
          completedAt: null,
          elapsed: null,
          resultUrl: null,
          mediaType: null,
          error: null,
          apiResponse: null,
          requestBody: null,
        })),
        completed: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        currentIndex: -1,
        logEntries: [],
      }))
    },

    log,

    startFullRun: async () => {
      if (get().isRunning) return

      const workflows = useWorkflowStore.getState().workflows
      if (workflows.length === 0) {
        log('error', 'No workflows loaded. Load workflows first.')
        return
      }

      // Build results list sorted by category
      const results: DebugWorkflowResult[] = workflows
        .map((wf) => {
          const config = getTestConfig(wf)
          return {
            slug: wf.slug,
            name: wf.name,
            category: config.category,
            testPrompt: config.prompt,
            testOptions: config.options,
            needsInput: config.needsInput,
            status: 'pending' as const,
            startedAt: null,
            completedAt: null,
            elapsed: null,
            resultUrl: null,
            mediaType: null,
            error: null,
            apiResponse: null,
            requestBody: null,
          }
        })
        .sort((a, b) => {
          const ao = CATEGORY_ORDER[a.category] ?? 99
          const bo = CATEGORY_ORDER[b.category] ?? 99
          if (ao !== bo) return ao - bo
          return a.slug.localeCompare(b.slug)
        })

      set({ results, totalWorkflows: results.length, completed: 0, passed: 0, failed: 0, skipped: 0, logEntries: [] })
      log('info', `Starting debug protocol — ${results.length} workflows to test`)

      // Log phase headers
      let lastCategory = ''
      const toRun = results.filter((r) => r.status === 'pending')

      // Note phases in log
      for (const r of results) {
        if (r.category !== lastCategory) {
          log('info', `Phase: Testing ${r.category} workflows`)
          lastCategory = r.category
        }
      }

      await runQueue(toRun)
    },

    startSingleTest: async (slug: string) => {
      if (get().isRunning) return
      const result = get().results.find((r) => r.slug === slug)
      if (!result) return
      // Reset just this one
      updateResult(slug, {
        status: 'pending',
        startedAt: null,
        completedAt: null,
        elapsed: null,
        resultUrl: null,
        mediaType: null,
        error: null,
        apiResponse: null,
        requestBody: null,
      })
      await runQueue([result])
    },

    retryFailed: async () => {
      if (get().isRunning) return
      const failed = get().results.filter((r) => r.status === 'failed')
      if (failed.length === 0) return
      log('info', `Retrying ${failed.length} failed workflows...`)
      // Reset them to pending
      for (const r of failed) {
        updateResult(r.slug, { status: 'pending', error: null, apiResponse: null, requestBody: null })
      }
      await runQueue(failed)
    },

    exportLog: async () => {
      const { results, logEntries, passed, failed, skipped, totalWorkflows, logEntries: log_ } = get()

      const startTs = logEntries[0]?.timestamp ?? ts()
      const endTs = logEntries[logEntries.length - 1]?.timestamp ?? ts()
      const durationMs = startTs && endTs
        ? new Date(endTs).getTime() - new Date(startTs).getTime()
        : 0
      const durationStr = durationMs > 0
        ? `${Math.floor(durationMs / 3600000)}h ${Math.floor((durationMs % 3600000) / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
        : 'unknown'

      const pct = (n: number) => totalWorkflows > 0 ? ((n / totalWorkflows) * 100).toFixed(1) + '%' : '0%'

      const failedResults = results.filter((r) => r.status === 'failed')
      const skippedResults = results.filter((r) => r.status === 'skipped')
      const passedResults = results.filter((r) => r.status === 'passed')

      const lines: string[] = [
        '='.repeat(80),
        'FORGE JUNCTION — WORKFLOW DEBUG PROTOCOL LOG',
        '='.repeat(80),
        `Date: ${startTs}`,
        `App Version: 0.1.0`,
        `Total Workflows: ${totalWorkflows}`,
        `Test Duration: ${durationStr}`,
        '',
        'SUMMARY:',
        `  Passed:  ${passed} (${pct(passed)})`,
        `  Failed:  ${failed} (${pct(failed)})`,
        `  Skipped: ${skipped} (${pct(skipped)})`,
        '',
        '='.repeat(80),
        `FAILED WORKFLOWS (${failedResults.length})`,
        '='.repeat(80),
        '',
        ...failedResults.flatMap((r, i) => [
          `${i + 1}. ${r.slug} (${r.category})`,
          `   Error: ${r.error ?? 'unknown'}`,
          `   Prompt: "${r.testPrompt}"`,
          `   Options: ${r.testOptions}`,
          ...(r.requestBody ? [`   Request Body: ${r.requestBody}`] : []),
          ...(r.apiResponse ? [`   Response: ${r.apiResponse}`] : []),
          `   Elapsed: ${r.elapsed?.toFixed(1) ?? '--'}s`,
          '',
        ]),
        '='.repeat(80),
        `SKIPPED WORKFLOWS (${skippedResults.length})`,
        '='.repeat(80),
        '',
        ...skippedResults.map((r, i) => `${i + 1}. ${r.slug} (${r.category}) — ${r.error ?? 'no reason'}`),
        '',
        '='.repeat(80),
        `PASSED WORKFLOWS (${passedResults.length})`,
        '='.repeat(80),
        '',
        ...passedResults.map((r, i) => `${i + 1}. ${r.slug} (${r.category}) — ${r.elapsed?.toFixed(1) ?? '--'}s — ${r.resultUrl ?? 'no url'}`),
        '',
        '='.repeat(80),
        'FULL EVENT LOG',
        '='.repeat(80),
        '',
        ...log_.map((e) => `[${e.timestamp}] [${e.level.toUpperCase()}] ${e.message}`),
      ]

      const content = lines.join('\n')

      if (typeof window !== 'undefined' && window.electron?.writeDebugLog) {
        const path = await window.electron.writeDebugLog(content)
        return path
      } else {
        // Browser fallback: download
        const blob = new Blob([content], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `debug-${Date.now()}.log`
        a.click()
        URL.revokeObjectURL(url)
        return 'downloaded'
      }
    },
  }
})
