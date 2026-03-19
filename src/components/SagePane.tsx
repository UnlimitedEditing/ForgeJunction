import React, { useEffect, useRef, useState } from 'react'
import SkillStar from '@/components/icons/SkillStar'
import { kbChat, SAGE_DOMAIN } from '@/api/knowledge'

// ── Feed types (mirrors Launcher.tsx) ────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)          return 'just now'
  if (diff < 3600)        return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)       return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7)   return `${Math.floor(diff / 86400)}d ago`
  if (diff < 86400 * 30)  return `${Math.floor(diff / 86400 / 7)}w ago`
  return `${Math.floor(diff / 86400 / 30)}mo ago`
}

const BLOCK_ACCENT: Record<BlockType, string> = {
  announcement: 'border-l-amber-500',
  changelog:    'border-l-[#4ae3ff]',
  tutorial:     'border-l-green-500',
  notification: 'border-l-yellow-400',
}

// ── Feed sub-components ───────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="border-l-2 border-l-white/10 bg-white/[0.03] rounded px-3 py-3 animate-pulse">
      <div className="h-3 bg-white/10 rounded w-1/3 mb-2" />
      <div className="h-2 bg-white/8 rounded w-3/4 mb-1" />
      <div className="h-2 bg-white/8 rounded w-1/2" />
    </div>
  )
}

