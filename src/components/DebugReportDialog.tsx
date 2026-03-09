/**
 * Forge Junction — Debug Report Dialog
 *
 * Lets users view live system info, browse recent logs, export a report
 * to file, or send it to the backend (when configured).
 *
 * Trigger: Help → "Export Debug Report"  /  Ctrl+Shift+E
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { exportReport, sendReport, getLogSnapshot, clearLogs, type LogEntry } from '../debug/logCollector'
import type { SystemInfo } from '../../electron/debugReporter'

// ─── Styles ───────────────────────────────────────────────────────────────────

const css = {
  overlay: {
    position: 'fixed' as const, inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  dialog: {
    width: '820px', maxWidth: '95vw', maxHeight: '88vh',
    background: '#0f1117', border: '1px solid #2a2d3a',
    borderRadius: '10px', display: 'flex', flexDirection: 'column' as const,
    fontFamily: '"JetBrains Mono", "Cascadia Code", monospace',
    color: '#c9d1d9', overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  },
  header: {
    padding: '14px 20px', borderBottom: '1px solid #2a2d3a',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#13161e',
  },
  title: { fontSize: '13px', fontWeight: 700, color: '#e6edf3', letterSpacing: '0.06em', textTransform: 'uppercase' as const },
  closeBtn: {
    background: 'none', border: 'none', color: '#768390', cursor: 'pointer',
    fontSize: '20px', lineHeight: 1, padding: '0 4px',
  },
  tabs: { display: 'flex', borderBottom: '1px solid #2a2d3a', background: '#13161e' },
  tab: (active: boolean) => ({
    padding: '8px 18px', fontSize: '11px', fontWeight: 600 as const, cursor: 'pointer',
    border: 'none', background: 'none', letterSpacing: '0.05em',
    color: active ? '#58a6ff' : '#768390',
    borderBottom: active ? '2px solid #58a6ff' : '2px solid transparent',
    transition: 'color 0.15s',
  }),
  body: { flex: 1, overflow: 'auto', padding: '16px 20px' },
  footer: {
    padding: '12px 20px', borderTop: '1px solid #2a2d3a',
    display: 'flex', gap: '10px', alignItems: 'center', background: '#13161e',
  },
  btn: (variant: 'primary' | 'danger' | 'ghost' | 'default' = 'default') => ({
    padding: '7px 16px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 as const,
    cursor: 'pointer', border: 'none', letterSpacing: '0.04em',
    ...(variant === 'primary' ? { background: '#238636', color: '#fff' } :
       variant === 'danger'   ? { background: '#da3633', color: '#fff' } :
       variant === 'ghost'    ? { background: 'transparent', color: '#768390', border: '1px solid #30363d' } :
       { background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d' }),
  }),
  statusMsg: { fontSize: '11px', color: '#3fb950', marginLeft: 'auto', fontStyle: 'italic' as const },
  errorMsg:  { fontSize: '11px', color: '#f85149', marginLeft: 'auto', fontStyle: 'italic' as const },

  // System info
  sysGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  sysCard: { background: '#161b22', borderRadius: '8px', padding: '14px 16px', border: '1px solid #21262d' },
  sysCardTitle: { fontSize: '10px', fontWeight: 700 as const, color: '#58a6ff', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '10px' },
  sysRow: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', lineHeight: '1.9', color: '#768390' },
  sysValue: { color: '#c9d1d9', textAlign: 'right' as const, maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },

  // Logs
  logFilter: { display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' as const, alignItems: 'center' },
  logFilterBtn: (active: boolean, level: string) => {
    const colours: Record<string, string> = { all: '#58a6ff', error: '#f85149', warn: '#d29922', info: '#3fb950', log: '#768390', debug: '#bc8cff' }
    const c = colours[level] ?? '#768390'
    return {
      padding: '3px 10px', borderRadius: '12px', fontSize: '10px', fontWeight: 700 as const,
      cursor: 'pointer', border: `1px solid ${active ? c : '#30363d'}`,
      background: active ? `${c}22` : 'transparent', color: active ? c : '#768390',
      letterSpacing: '0.04em',
    }
  },
  logList: { fontFamily: 'inherit', fontSize: '11px', lineHeight: '1.6', overflowY: 'auto' as const, maxHeight: '360px' },
  logEntry: (level: string) => {
    const colours: Record<string, string> = { error: '#f85149', warn: '#d29922', info: '#3fb950', debug: '#bc8cff', trace: '#6e7681' }
    return { display: 'flex', gap: '10px', padding: '3px 0', borderBottom: '1px solid #161b22', color: colours[level] ?? '#c9d1d9' }
  },
  logTime:   { color: '#3d444d', whiteSpace: 'nowrap' as const, minWidth: '85px' },
  logLevel:  (level: string) => {
    const colours: Record<string, string> = { error: '#f85149', warn: '#d29922', info: '#3fb950', debug: '#bc8cff' }
    return { color: colours[level] ?? '#768390', minWidth: '40px', fontWeight: 700 as const }
  },
  logSource: { color: '#3d444d', minWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  logMsg:    { flex: 1, wordBreak: 'break-all' as const, whiteSpace: 'pre-wrap' as const, color: 'inherit' as const },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SysCard({ title, rows, children }: { title: string; rows: [string, unknown][]; children?: React.ReactNode }) {
  return (
    <div style={css.sysCard}>
      <div style={css.sysCardTitle}>{title}</div>
      {rows.map(([label, value]) => (
        <div key={label} style={css.sysRow}>
          <span>{label}</span>
          <span style={css.sysValue} title={String(value)}>{value != null ? String(value) : '—'}</span>
        </div>
      ))}
      {children}
    </div>
  )
}

function MemBar({ used, total }: { used: number; total: number }) {
  const pct = total ? Math.round((used / total) * 100) : 0
  const colour = pct > 85 ? '#f85149' : pct > 65 ? '#d29922' : '#3fb950'
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ height: '4px', background: '#21262d', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: colour, borderRadius: '2px', transition: 'width 0.4s' }} />
      </div>
      <div style={{ fontSize: '10px', color: '#3d444d', marginTop: '4px' }}>{pct}% used</div>
    </div>
  )
}

// ─── Logs Tab ─────────────────────────────────────────────────────────────────

const LEVELS = ['all', 'error', 'warn', 'info', 'log', 'debug'] as const

function LogsTab({ logs }: { logs: LogEntry[] }) {
  const [filter, setFilter] = useState<string>('all')
  const bottomRef = useRef<HTMLDivElement>(null)

  const filtered = filter === 'all' ? logs : logs.filter((e) => e.level === filter)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  const counts = LEVELS.reduce<Record<string, number>>((acc, l) => {
    acc[l] = l === 'all' ? logs.length : logs.filter((e) => e.level === l).length
    return acc
  }, {})

  return (
    <>
      <div style={css.logFilter}>
        {LEVELS.map((l) => (
          <button key={l} style={css.logFilterBtn(filter === l, l)} onClick={() => setFilter(l)}>
            {l.toUpperCase()} {(counts[l] ?? 0) > 0 && <span>({counts[l]})</span>}
          </button>
        ))}
      </div>
      <div style={css.logList}>
        {filtered.length === 0 && (
          <div style={{ color: '#3d444d', fontSize: '11px', padding: '20px 0', textAlign: 'center' }}>
            No {filter === 'all' ? '' : filter} entries captured yet.
          </div>
        )}
        {filtered.map((entry, i) => (
          <div key={i} style={css.logEntry(entry.level)}>
            <span style={css.logTime}>{entry.timestamp.slice(11, 23)}</span>
            <span style={css.logLevel(entry.level)}>{(entry.level || 'log').slice(0, 5).toUpperCase()}</span>
            <span style={css.logSource}>{entry.source}</span>
            <span style={css.logMsg}>{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </>
  )
}

// ─── System Tab ───────────────────────────────────────────────────────────────

function SystemTab({ sysInfo }: { sysInfo: SystemInfo | null }) {
  if (!sysInfo) {
    return <div style={{ color: '#768390', fontSize: '12px' }}>Loading system info…</div>
  }

  const { app, os: osInfo, hardware, process: proc } = sysInfo

  return (
    <div style={css.sysGrid}>
      <SysCard title="Application" rows={[
        ['Name', app.name],
        ['Version', app.version],
        ['Electron', app.electron],
        ['Node', app.node],
        ['Chrome', app.chrome],
        ['Locale', app.locale],
      ]} />
      <SysCard title="Operating System" rows={[
        ['Platform', osInfo.platform],
        ['Type', osInfo.type],
        ['Release', osInfo.release],
        ['Architecture', osInfo.arch],
        ['Hostname', osInfo.hostname],
      ]} />
      <SysCard title="Hardware" rows={[
        ['CPU', hardware.cpu.model],
        ['Cores', hardware.cpu.cores],
        ['Speed', `${hardware.cpu.speedMHz} MHz`],
        ['RAM Total', `${hardware.memory.totalMB} MB`],
        ['RAM Free', `${hardware.memory.freeMB} MB`],
      ]}>
        <MemBar used={hardware.memory.usedMB} total={hardware.memory.totalMB} />
      </SysCard>
      <SysCard title="Process" rows={[
        ['PID', proc.pid],
        ['Uptime', `${proc.uptimeSeconds}s`],
        ['Heap Used', `${proc.memoryUsageMB.heapUsed} MB`],
        ['Heap Total', `${proc.memoryUsageMB.heapTotal} MB`],
        ['RSS', `${proc.memoryUsageMB.rss} MB`],
        ['External', `${proc.memoryUsageMB.external} MB`],
      ]} />
      {hardware.displays.map((d, i) => (
        <SysCard key={d.id} title={`Display ${i + 1}${d.isPrimary ? ' (Primary)' : ''}`} rows={[
          ['Resolution', d.resolution],
          ['Scale Factor', `${d.scaleFactor}x`],
        ]} />
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

export default function DebugReportDialog({ open, onClose }: Props) {
  const [tab, setTab] = useState<'logs' | 'system'>('logs')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    const snap = getLogSnapshot()
    setLogs(snap.logs)
    window.electron?.getSystemInfo?.().then(setSysInfo).catch(console.error)
  }, [open])

  const handleExport = useCallback(async () => {
    setExporting(true)
    setStatus(null)
    try {
      const result = await exportReport()
      if (result.success) {
        setStatus({ type: 'ok', msg: `Saved — ID: ${result.reportId}` })
      } else {
        setStatus({ type: 'err', msg: result.error === 'cancelled' ? 'Export cancelled.' : `Export failed: ${result.error}` })
      }
    } finally {
      setExporting(false)
    }
  }, [])

  const handleSend = useCallback(async () => {
    setSending(true)
    setStatus(null)
    try {
      const result = await sendReport()
      if (result.backend?.success) {
        setStatus({ type: 'ok', msg: `Sent! Server ID: ${result.backend.serverId ?? result.reportId}` })
      } else if (result.backend?.error === 'no_endpoint') {
        setStatus({ type: 'err', msg: 'No backend configured yet — file saved locally.' })
      } else {
        setStatus({ type: 'err', msg: `Send failed: ${result.backend?.error ?? 'unknown'}` })
      }
    } finally {
      setSending(false)
    }
  }, [])

  const handleClear = useCallback(() => {
    clearLogs()
    setLogs([])
    setStatus({ type: 'ok', msg: 'Logs cleared.' })
  }, [])

  if (!open) return null

  return (
    <div style={css.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={css.dialog} role="dialog" aria-modal aria-label="Debug Report">
        {/* Header */}
        <div style={css.header}>
          <span style={css.title}>Forge Junction — Debug Report</span>
          <button style={css.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Tabs */}
        <div style={css.tabs}>
          {(['logs', 'system'] as const).map((t) => (
            <button key={t} style={css.tab(tab === t)} onClick={() => setTab(t)}>
              {t === 'logs' ? `Logs (${logs.length})` : 'System Info'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={css.body}>
          {tab === 'logs'   && <LogsTab logs={logs} />}
          {tab === 'system' && <SystemTab sysInfo={sysInfo} />}
        </div>

        {/* Footer */}
        <div style={css.footer}>
          <button style={css.btn('primary')} onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : '↓ Export to File'}
          </button>
          <button style={css.btn()} onClick={handleSend} disabled={sending} title="Requires backend endpoint">
            {sending ? 'Sending…' : '↑ Send Report'}
          </button>
          <button style={css.btn('ghost')} onClick={handleClear}>Clear Logs</button>
          {status && (
            <span style={status.type === 'ok' ? css.statusMsg : css.errorMsg}>
              {status.msg}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
