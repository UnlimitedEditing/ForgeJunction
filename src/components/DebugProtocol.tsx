import React, { useEffect, useRef, useState } from 'react'
import { useDebugProtocolStore, type DebugWorkflowResult } from '@/stores/debugProtocol'

type FilterTab = 'all' | 'passed' | 'failed' | 'skipped' | 'pending'
type SortField = 'category' | 'slug' | 'elapsed' | 'status'

function statusIcon(status: DebugWorkflowResult['status']): string {
  switch (status) {
    case 'passed': return '✓'
    case 'failed': return '✗'
    case 'skipped': return '⊘'
    case 'running': return '⟳'
    default: return '○'
  }
}

function statusColor(status: DebugWorkflowResult['status']): string {
  switch (status) {
    case 'passed': return 'text-green-400'
    case 'failed': return 'text-red-400'
    case 'skipped': return 'text-yellow-400'
    case 'running': return 'text-brand animate-pulse'
    default: return 'text-white/30'
  }
}

function rowBg(status: DebugWorkflowResult['status']): string {
  switch (status) {
    case 'passed': return 'bg-green-500/5'
    case 'failed': return 'bg-red-500/8'
    case 'skipped': return 'bg-yellow-500/5'
    case 'running': return 'bg-brand/10'
    default: return ''
  }
}

