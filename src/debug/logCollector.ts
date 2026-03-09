/**
 * Forge Junction — Log Collector (Renderer Process)
 *
 * - Patches window.console to capture all log output
 * - Catches unhandled errors and promise rejections
 * - Tracks render error count and last error
 * - Batches and forwards logs to main process via IPC
 *
 * Usage:
 *   import { initLogCollector } from './debug/logCollector'
 *   initLogCollector()  // call once before ReactDOM.createRoot(...)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogEntry {
  level: string
  source: string
  message: string
  timestamp: string
  route: string
}

export interface RendererMeta {
  currentRoute: string
  renderErrorCount: number
  lastError: string | null
  sessionStart: string
  userAgent: string
  windowSize: string
  devicePixelRatio: number
}

export interface LogSnapshot {
  logs: LogEntry[]
  meta: RendererMeta
}

// ─── Store ────────────────────────────────────────────────────────────────────

const _store = {
  logs: [] as LogEntry[],
  renderErrorCount: 0,
  lastError: null as string | null,
  currentRoute: '/',
  sessionStart: new Date().toISOString(),
}

const MAX_LOGS = 500
let _flushTimer: ReturnType<typeof setInterval> | null = null
const FLUSH_INTERVAL_MS = 5000

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeStringify(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack}`
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 0)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function pushLog(level: string, source: string, args: unknown[]): LogEntry {
  if (_store.logs.length >= MAX_LOGS) _store.logs.shift()

  const entry: LogEntry = {
    level,
    source,
    message: args.map(safeStringify).join(' '),
    timestamp: new Date().toISOString(),
    route: _store.currentRoute,
  }

  _store.logs.push(entry)
  return entry
}

// ─── Console Patch ────────────────────────────────────────────────────────────

const _originalConsole: Record<string, (...args: unknown[]) => void> = {}

function patchConsole(): void {
  const levels = ['log', 'warn', 'error', 'info', 'debug', 'trace'] as const
  levels.forEach((level) => {
    _originalConsole[level] = (console[level] as (...args: unknown[]) => void).bind(console)

    ;(console[level] as unknown as (...args: unknown[]) => void) = (...args: unknown[]) => {
      _originalConsole[level](...args)
      pushLog(level, 'renderer-console', args)
    }
  })
}

export function restoreConsole(): void {
  Object.keys(_originalConsole).forEach((level) => {
    ;(console as unknown as Record<string, (...args: unknown[]) => void>)[level] = _originalConsole[level]
  })
}

// ─── Global Error Handlers ────────────────────────────────────────────────────

function attachGlobalHandlers(): void {
  window.addEventListener('error', (event) => {
    const msg = event.error
      ? `${event.error.name}: ${event.error.message}\n${event.error.stack}`
      : `${event.message} (${event.filename}:${event.lineno}:${event.colno})`

    _store.renderErrorCount += 1
    _store.lastError = msg

    pushLog('error', 'window-onerror', [msg])
    maybeAutoReport('window_error')
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason =
      event.reason instanceof Error
        ? `${event.reason.name}: ${event.reason.message}\n${event.reason.stack}`
        : String(event.reason)

    pushLog('error', 'unhandledrejection', [`[UnhandledPromise] ${reason}`])
  })
}

// ─── React Error Boundary Integration ────────────────────────────────────────

export function reportRenderError(error: Error, info: { componentStack?: string } = {}): void {
  _store.renderErrorCount += 1
  _store.lastError = `${error.name}: ${error.message}`

  pushLog('error', 'react-error-boundary', [
    `[RenderError] ${error.name}: ${error.message}`,
    `Component stack:${info.componentStack ?? ''}`,
    error.stack ?? '',
  ])

  maybeAutoReport('render_failure')
}

// ─── Route Tracking ───────────────────────────────────────────────────────────

export function setCurrentRoute(route: string): void {
  _store.currentRoute = route
  pushLog('info', 'router', [`[Route] ${route}`])
}

// ─── IPC Flush ────────────────────────────────────────────────────────────────

function flushToMain(): void {
  if (!window.electron?.sendLogs) return
  if (_store.logs.length === 0) return
  window.electron.sendLogs(_store.logs.slice())
}

function startPeriodicFlush(): void {
  if (_flushTimer) return
  _flushTimer = setInterval(flushToMain, FLUSH_INTERVAL_MS)
}

export function stopPeriodicFlush(): void {
  if (_flushTimer) {
    clearInterval(_flushTimer)
    _flushTimer = null
  }
}

// ─── Auto-report ──────────────────────────────────────────────────────────────

let _autoReportEnabled = false
const AUTO_REPORT_ERROR_THRESHOLD = 3

export function setAutoReport(enabled: boolean): void {
  _autoReportEnabled = enabled
}

async function maybeAutoReport(_trigger: string): Promise<void> {
  if (!_autoReportEnabled) return
  if (_store.renderErrorCount < AUTO_REPORT_ERROR_THRESHOLD) return
  if (!window.electron?.sendCrashReport) return

  await window.electron.sendCrashReport(buildRendererMeta(), true)
}

// ─── Meta Builder ─────────────────────────────────────────────────────────────

export function buildRendererMeta(): RendererMeta {
  return {
    currentRoute: _store.currentRoute,
    renderErrorCount: _store.renderErrorCount,
    lastError: _store.lastError,
    sessionStart: _store.sessionStart,
    userAgent: navigator.userAgent,
    windowSize: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getLogSnapshot(): LogSnapshot {
  return {
    logs: _store.logs.slice(),
    meta: buildRendererMeta(),
  }
}

export function clearLogs(): void {
  _store.logs.length = 0
}

export async function exportReport(): Promise<{ success: boolean; filePath?: string; reportId?: string; error?: string }> {
  flushToMain()
  if (!window.electron?.exportReport) {
    console.error('[LogCollector] electron.exportReport not available')
    return { success: false, error: 'no_api' }
  }
  return window.electron.exportReport(buildRendererMeta())
}

export async function sendReport(): Promise<{ success: boolean; localPath?: string; backend?: { success: boolean; error?: string; serverId?: string }; reportId?: string; error?: string }> {
  flushToMain()
  if (!window.electron?.sendCrashReport) {
    return { success: false, error: 'no_api' }
  }
  return window.electron.sendCrashReport(buildRendererMeta(), false)
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initLogCollector(opts: { autoReport?: boolean } = {}): void {
  patchConsole()
  attachGlobalHandlers()
  startPeriodicFlush()

  if (opts.autoReport !== undefined) setAutoReport(opts.autoReport)

  console.info('[ForgeJunction] Log collector initialised.')
}