function FeedCard({ block, isNew }: { block: FeedBlock; isNew: boolean }) {
  return (
    <div className={`border-l-2 ${BLOCK_ACCENT[block.type]} bg-white/[0.03] rounded px-3 py-3 flex flex-col gap-1 ${isNew ? 'ring-1 ring-white/10' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {block.type === 'changelog' && block.version && (
          <span className="text-[10px] font-mono text-[#4ae3ff] bg-[#4ae3ff]/10 border border-[#4ae3ff]/20 px-1.5 py-0.5 rounded leading-none">
            {block.version}
          </span>
        )}
        {block.type === 'tutorial' && (
          <span className="text-[10px] font-mono text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded leading-none">
            TIP
          </span>
        )}
        {block.type === 'notification' && (
          <span className="text-[10px] font-mono text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-1.5 py-0.5 rounded leading-none">
            NEW
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
        {isNew && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#6affc8] shrink-0" title="New" />
        )}
      </div>

      {block.body && (
        <p className="text-[11px] text-white/45 leading-relaxed">{block.body}</p>
      )}

      {block.type === 'changelog' && block.items && block.items.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {block.items.map((item, i) => (
            <li key={i} className="text-[11px] text-white/65 flex gap-1.5">
              <span className="text-[#4ae3ff] shrink-0">–</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-white/22 mt-1">{timeAgo(block.publishedAt)}</p>
    </div>
  )
}

// ── Chat types ────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  typing?: boolean
}

const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: "Hey! I'm Sage. Ask me anything about ForgeJunction — workflows, prompting, getting the best from your renders, or anything else.",
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LAST_SEEN_KEY = 'fj-sage-last-seen'

// Sage teal palette (reused from CSS vars but written inline for Tailwind arbitrary values)
const S = {
  border:       'rgba(106,255,200,0.12)',
  borderFocus:  'rgba(106,255,200,0.30)',
  bg:           'rgba(106,255,200,0.05)',
  bgLight:      'rgba(106,255,200,0.10)',
  bgHeader:     'rgba(106,255,200,0.04)',
  glow:         '0 0 60px rgba(106,255,200,0.07), 0 8px 40px rgba(0,0,0,0.65)',
  text:         '#6affc8',
  bubble:       'rgba(106,255,200,0.05)',
  bubbleBorder: 'rgba(106,255,200,0.10)',
  userBubble:   'rgba(255,107,43,0.06)',
  userBorder:   'rgba(255,107,43,0.12)',
}

// ── SagePane ──────────────────────────────────────────────────────────────────

export default function SagePane(): React.ReactElement {
  const [open, setOpen]           = useState(false)
  const [activeTab, setActiveTab] = useState<'updates' | 'sage'>('updates')

  // Feed
  const [feed, setFeed]           = useState<FeedBlock[] | null>(null)
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedError, setFeedError] = useState(false)
  const [lastSeenTs, setLastSeenTs] = useState(
    () => parseInt(localStorage.getItem(LAST_SEEN_KEY) ?? '0')
  )

  // Chat
  const [messages, setMessages]   = useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [input, setInput]         = useState('')
  const [isSending, setIsSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)

  // Load feed eagerly on mount so the badge count is correct immediately
  useEffect(() => {
    loadFeed()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Mark updates as seen when the tab is visible
  useEffect(() => {
    if (open && activeTab === 'updates') markFeedSeen()
  }, [open, activeTab])

  // Scroll chat to bottom whenever messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function markFeedSeen() {
    const now = Date.now()
    localStorage.setItem(LAST_SEEN_KEY, String(now))
    setLastSeenTs(now)
  }

  async function loadFeed() {
    if (!window.electron?.fetchFeed) { setFeedError(true); return }
    setFeedLoading(true)
    setFeedError(false)
    try {
      const result = await window.electron.fetchFeed()
      if (!result.ok) throw new Error((result as { ok: false; error: string }).error)
      const data = result.data as FeedData
      const sorted = [...data.blocks].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      })
      setFeed(sorted)
    } catch {
      setFeedError(true)
    } finally {
      setFeedLoading(false)
    }
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || isSending) return
    setInput('')
    setIsSending(true)

    // Optimistically add user message + typing indicator
    setMessages(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '', typing: true },
    ])

    try {
      const res = await kbChat(SAGE_DOMAIN, text)
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: res.response }
        return next
      })
    } catch {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = {
          role: 'assistant',
          content: 'I couldn\'t reach the knowledge base right now. Check your connection and try again.',
        }
        return next
      })
    } finally {
      setIsSending(false)
    }
  }

  const unreadCount = feed
    ? feed.filter(b => new Date(b.publishedAt).getTime() > lastSeenTs).length
    : 0

  function openTab(tab: 'updates' | 'sage') {
    setActiveTab(tab)
    setOpen(true)
    if (tab === 'sage') setTimeout(() => inputRef.current?.focus(), 80)
    if (tab === 'updates') markFeedSeen()
  }

  return (
    /* Bottom-right fixed anchor — pane stacks above FAB naturally */
    <div className="fixed bottom-8 right-4 z-50 flex flex-col items-end gap-2">

      {/* ── Floating pane ──────────────────────────────────────────────────── */}
      {open && (
        <div
          className="flex flex-col rounded-xl overflow-hidden w-[360px]"
          style={{
            maxHeight: 'calc(100vh - 100px)',
            background: 'rgb(var(--panel))',
            border: `1px solid ${S.border}`,
            boxShadow: S.glow,
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2.5 px-4 py-3 shrink-0"
            style={{ background: S.bgHeader, borderBottom: `1px solid ${S.border}` }}
          >
            {/* Sage icon */}
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0"
              style={{
                background: S.bgLight,
                border: `1px solid ${S.borderFocus}`,
                color: S.text,
              }}
            >
              <SkillStar size={15} />
            </div>

            <span
              className="font-mono text-[11px] tracking-[0.12em] uppercase"
              style={{ color: S.text }}
            >
              Sage
            </span>

            <span className="text-[9px] font-mono text-white/20 bg-white/[0.03] border border-white/8 px-2 py-0.5 rounded-full leading-none">
              Preview
            </span>

            <div className="flex-1" />

            {/* Tab switcher */}
            <div className="flex rounded-md overflow-hidden border border-white/10">
              <button
                onClick={() => openTab('updates')}
                className="relative px-2.5 py-1 text-[10px] font-mono transition-colors"
                style={activeTab === 'updates'
                  ? { background: S.bgLight, color: S.text }
                  : { color: 'rgba(255,255,255,0.3)' }
                }
              >
                Updates
                {unreadCount > 0 && activeTab !== 'updates' && (
                  <span
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[8px] font-bold text-neutral-900 flex items-center justify-center"
                    style={{ background: S.text }}
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => openTab('sage')}
                className="px-2.5 py-1 text-[10px] font-mono transition-colors border-l border-white/10"
                style={activeTab === 'sage'
                  ? { background: S.bgLight, color: S.text }
                  : { color: 'rgba(255,255,255,0.3)' }
                }
              >
                Sage
              </button>
            </div>

            <button
              onClick={() => setOpen(false)}
              className="text-white/25 hover:text-white/60 transition-colors text-xs ml-1"
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* ── Updates tab ── */}
          {activeTab === 'updates' && (
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-0"
              style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
            >
              {feedLoading && <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>}

              {!feedLoading && feedError && (
                <div className="border-l-2 border-l-yellow-500 bg-white/[0.03] rounded px-3 py-3">
                  <p className="text-[11px] text-white/40 mb-2">
                    Could not load updates — check your connection.
                  </p>
                  <button
                    onClick={loadFeed}
                    className="text-[10px] text-[#4ae3ff] hover:text-[#4ae3ff]/70 transition-colors underline underline-offset-2"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!feedLoading && !feedError && feed?.length === 0 && (
                <p className="text-[11px] text-white/25 text-center py-8">Nothing here yet.</p>
              )}

              {!feedLoading && !feedError && feed && feed.map(block => (
                <FeedCard
                  key={block.id}
                  block={block}
                  isNew={new Date(block.publishedAt).getTime() > lastSeenTs}
                />
              ))}
            </div>
          )}

          {/* ── Sage chat tab ── */}
          {activeTab === 'sage' && (
            <>
              {/* Messages */}
              <div
                className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0"
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
              >
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-2.5 items-start ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    {/* Avatar — assistant only */}
                    {msg.role === 'assistant' && (
                      <div
                        className="w-[26px] h-[26px] rounded-md flex items-center justify-center text-xs shrink-0"
                        style={{
                          background: S.bgLight,
                          border: `1px solid ${S.borderFocus}`,
                          color: S.text,
                        }}
                      >
                        <SkillStar size={13} />
                      </div>
                    )}

                    {/* Bubble */}
                    <div
                      className="rounded-lg px-3.5 py-2.5 text-xs leading-relaxed"
                      style={{
                        maxWidth: 268,
                        background: msg.role === 'user' ? S.userBubble : S.bubble,
                        border: `1px solid ${msg.role === 'user' ? S.userBorder : S.bubbleBorder}`,
                        color: 'rgba(255,255,255,0.82)',
                      }}
                    >
                      {msg.typing && !msg.content
                        ? <><span style={{ color: 'rgba(255,255,255,0.3)' }}>Thinking</span><span className="sage-cursor" /></>
                        : msg.content
                      }
                      {msg.typing && msg.content && <span className="sage-cursor" />}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Input bar */}
              <div
                className="shrink-0 px-3 py-2.5"
                style={{ borderTop: `1px solid ${S.border}`, background: 'rgba(106,255,200,0.02)' }}
              >
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2 transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${input ? S.borderFocus : 'rgba(255,255,255,0.1)'}`,
                  }}
                >
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                    placeholder="Ask Sage anything…"
                    disabled={isSending}
                    className="flex-1 bg-transparent text-xs text-white/80 placeholder-white/20 outline-none"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || isSending}
                    className="transition-colors text-sm leading-none disabled:opacity-20"
                    title="Send (Enter)"
                    style={{ color: input.trim() ? S.text : 'rgba(255,255,255,0.3)' }}
                  >
                    ↑
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── FAB ──────────────────────────────────────────────────────────────── */}
      <button
        onClick={() => {
          if (open) {
            setOpen(false)
          } else {
            setOpen(true)
            if (activeTab === 'sage') setTimeout(() => inputRef.current?.focus(), 80)
            if (activeTab === 'updates') markFeedSeen()
          }
        }}
        title={open ? 'Close Sage' : 'Sage — Updates & Assistant'}
        className="relative w-10 h-10 rounded-full flex items-center justify-center text-base transition-all duration-200"
        style={{
          background:  open ? S.bgLight : S.bg,
          border:      `1px solid ${open ? S.borderFocus : S.border}`,
          color:       S.text,
          boxShadow:   open ? 'none' : '0 0 0 0 transparent',
          transform:   open ? 'scale(0.94)' : 'scale(1)',
        }}
        onMouseEnter={e => {
          if (!open) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 18px rgba(106,255,200,0.18)'
        }}
        onMouseLeave={e => {
          if (!open) (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'
        }}
      >
        <SkillStar size={18} />
        {/* Unread badge */}
        {!open && unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[8px] font-bold text-neutral-900 flex items-center justify-center"
            style={{ background: S.text }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

    </div>
  )
}
