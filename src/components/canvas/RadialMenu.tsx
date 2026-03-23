import React, { useEffect, useRef, useState } from 'react'
import SkillsIcon from '@/components/icons/SkillsIcon'
import { useChainTemplateStore } from '@/stores/chainTemplate'
import { usePaletteStore } from '@/stores/palette'

export interface RadialMenuModifiers {
  alt: boolean
  ctrl: boolean
  shift: boolean
}

interface MenuItem {
  id: string
  label: string
  icon: React.ReactNode
  angle: number
}

interface UtilityItem {
  id: string
  label: string
  icon: React.ReactNode
  description?: string
}

interface Props {
  screenX: number
  screenY: number
  modifiers: RadialMenuModifiers
  context: 'canvas' | 'node'
  onAction: (action: string) => void
  onClose: () => void
}

const RADIUS = 76
const PAGE_SIZE = 8

function getItems(modifiers: RadialMenuModifiers, context: 'canvas' | 'node'): MenuItem[] {
  if (context === 'node') {
    return [
      { id: 'run-node',       label: 'Run',       icon: '▶',  angle: 0   },
      { id: 'cancel-node',    label: 'Cancel',    icon: '◼',  angle: 72  },
      { id: 'duplicate-node', label: 'Duplicate', icon: '⧉',  angle: 144 },
      { id: 'delete-node',    label: 'Delete',    icon: '✕',  angle: 216 },
      { id: 'fit-view',       label: 'Fit View',  icon: '⊡',  angle: 288 },
    ]
  }
  if (modifiers.alt) {
    return [
      { id: 'fit-view',    label: 'Fit View',   icon: '⊡',   angle: 0   },
      { id: 'run-all',     label: 'Run All',    icon: '▶▶',  angle: 90  },
      { id: 'cancel-all',  label: 'Cancel All', icon: '◼◼',  angle: 180 },
      { id: 'clear-canvas',label: 'Clear',      icon: '⊘',   angle: 270 },
    ]
  }
  if (modifiers.ctrl) {
    return [
      { id: 'add-prompt',        label: 'Prompt Node',    icon: '◈',                      angle: 0   },
      { id: 'add-skill',         label: 'Skill Node',     icon: <SkillsIcon size={14} />, angle: 72  },
      { id: 'add-utility',       label: 'Utility',        icon: '⬡',                      angle: 144 },
      { id: 'add-skills-browser',label: 'Skills Browser', icon: '⬖',                      angle: 216 },
      { id: 'add-method',        label: 'Browser',        icon: '⬖',                      angle: 288 },
    ]
  }
  if (modifiers.shift) {
    return [
      { id: 'toggle-palette', label: 'Palette',  icon: '✏', angle: 0   },
      { id: 'add-art-node',   label: 'Art Node', icon: '✦', angle: 72  },
      { id: 'open-settings',  label: 'Settings', icon: '⚙', angle: 144 },
      { id: 'fit-view',       label: 'Fit View', icon: '⊡', angle: 216 },
      { id: 'clear-canvas',   label: 'Clear',    icon: '⊘', angle: 288 },
    ]
  }
  return [
    { id: 'add-prompt',   label: 'Prompt',  icon: '◈',  angle: 0   },
    { id: 'add-utility',  label: 'Utility', icon: '⬡',  angle: 60  },
    { id: 'add-method',   label: 'Browser', icon: '⬖',  angle: 120 },
    { id: 'fit-view',     label: 'Fit',     icon: '⊡',  angle: 180 },
    { id: 'run-all',      label: 'Run All', icon: '▶▶', angle: 240 },
    { id: 'clear-canvas', label: 'Clear',   icon: '⊘',  angle: 300 },
  ]
}

const EXIT_MS = 240

