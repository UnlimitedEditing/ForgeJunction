import React, { useEffect, useRef, useState } from 'react'
import SkillsIcon from '@/components/icons/SkillsIcon'

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

interface Props {
  screenX: number
  screenY: number
  modifiers: RadialMenuModifiers
  context: 'canvas' | 'node'
  onAction: (action: string) => void
  onClose: () => void
}

const RADIUS = 76

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
      { id: 'add-skill',         label: 'Skill Node',     icon: <SkillsIcon size={14} />, angle: 0   },
      { id: 'add-prompt',        label: 'Prompt Node',    icon: '◈', angle: 72  },
      { id: 'add-bin',           label: 'Bin',            icon: '⬡', angle: 144 },
      { id: 'add-skills-browser',label: 'Skills Browser', icon: '⬖', angle: 216 },
      { id: 'add-method',        label: 'Browser',        icon: '⬖', angle: 288 },
    ]
  }
  if (modifiers.shift) {
    return [
      { id: 'open-settings', label: 'Settings', icon: '⚙', angle: 0   },
      { id: 'fit-view',      label: 'Fit View', icon: '⊡', angle: 120 },
      { id: 'clear-canvas',  label: 'Clear',    icon: '⊘', angle: 240 },
    ]
  }
  return [
    { id: 'add-skill',    label: 'Skill',   icon: <SkillsIcon size={14} />,  angle: 0   },
    { id: 'add-bin',      label: 'Bin',     icon: '⬡',  angle: 60  },
    { id: 'add-method',   label: 'Browser', icon: '⬖',  angle: 120 },
    { id: 'fit-view',     label: 'Fit',     icon: '⊡',  angle: 180 },
    { id: 'run-all',      label: 'Run All', icon: '▶▶', angle: 240 },
    { id: 'clear-canvas', label: 'Clear',   icon: '⊘',  angle: 300 },
  ]
}

const EXIT_MS = 240

export default function RadialMenu({ screenX, screenY, modifiers, context, onAction, onClose }: Props): React.ReactElement {
  const items = getItems(modifiers, context)
  const [isExiting, setIsExiting] = useState(false)
  const [mistExit, setMistExit] = useState(false)
  const exitingRef = useRef(false)
  const mistExitRef = useRef(false)

  const close = useRef(() => {
    if (exitingRef.current) return
    exitingRef.current = true
    setIsExiting(true)
    setTimeout(onClose, mistExitRef.current ? 380 : EXIT_MS)
  })
  // Keep close ref fresh so it always calls the latest onClose
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

      {/* Items */}
      {items.map((item) => {
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
              onAction(item.id)
              if (item.id === 'delete-node') {
                mistExitRef.current = true
                setMistExit(true)
              }
              close.current()
            }}
          >
            <div className="w-9 h-9 rounded-full bg-[#1c1c1c] border border-white/10 flex items-center justify-center text-sm text-white/50 group-hover:bg-brand/20 group-hover:border-brand/40 group-hover:text-white transition-all shadow-xl">
              {item.icon}
            </div>
            <span className="text-[9px] text-white/30 group-hover:text-white/70 transition-colors whitespace-nowrap select-none leading-tight">
              {item.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
