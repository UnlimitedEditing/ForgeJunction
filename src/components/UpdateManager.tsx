/**
 * Forge Junction — UpdateManager
 *
 * Listens to auto-updater IPC events and renders:
 *  - A persistent status pill (bottom-right, always visible when update activity exists)
 *  - A floating card modal (dismissible) with progress / install controls
 */

import React, { useEffect, useReducer, useCallback } from 'react'

// ─── State ────────────────────────────────────────────────────────────────────

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

interface UpdateState {
  status: UpdateStatus
  version: string | null
  progress: { percent: number; bytesPerSecond: number; transferred: number; total: number } | null
  error: string | null
  dismissed: boolean
}

type UpdateAction =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'progress'; progress: UpdateState['progress'] }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }
  | { type: 'dismiss' }
  | { type: 'show' }

const initialState: UpdateState = {
  status: 'idle',
  version: null,
  progress: null,
  error: null,
  dismissed: false,
}

function reducer(state: UpdateState, action: UpdateAction): UpdateState {
  switch (action.type) {
    case 'checking':
      return { ...state, status: 'checking', dismissed: false }
    case 'available':
      return { ...state, status: 'available', version: action.version, dismissed: false }
    case 'not-available':
      return { ...state, status: 'idle' }
    case 'progress':
      return { ...state, status: 'downloading', progress: action.progress }
    case 'downloaded':
      return { ...state, status: 'downloaded', version: action.version, dismissed: false }
    case 'error':
      return { ...state, status: 'error', error: action.message }
    case 'dismiss':
      return { ...state, dismissed: true }
    case 'show':
      return { ...state, dismissed: false }
    default:
      return state
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pill: React.CSSProperties = {
  position: 'fixed',
  bottom: '36px', // sit above status bar
  right: '16px',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
  padding: '5px 12px',
  background: 'rgba(15,15,15,0.92)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '999px',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.03em',
  cursor: 'pointer',
  backdropFilter: 'blur(6px)',
  userSelect: 'none',
}

const card: React.CSSProperties = {
  position: 'fixed',
  bottom: '72px',
  right: '16px',
  zIndex: 1001,
  width: '300px',
  background: '#1a1a1a',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  padding: '16px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  fontFamily: 'inherit',
  color: '#e5e5e5',
}

const cardTitle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 700,
  marginBottom: '4px',
}

const cardSub: React.CSSProperties = {
  fontSize: '11px',
  color: '#888',
  marginBottom: '12px',
}

const progressTrack: React.CSSProperties = {
  height: '4px',
  background: '#333',
  borderRadius: '2px',
  overflow: 'hidden',
  marginBottom: '12px',
}

const btnRow: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  justifyContent: 'flex-end',
}

function btn(variant: 'primary' | 'ghost'): React.CSSProperties {
  return {
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
    border: 'none',
    ...(variant === 'primary'
      ? { background: '#6c47ff', color: '#fff' }
      : { background: 'transparent', color: '#666', border: '1px solid #333' }),
  }
}

// ─── Dot ──────────────────────────────────────────────────────────────────────

function Dot({ colour, pulse }: { colour: string; pulse?: boolean }) {
  return (
    <span
      style={{
        width: 8, height: 8,
        borderRadius: '50%',
        background: colour,
        display: 'inline-block',
        flexShrink: 0,
        animation: pulse ? 'fj-pulse 1.4s ease-in-out infinite' : undefined,
      }}
    />
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UpdateManager() {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Subscribe to IPC events
  useEffect(() => {
    const e = window.electron
    if (!e) return

    const cleanups = [
      e.onUpdateChecking(() => dispatch({ type: 'checking' })),
      e.onUpdateAvailable((info) => dispatch({ type: 'available', version: info.version })),
      e.onUpdateNotAvailable(() => dispatch({ type: 'not-available' })),
      e.onUpdateProgress((progress) => dispatch({ type: 'progress', progress })),
      e.onUpdateDownloaded((info) => dispatch({ type: 'downloaded', version: info.version })),
      e.onUpdateError((err) => dispatch({ type: 'error', message: err.message })),
    ]

    return () => cleanups.forEach((fn) => fn())
  }, [])

  const dismiss = useCallback(() => dispatch({ type: 'dismiss' }), [])
  const show    = useCallback(() => dispatch({ type: 'show' }), [])
  const install = useCallback(() => window.electron?.installUpdate(), [])

  const { status, version, progress, error, dismissed } = state

  // ── Pill ──────────────────────────────────────────────────────────────────

  const showPill =
    status === 'available' || status === 'downloading' || status === 'downloaded' || status === 'error'

  const pillContent = (() => {
    if (status === 'downloaded')   return <><Dot colour="#22c55e" />Restart to update</>
    if (status === 'available' || status === 'downloading') return <><Dot colour="#f59e0b" pulse />Update available</>
    if (status === 'error')        return <><Dot colour="#ef4444" />Update error</>
    return null
  })()

  // ── Card ──────────────────────────────────────────────────────────────────

  const showCard = showPill && !dismissed

  const cardContent = (() => {
    if (status === 'downloaded') {
      return (
        <>
          <div style={cardTitle}>Update ready to install</div>
          <div style={cardSub}>Forge Junction {version} is ready.</div>
          <div style={btnRow}>
            <button style={btn('ghost')} onClick={dismiss}>Later</button>
            <button style={btn('primary')} onClick={install}>Restart &amp; Install</button>
          </div>
        </>
      )
    }

    if (status === 'available' || status === 'downloading') {
      const pct = progress?.percent ?? 0
      return (
        <>
          <div style={cardTitle}>Forge Junction {version} is available</div>
          <div style={cardSub}>
            {status === 'downloading'
              ? `Downloading… ${Math.round(pct)}%`
              : 'Preparing download…'}
          </div>
          <div style={progressTrack}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#6c47ff', borderRadius: '2px', transition: 'width 0.3s' }} />
          </div>
          <div style={btnRow}>
            <button style={btn('ghost')} onClick={dismiss}>Dismiss</button>
          </div>
        </>
      )
    }

    if (status === 'error') {
      return (
        <>
          <div style={cardTitle}>Update error</div>
          <div style={{ ...cardSub, color: '#f87171', marginBottom: '12px' }}>{error}</div>
          <div style={btnRow}>
            <button style={btn('ghost')} onClick={dismiss}>Dismiss</button>
          </div>
        </>
      )
    }

    return null
  })()

  return (
    <>
      {/* Keyframe for pulsing dot — injected once */}
      <style>{`
        @keyframes fj-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {showCard && (
        <div style={card}>
          {cardContent}
        </div>
      )}

      {showPill && (
        <div style={pill} onClick={show} title="Click to view update details">
          {pillContent}
        </div>
      )}
    </>
  )
}