function formatElapsed(s: number | null): string {
  if (s === null) return '--'
  return `${s.toFixed(1)}s`
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export default function DebugProtocol(): React.ReactElement | null {
  const {
    isOpen, close, isRunning, shouldStop, results,
    passed, failed, skipped, completed, totalWorkflows,
    logEntries, startFullRun, retryFailed, stop, reset, exportLog, startSingleTest,
  } = useDebugProtocolStore()

  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [posInit, setPosInit] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [sortField, setSortField] = useState<SortField>('category')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [exportPath, setExportPath] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Init position to center
  useEffect(() => {
    if (!posInit && isOpen) {
      setPos({ x: Math.max(0, window.innerWidth / 2 - 375), y: Math.max(0, window.innerHeight / 2 - 280) })
      setPosInit(true)
    }
  }, [isOpen, posInit])

  // Dragging
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y })
    const onUp = () => setDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [dragging, dragOffset])

  // Elapsed counter for running test
  const runningResult = results.find((r) => r.status === 'running')
  useEffect(() => {
    if (!runningResult?.startedAt) { setElapsedSec(0); return }
    const start = runningResult.startedAt
    setElapsedSec(Math.floor((Date.now() - start) / 1000))
    const id = setInterval(() => setElapsedSec(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [runningResult?.slug, runningResult?.startedAt])

  // Auto-scroll log
  useEffect(() => {
    if (showLog) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logEntries.length, showLog])

  if (!isOpen) return null

  // ── Filtering + sorting ────────────────────────────────────────────────────
  const filtered = results.filter((r) => {
    if (filterTab === 'all') return true
    if (filterTab === 'passed') return r.status === 'passed'
    if (filterTab === 'failed') return r.status === 'failed'
    if (filterTab === 'skipped') return r.status === 'skipped'
    if (filterTab === 'pending') return r.status === 'pending'
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortField === 'category') cmp = a.category.localeCompare(b.category) || a.slug.localeCompare(b.slug)
    else if (sortField === 'slug') cmp = a.slug.localeCompare(b.slug)
    else if (sortField === 'elapsed') cmp = (a.elapsed ?? 9999) - (b.elapsed ?? 9999)
    else if (sortField === 'status') cmp = a.status.localeCompare(b.status)
    return sortDir === 'asc' ? cmp : -cmp
  })

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function SortHeader({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field
    return (
      <button
        onClick={() => handleSort(field)}
        className={`text-left text-xs font-semibold uppercase tracking-widest transition-colors ${active ? 'text-brand' : 'text-white/40 hover:text-white/70'}`}
      >
        {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    )
  }

  // Stats
  const pending = totalWorkflows - passed - failed - skipped
  const pct = totalWorkflows > 0 ? Math.round((completed / totalWorkflows) * 100) : 0
  const avgElapsed = results.filter((r) => r.elapsed !== null).reduce((acc, r) => acc + (r.elapsed ?? 0), 0) /
    Math.max(1, results.filter((r) => r.elapsed !== null).length)
  const estRemainingMs = pending > 0 ? pending * avgElapsed * 1000 : 0

  // Overall elapsed
  const firstLog = logEntries[0]
  const overallElapsedMs = firstLog ? Date.now() - new Date(firstLog.timestamp).getTime() : 0

  async function handleExport() {
    const path = await exportLog()
    setExportPath(path)
    setTimeout(() => setExportPath(null), 5000)
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        className="pointer-events-auto absolute flex flex-col bg-neutral-900 border border-white/10 rounded-lg shadow-2xl overflow-hidden"
        style={{ left: pos.x, top: pos.y, width: 750, maxHeight: '85vh' }}
      >
        {/* ── Title bar ── */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-neutral-800 border-b border-white/10 cursor-move select-none flex-shrink-0"
          onMouseDown={(e) => { setDragging(true); setDragOffset({ x: e.clientX - pos.x, y: e.clientY - pos.y }) }}
        >
          <span className="themed-heading text-sm font-semibold text-white">🔧 Workflow Debug Protocol</span>
          <button onClick={close} className="text-white/40 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>

        {/* ── Controls ── */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-white/10 flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => startFullRun()}
              disabled={isRunning}
              className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 hover:bg-brand/80 transition-colors"
            >
              ▶ Run All
            </button>
            <button
              onClick={() => retryFailed()}
              disabled={isRunning || failed === 0}
              className="rounded bg-neutral-700 px-3 py-1.5 text-xs text-white/70 disabled:opacity-40 hover:bg-neutral-600 transition-colors"
            >
              🔄 Retry Failed
            </button>
            <button
              onClick={stop}
              disabled={!isRunning}
              className="rounded bg-neutral-700 px-3 py-1.5 text-xs text-white/70 disabled:opacity-40 hover:bg-red-900/40 hover:text-red-400 transition-colors"
            >
              {shouldStop ? 'Stopping…' : '⏹ Stop'}
            </button>
            <button
              onClick={reset}
              disabled={isRunning}
              className="rounded bg-neutral-700 px-3 py-1.5 text-xs text-white/70 disabled:opacity-40 hover:bg-neutral-600 transition-colors"
            >
              🗑 Reset
            </button>
            <button
              onClick={handleExport}
              disabled={results.length === 0}
              className="rounded bg-neutral-700 px-3 py-1.5 text-xs text-white/70 disabled:opacity-40 hover:bg-neutral-600 transition-colors"
            >
              💾 Export Log
            </button>
            {exportPath && (
              <span className="text-xs text-green-400 truncate max-w-48" title={exportPath}>
                Saved: {exportPath}
              </span>
            )}
          </div>

          {totalWorkflows > 0 && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="fill-progress h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-white/60 shrink-0">{completed}/{totalWorkflows} ({pct}%)</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/50">
                {isRunning && overallElapsedMs > 0 && (
                  <span>Elapsed: {formatDuration(overallElapsedMs)}</span>
                )}
                {isRunning && estRemainingMs > 0 && (
                  <span>• Est. remaining: ~{formatDuration(estRemainingMs)}</span>
                )}
                <span className="text-green-400">✓ {passed} passed</span>
                <span className="text-red-400">✗ {failed} failed</span>
                <span className="text-yellow-400">⊘ {skipped} skipped</span>
                <span className="text-white/30">○ {pending} pending</span>
              </div>
            </>
          )}
        </div>

        {/* ── Current test ── */}
        {runningResult && (
          <div className="flex-shrink-0 px-4 py-2 border-b border-white/10 bg-brand/5 text-xs flex flex-col gap-0.5">
            <p className="text-white/70">
              Currently testing: <span className="text-white font-mono">{runningResult.slug}</span>
              <span className="text-white/40 ml-2">({runningResult.category})</span>
            </p>
            <p className="text-white/50">Prompt: "{runningResult.testPrompt}"</p>
            <p className="text-white/50">Options: <span className="font-mono">{runningResult.testOptions}</span></p>
            <p className="text-white/40">Elapsed: {elapsedSec}s</p>
          </div>
        )}

        {/* ── Results table ── */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Filter tabs */}
          <div className="flex gap-1 px-3 pt-2 pb-1 border-b border-white/5 flex-shrink-0">
            {(['all', 'passed', 'failed', 'skipped', 'pending'] as FilterTab[]).map((tab) => {
              const count = tab === 'all' ? results.length
                : tab === 'passed' ? passed
                : tab === 'failed' ? failed
                : tab === 'skipped' ? skipped
                : pending
              return (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={`rounded px-2 py-0.5 text-xs transition-colors capitalize ${filterTab === tab ? 'bg-brand text-white' : 'text-white/40 hover:text-white/70'}`}
                >
                  {tab} ({count})
                </button>
              )
            })}
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[28px_120px_1fr_60px_1fr] gap-2 px-3 py-1.5 border-b border-white/10 flex-shrink-0">
            <div />
            <SortHeader field="category" label="Category" />
            <SortHeader field="slug" label="Workflow" />
            <SortHeader field="elapsed" label="Time" />
            <span className="text-xs font-semibold uppercase tracking-widest text-white/40">Error</span>
          </div>

          {/* Table rows */}
          <div className="flex-1 overflow-y-auto">
            {sorted.length === 0 && (
              <p className="px-4 py-6 text-xs text-white/30 text-center">
                {results.length === 0 ? 'Click "Run All" to start testing workflows.' : 'No results match this filter.'}
              </p>
            )}
            {sorted.map((r) => (
              <div key={r.slug} className={`border-b border-white/5 ${rowBg(r.status)}`}>
                {/* Main row */}
                <button
                  onClick={() => setExpandedSlug(expandedSlug === r.slug ? null : r.slug)}
                  className="w-full grid grid-cols-[28px_120px_1fr_60px_1fr] gap-2 px-3 py-1.5 text-left hover:bg-white/5 transition-colors"
                >
                  <span className={`text-sm font-bold ${statusColor(r.status)}`}>{statusIcon(r.status)}</span>
                  <span className="text-xs text-white/50 truncate">{r.category}</span>
                  <span className="text-xs font-mono text-white/80 truncate">{r.slug}</span>
                  <span className="text-xs text-white/40">{formatElapsed(r.elapsed)}</span>
                  <span className="text-xs text-red-400/80 truncate">{r.error ? r.error.slice(0, 40) : ''}</span>
                </button>

                {/* Expanded row */}
                {expandedSlug === r.slug && (
                  <div className="px-4 pb-3 flex flex-col gap-2 bg-black/20">
                    {r.error && (
                      <div>
                        <p className="text-xs text-white/40 mb-0.5">Error:</p>
                        <p className="text-xs text-red-400 font-mono whitespace-pre-wrap">{r.error}</p>
                      </div>
                    )}
                    {r.requestBody && (
                      <div>
                        <p className="text-xs text-white/40 mb-0.5">Request body:</p>
                        <pre className="text-xs text-white/60 font-mono bg-black/40 rounded p-2 overflow-x-auto max-h-28">{r.requestBody}</pre>
                      </div>
                    )}
                    {r.apiResponse && (
                      <div>
                        <p className="text-xs text-white/40 mb-0.5">Response:</p>
                        <pre className="text-xs text-white/50 font-mono bg-black/40 rounded p-2 overflow-x-auto max-h-28">{r.apiResponse}</pre>
                      </div>
                    )}
                    {r.resultUrl && (
                      <a href={r.resultUrl} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline truncate">{r.resultUrl}</a>
                    )}
                    <div className="flex gap-2">
                      {r.status === 'failed' && (
                        <button
                          onClick={() => startSingleTest(r.slug)}
                          disabled={isRunning}
                          className="rounded bg-neutral-700 px-2.5 py-1 text-xs text-white/70 hover:bg-neutral-600 disabled:opacity-40 transition-colors"
                        >
                          Retry This
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const detail = [
                            `Workflow: ${r.slug} (${r.category})`,
                            `Status: ${r.status}`,
                            `Error: ${r.error ?? 'none'}`,
                            `Elapsed: ${formatElapsed(r.elapsed)}`,
                            `Request: ${r.requestBody ?? 'n/a'}`,
                            `Response: ${r.apiResponse ?? 'n/a'}`,
                          ].join('\n')
                          navigator.clipboard.writeText(detail)
                        }}
                        className="rounded bg-neutral-700 px-2.5 py-1 text-xs text-white/70 hover:bg-neutral-600 transition-colors"
                      >
                        Copy Error
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Log viewer ── */}
        <div className="flex-shrink-0 border-t border-white/10">
          <button
            onClick={() => setShowLog((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            <span>{showLog ? 'Hide Live Log ▲' : 'Show Live Log ▼'}</span>
            <span className="text-white/20">{logEntries.length} entries</span>
          </button>
          {showLog && (
            <div className="max-h-36 overflow-y-auto bg-black/50 px-3 py-2 font-mono text-xs">
              {logEntries.map((e, i) => (
                <div key={i} className="leading-5 flex gap-2">
                  <span className="text-white/20 shrink-0">{e.timestamp.slice(11, 19)}</span>
                  <span className={e.level === 'error' ? 'text-red-400' : e.level === 'warn' ? 'text-yellow-400' : 'text-white/70'}>
                    {e.message}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