export default function RadialMenu({ screenX, screenY, modifiers, context, onAction, onClose }: Props): React.ReactElement {
  const items = getItems(modifiers, context)
  const templates = useChainTemplateStore(s => s.templates)
  const paletteOpen = usePaletteStore(s => s.isOpen)

  const [isExiting, setIsExiting] = useState(false)
  const [mistExit, setMistExit] = useState(false)
  const [showUtility, setShowUtility] = useState(false)
  const [utilitySearch, setUtilitySearch] = useState('')
  const [utilityPage, setUtilityPage] = useState(0)

  const exitingRef = useRef(false)
  const mistExitRef = useRef(false)
  const showUtilityRef = useRef(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { showUtilityRef.current = showUtility }, [showUtility])

  // Auto-focus search when utility submenu opens
  useEffect(() => {
    if (showUtility) setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [showUtility])

  const staticUtilityItems: UtilityItem[] = [
    { id: 'add-utility-videoeditorout', label: 'Video Editor Out', icon: '✂', description: 'Receives video exports from the editor' },
    { id: 'add-utility-bin',            label: 'Bin Node',          icon: '⬡', description: 'Collects and routes rendered outputs' },
  ]

  const chainItems: UtilityItem[] = templates.map(t => ({
    id: `add-chain-${t.id}`,
    label: t.name,
    icon: '⛓',
    description: `${t.nodes.length} node${t.nodes.length !== 1 ? 's' : ''}`,
  }))

  const allUtilityItems = [...staticUtilityItems, ...chainItems]

  const filteredItems = utilitySearch.trim()
    ? allUtilityItems.filter(i => i.label.toLowerCase().includes(utilitySearch.toLowerCase()))
    : allUtilityItems

  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE)
  const currentPage = Math.min(utilityPage, Math.max(0, totalPages - 1))
  const pageItems = filteredItems.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  const close = useRef(() => {
    if (exitingRef.current) return
    exitingRef.current = true
    setIsExiting(true)
    setTimeout(onClose, mistExitRef.current ? 680 : EXIT_MS)
  })

  useEffect(() => {
    close.current = () => {
      if (exitingRef.current) return
      exitingRef.current = true
      setIsExiting(true)
      setTimeout(onClose, mistExitRef.current ? 680 : EXIT_MS)
    }
  })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showUtilityRef.current) {
        if (e.code === 'Escape') {
          setShowUtility(false)
          setUtilitySearch('')
          setUtilityPage(0)
          return
        }
        // Don't interfere with the focused search input — let it handle its own input
        if (document.activeElement === searchInputRef.current) return
        // Typing outside the input also populates search
        if (e.key === 'Backspace') {
          setUtilitySearch(s => s.slice(0, -1))
          setUtilityPage(0)
          return
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          setUtilitySearch(s => s + e.key)
          setUtilityPage(0)
        }
        return
      }
      if (e.code === 'Escape') close.current()
    }
    function onDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-radial-menu]')) close.current()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [])

  const vw = window.innerWidth
  const vh = window.innerHeight
  const ox = Math.max(RADIUS + 40, Math.min(vw - RADIUS - 40, screenX))
  const oy = Math.max(RADIUS + 40, Math.min(vh - RADIUS - 40, screenY))

  function handleUtilityItem(id: string) {
    onAction(id)
    close.current()
  }

  return (
    <div
      data-radial-menu
      className={`fixed z-[100] pointer-events-none ${isExiting ? (mistExit ? 'animate-radial-mist-out' : 'animate-radial-out') : 'animate-radial-in'}`}
      style={{ left: ox, top: oy }}
    >
      {/* Backdrop blur circle */}
      <div
        className="absolute rounded-full bg-[#0f0f0fcc] border border-white/8 backdrop-blur-sm"
        style={{
          width: (RADIUS + 44) * 2,
          height: (RADIUS + 44) * 2,
          left: -(RADIUS + 44),
          top: -(RADIUS + 44),
          pointerEvents: 'none',
        }}
      />

      {/* Center dot */}
      <div className="absolute w-2 h-2 rounded-full bg-brand/70 -translate-x-1/2 -translate-y-1/2" />

      {/* ── Radial items (hidden while utility submenu is open) ── */}
      {!showUtility && items.map((item) => {
        const rad = (item.angle - 90) * (Math.PI / 180)
        const x = Math.cos(rad) * RADIUS
        const y = Math.sin(rad) * RADIUS
        return (
          <button
            key={item.id}
            data-radial-menu
            className="absolute pointer-events-auto flex flex-col items-center gap-0.5 group"
            style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
            onClick={(e) => {
              e.stopPropagation()
              if (item.id === 'add-utility') {
                setShowUtility(true)
                return
              }
              onAction(item.id)
              if (item.id === 'delete-node') {
                mistExitRef.current = true
                setMistExit(true)
              }
              close.current()
            }}
          >
            <div className={`w-9 h-9 rounded-full bg-[#1c1c1c] border flex items-center justify-center text-sm transition-all shadow-xl ${
              item.id === 'toggle-palette' && paletteOpen
                ? 'bg-[#4ae3ff]/20 border-[#4ae3ff]/70 text-[#4ae3ff] shadow-[0_0_14px_rgba(74,227,255,0.55)]'
                : item.id === 'add-utility'
                  ? 'text-white/75 group-hover:text-white border-white/20 group-hover:bg-[#ff6b2b]/15 group-hover:border-[#ff6b2b]/40'
                  : item.id === 'toggle-palette'
                    ? 'text-white/75 group-hover:text-white border-[#4ae3ff]/30 group-hover:bg-[#4ae3ff]/15 group-hover:border-[#4ae3ff]/50'
                    : item.id === 'add-art-node'
                      ? 'text-white/75 group-hover:text-white border-white/10 group-hover:bg-brand/20 group-hover:border-brand/40'
                      : 'text-white/75 group-hover:text-white border-white/10 group-hover:bg-brand/20 group-hover:border-brand/40'
            }`}>
              {item.icon}
            </div>
            <span className="text-[9px] text-white/60 group-hover:text-white/70 transition-colors whitespace-nowrap select-none leading-tight">
              {item.label}
              {item.id === 'add-utility' && <span className="text-white/30"> ›</span>}
            </span>
          </button>
        )
      })}

      {/* ── Utility submenu panel ── */}
      {showUtility && (
        <div
          data-radial-menu
          className="absolute pointer-events-auto"
          style={{
            left: -(RADIUS + 40),
            top: -(RADIUS + 36),
            width: 240,
          }}
          onWheel={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const dir = e.deltaY > 0 ? 1 : -1
            setUtilityPage(p => Math.max(0, Math.min(totalPages - 1, p + dir)))
          }}
        >
          <div className="bg-[#0f0f12]/95 border border-white/12 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden">

            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
              <button
                className="text-white/45 hover:text-white/80 transition-colors text-[11px] flex items-center gap-1"
                onClick={() => { setShowUtility(false); setUtilitySearch(''); setUtilityPage(0) }}
              >
                ‹ back
              </button>
              <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold flex-1 text-center">Utility</span>
              {filteredItems.length > 0 && totalPages > 1 && (
                <span className="text-[9px] text-white/30 font-mono">{currentPage + 1}/{totalPages}</span>
              )}
            </div>

            {/* Search */}
            <div className="px-2.5 py-2 border-b border-white/6">
              <input
                ref={searchInputRef}
                type="text"
                value={utilitySearch}
                onChange={e => { setUtilitySearch(e.target.value); setUtilityPage(0) }}
                placeholder="Search…"
                className="w-full bg-white/6 border border-white/10 rounded px-2.5 py-1 text-[11px] text-white placeholder-white/25 outline-none focus:border-[#ff6b2b]/40 transition-colors"
              />
            </div>

            {/* Items */}
            <div className="py-1">
              {pageItems.length === 0 ? (
                <p className="text-[10px] text-white/35 text-center py-3 px-3">
                  {utilitySearch ? `No results for "${utilitySearch}"` : 'No utility nodes available'}
                </p>
              ) : (
                pageItems.map(item => (
                  <button
                    key={item.id}
                    data-radial-menu
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/6 transition-colors group text-left"
                    onClick={(e) => { e.stopPropagation(); handleUtilityItem(item.id) }}
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 transition-colors ${
                      item.id.startsWith('add-chain-')
                        ? 'bg-brand/10 text-brand/70 group-hover:bg-brand/20 group-hover:text-brand'
                        : 'bg-[#ff6b2b]/10 text-[#ff6b2b]/70 group-hover:bg-[#ff6b2b]/20 group-hover:text-[#ff9554]'
                    }`}>
                      {item.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-white/75 group-hover:text-white transition-colors truncate leading-tight">
                        {item.label}
                      </p>
                      {item.description && (
                        <p className="text-[9px] text-white/35 truncate leading-tight">{item.description}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Footer — scroll hint when paginated */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 py-1.5 border-t border-white/6">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    data-radial-menu
                    onClick={() => setUtilityPage(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentPage ? 'bg-white/60' : 'bg-white/20 hover:bg-white/40'}`}
                  />
                ))}
                <span className="text-[9px] text-white/25 ml-1">scroll to page</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
