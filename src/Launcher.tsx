import React, { useEffect, useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

type BlockType = 'announcement' | 'changelog' | 'tutorial' | 'notification'

interface FeedBlock {
  id: string
  type: BlockType
  pinned: boolean
  title: string
  body: string
  version?: string
  items?: string[]
  publishedAt: string
}

interface FeedData {
  _meta: { version: number; updatedAt: string }
  blocks: FeedBlock[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400 / 7)}w ago`
  return `${Math.floor(diff / 86400 / 30)}mo ago`
}

const BORDER: Record<BlockType, string> = {
  announcement: 'border-l-amber-500',
  changelog:    'border-l-arc',
  tutorial:     'border-l-green-500',
  notification: 'border-l-yellow-400',
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="border-l-2 border-l-dim bg-surface-raised rounded-sm px-3 py-3 animate-pulse">
      <div className="h-3 bg-surface-overlay rounded w-1/3 mb-2" />
      <div className="h-2 bg-surface-overlay rounded w-3/4 mb-1" />
      <div className="h-2 bg-surface-overlay rounded w-1/2" />
    </div>
  )
}

function FeedCard({ block }: { block: FeedBlock }) {
  const borderClass = BORDER[block.type] ?? 'border-l-dim'

  return (
    <div className={`border-l-2 ${borderClass} bg-surface-raised rounded-sm px-3 py-3 flex flex-col gap-1`}>
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        {block.type === 'changelog' && block.version && (
          <span className="text-[10px] font-mono text-arc bg-arc/10 border border-arc/20 px-1.5 py-0.5 rounded-sm leading-none">
            {block.version}
          </span>
        )}
        {block.type === 'tutorial' && (
          <span className="text-[10px] font-mono text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-sm leading-none">
            TIP
          </span>
        )}
        <span className="text-[11px] font-semibold text-white/90 leading-snug flex-1">
          {block.title}
        </span>
        {block.pinned && (
          <svg className="w-3 h-3 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
          </svg>
        )}
      </div>

      {/* Body */}
      {block.body && (
        <p className="text-[11px] text-muted leading-relaxed">{block.body}</p>
      )}

      {/* Changelog items */}
      {block.type === 'changelog' && block.items && block.items.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {block.items.map((item, i) => (
            <li key={i} className="text-[11px] text-white/70 flex gap-1.5">
              <span className="text-arc shrink-0">–</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Timestamp */}
      <p className="text-[10px] text-dim mt-1">{timeAgo(block.publishedAt)}</p>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function Launcher() {
  const [feed, setFeed] = useState<FeedBlock[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [version, setVersion] = useState('')

  async function loadFeed() {
    setLoading(true)
    setError(false)
    try {
      const result = await window.electron.fetchFeed()
      if (!result.ok) throw new Error(result.error)
      const data: FeedData = result.data
      const sorted = [...data.blocks].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      })
      setFeed(sorted)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFeed()
    window.electron.getAppVersion().then(setVersion)
  }, [])

  return (
    <div className="flex flex-col h-full bg-surface select-none overflow-hidden">

      {/* Title bar — drag region */}
      <div
        className="flex items-center justify-between px-3 shrink-0 border-b border-dim/40"
        style={{ height: 32, WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-[11px] font-bebas tracking-widest text-white/70">
          FORGE JUNCTION
        </span>
        <button
          className="text-muted hover:text-white/90 transition-colors text-base leading-none"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={() => window.electron.sendQuit()}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Feed area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 min-h-0">
        {loading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {!loading && error && (
          <div className="border-l-2 border-l-yellow-500 bg-surface-raised rounded-sm px-3 py-3">
            <p className="text-[11px] text-muted mb-2">Could not load feed — check your connection.</p>
            <button
              onClick={loadFeed}
              className="text-[10px] text-arc hover:text-arc/70 transition-colors underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && feed && feed.map(block => (
          <FeedCard key={block.id} block={block} />
        ))}
      </div>

      {/* Launch bar */}
      <div
        className="shrink-0 flex items-center justify-between px-3 border-t border-dim/40 bg-surface-raised"
        style={{ height: 56 }}
      >
        <span className="text-[10px] text-dim font-mono">{version ? `v${version}` : ''}</span>
        <button
          onClick={() => window.electron.sendLaunch()}
          className="btn-primary-submit px-4 py-2 text-[11px] rounded-sm"
        >
          LAUNCH FORGE JUNCTION →
        </button>
      </div>

    </div>
  )
}
