/**
 * Forge Junction — Debug Reporter (Main Process)
 *
 * Handles:
 *  - System info collection
 *  - Log aggregation from renderer (via IPC)
 *  - Report file export (.json / .txt)
 *  - Future: POST to backend report endpoint
 */

import { ipcMain, app, dialog, shell, screen, BrowserWindow } from 'electron'
import { join } from 'path'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import * as os from 'os'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogEntry {
  source: string
  level: string
  message: string
  timestamp: string
  route?: string
}

type RendererMeta = Record<string, unknown>

// ─── In-memory log stores ─────────────────────────────────────────────────────

const _mainLogs: LogEntry[] = []
const _pendingRendererLogs: LogEntry[] = []
const MAX_LOG_ENTRIES = 500

function logMain(level: string, ...args: unknown[]): void {
  if (_mainLogs.length >= MAX_LOG_ENTRIES) _mainLogs.shift()
  _mainLogs.push({
    source: 'main',
    level,
    message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
    timestamp: new Date().toISOString(),
  })
}

// ─── Console Patch ────────────────────────────────────────────────────────────

export function patchMainConsole(): void {
  const _orig: Record<string, (...args: unknown[]) => void> = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
  }

  ;(['log', 'warn', 'error', 'info', 'debug'] as const).forEach((level) => {
    (console as unknown as Record<string, (...args: unknown[]) => void>)[level] = (...args: unknown[]) => {
      _orig[level](...args)
      logMain(level, ...args)
    }
  })

  process.on('uncaughtException', (err: Error) => {
    logMain('error', '[uncaughtException]', err.stack ?? err.message)
  })

  process.on('unhandledRejection', (reason: unknown) => {
    logMain('error', '[unhandledRejection]', reason instanceof Error ? reason.stack : String(reason))
  })
}

// ─── System Info ──────────────────────────────────────────────────────────────

function collectSystemInfo() {
  const displays = screen
    ? screen.getAllDisplays().map((d) => ({
        id: d.id,
        resolution: `${d.size.width}x${d.size.height}`,
        scaleFactor: d.scaleFactor,
        isPrimary: d.id === screen.getPrimaryDisplay().id,
      }))
    : []

  const cpus = os.cpus()

  return {
    app: {
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      v8: process.versions.v8,
      locale: app.getLocale(),
      userDataPath: app.getPath('userData'),
    },
    os: {
      platform: process.platform,
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      type: os.type(),
    },
    hardware: {
      cpu: {
        model: cpus.length ? cpus[0].model : 'unknown',
        cores: cpus.length,
        speedMHz: cpus.length ? cpus[0].speed : 0,
      },
      memory: {
        totalMB: Math.round(os.totalmem() / 1024 / 1024),
        freeMB: Math.round(os.freemem() / 1024 / 1024),
        usedMB: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024),
        usedPercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
      },
      displays,
    },
    process: {
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      memoryUsageMB: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
      },
    },
  }
}

export type SystemInfo = ReturnType<typeof collectSystemInfo>

// ─── Report Assembly ──────────────────────────────────────────────────────────

function assembleReport(rendererLogs: LogEntry[] = [], rendererMeta: RendererMeta = {}) {
  return {
    _meta: {
      reportId: `fj-${Date.now()}`,
      schemaVersion: '1.0.0',
      appName: 'Forge Junction',
      generatedAt: new Date().toISOString(),
    },
    system: collectSystemInfo(),
    logs: {
      main: _mainLogs.slice(),
      renderer: rendererLogs,
    },
    rendererContext: rendererMeta,
  }
}

type Report = ReturnType<typeof assembleReport>

// ─── Text Serialisation ───────────────────────────────────────────────────────

function reportToText(report: Report): string {
  const line = (label: string, value: unknown) => `  ${label.padEnd(22)}: ${value}`
  const divider = '─'.repeat(72)
  const sys = report.system

  const sections = [
    `FORGE JUNCTION — DEBUG REPORT`,
    `Generated : ${report._meta.generatedAt}`,
    `Report ID : ${report._meta.reportId}`,
    divider,
    `APP`,
    line('Version', sys.app.version),
    line('Electron', sys.app.electron),
    line('Node', sys.app.node),
    line('Chrome', sys.app.chrome),
    line('Locale', sys.app.locale),
    divider,
    `SYSTEM`,
    line('OS', `${sys.os.type} ${sys.os.release} (${sys.os.arch})`),
    line('Platform', sys.os.platform),
    line('Hostname', sys.os.hostname),
    divider,
    `HARDWARE`,
    line('CPU', `${sys.hardware.cpu.model} (${sys.hardware.cpu.cores} cores @ ${sys.hardware.cpu.speedMHz} MHz)`),
    line('RAM Total', `${sys.hardware.memory.totalMB} MB`),
    line('RAM Free', `${sys.hardware.memory.freeMB} MB`),
    line('RAM Used', `${sys.hardware.memory.usedMB} MB (${sys.hardware.memory.usedPercent}%)`),
    ...sys.hardware.displays.map((d, i) =>
      line(`Display ${i + 1}${d.isPrimary ? ' (primary)' : ''}`, `${d.resolution} @ ${d.scaleFactor}x`)
    ),
    divider,
    `PROCESS`,
    line('PID', sys.process.pid),
    line('Uptime', `${sys.process.uptimeSeconds}s`),
    line('Heap Used', `${sys.process.memoryUsageMB.heapUsed} MB / ${sys.process.memoryUsageMB.heapTotal} MB`),
    line('RSS', `${sys.process.memoryUsageMB.rss} MB`),
    divider,
    `RENDERER CONTEXT`,
    line('Route/Page', (report.rendererContext.currentRoute as string) ?? 'unknown'),
    line('Render errors', (report.rendererContext.renderErrorCount as number) ?? 0),
    ...((report.rendererContext.lastError as string | null)
      ? [`  Last Error: ${report.rendererContext.lastError}`]
      : []),
    divider,
    `LOGS — MAIN PROCESS (${report.logs.main.length} entries)`,
    ...report.logs.main.map((e) => `[${e.timestamp}] [${e.level.toUpperCase()}] ${e.message}`),
    divider,
    `LOGS — RENDERER (${report.logs.renderer.length} entries)`,
    ...report.logs.renderer.map((e) => `[${e.timestamp}] [${e.level.toUpperCase()}] [${e.source}] ${e.message}`),
    divider,
  ]

  return sections.join('\n')
}

// ─── Export to File ───────────────────────────────────────────────────────────

async function exportReportToFile(browserWindow: BrowserWindow | null, reportPayload: Report) {
  const defaultName = `forge-junction-debug-${Date.now()}`

  const { canceled, filePath } = await dialog.showSaveDialog(browserWindow!, {
    title: 'Export Debug Report',
    defaultPath: join(app.getPath('downloads'), defaultName),
    filters: [
      { name: 'JSON Report', extensions: ['json'] },
      { name: 'Text Report', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })

  if (canceled || !filePath) return { success: false, error: 'cancelled' }

  try {
    const isJson = filePath.endsWith('.json')
    const content = isJson ? JSON.stringify(reportPayload, null, 2) : reportToText(reportPayload)
    writeFileSync(filePath, content, 'utf8')
    shell.showItemInFolder(filePath)
    return { success: true, filePath, reportId: reportPayload._meta.reportId }
  } catch (err) {
    console.error('[DebugReporter] export failed:', err)
    return { success: false, error: (err as Error).message }
  }
}

// ─── Future: Backend Send ─────────────────────────────────────────────────────

async function sendReportToBackend(reportPayload: Report, opts: { endpoint?: string; apiKey?: string } = {}) {
  const endpoint = opts.endpoint ?? process.env.FJ_REPORT_ENDPOINT

  if (!endpoint) {
    console.warn('[DebugReporter] No report endpoint configured. Set FJ_REPORT_ENDPOINT.')
    return { success: false, error: 'no_endpoint' }
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      body: JSON.stringify(reportPayload),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('[DebugReporter] Backend rejected report:', res.status, body)
      return { success: false, error: `http_${res.status}`, detail: body }
    }

    const json = (await res.json().catch(() => ({}))) as { id?: string }
    console.log('[DebugReporter] Report sent. Server ID:', json.id ?? '—')
    return { success: true, serverId: json.id }
  } catch (err) {
    console.error('[DebugReporter] Send failed:', err)
    return { success: false, error: (err as Error).message }
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

export function registerIpcHandlers(): void {
  ipcMain.on('debug:renderer-logs', (_event, logs: LogEntry[]) => {
    _pendingRendererLogs.push(...logs)
    if (_pendingRendererLogs.length > MAX_LOG_ENTRIES) {
      _pendingRendererLogs.splice(0, _pendingRendererLogs.length - MAX_LOG_ENTRIES)
    }
  })

  ipcMain.handle('debug:export-report', async (event, rendererMeta: RendererMeta) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const report = assembleReport(_pendingRendererLogs.slice(), rendererMeta)
    return exportReportToFile(win, report)
  })

  ipcMain.handle('debug:system-info', async () => {
    return collectSystemInfo()
  })

  ipcMain.handle(
    'debug:send-crash-report',
    async (_event, { rendererMeta, auto }: { rendererMeta: RendererMeta; auto: boolean }) => {
      const report = assembleReport(_pendingRendererLogs.slice(), {
        ...rendererMeta,
        triggeredBy: auto ? 'auto_render_failure' : 'user_initiated',
      })

      const logsDir = join(app.getPath('userData'), 'crash-reports')
      if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true })
      const localPath = join(logsDir, `${report._meta.reportId}.json`)
      writeFileSync(localPath, JSON.stringify(report, null, 2), 'utf8')

      const backendResult = await sendReportToBackend(report)
      return { localPath, backend: backendResult, reportId: report._meta.reportId }
    }
  )
}
