import React, { useRef, useEffect } from 'react'
import type { WarningBlock as WarningBlockType } from '@/stores/skillEditor'
import { useSkillEditorStore } from '@/stores/skillEditor'

interface Props {
  block: WarningBlockType
  skillId: string
  readOnly?: boolean
}

const severityConfig = {
  info: {
    bg: 'bg-blue-950/30',
    ring: 'ring-blue-500/30',
    button: 'bg-blue-900/50 text-blue-300 ring-1 ring-blue-500/50',
  },
  caution: {
    bg: 'bg-yellow-950/30',
    ring: 'ring-yellow-500/30',
    button: 'bg-yellow-900/50 text-yellow-300 ring-1 ring-yellow-500/50',
  },
  critical: {
    bg: 'bg-red-950/30',
    ring: 'ring-red-500/30',
    button: 'bg-red-900/50 text-red-300 ring-1 ring-red-500/50',
  },
}

const inactiveButton = 'bg-neutral-800/60 text-white/40 hover:bg-neutral-700/60 hover:text-white/60'

export default function WarningBlock({ block, skillId, readOnly }: Props): React.ReactElement {
  const { updateBlock } = useSkillEditorStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cfg = severityConfig[block.severity]

  function autoResize() {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }

  useEffect(() => { autoResize() }, [block.content])

  return (
    <div className={`rounded-md p-2.5 space-y-2 transition-colors ${cfg.bg}`}>
      {/* Severity toggle */}
      <div className="flex items-center gap-1">
        {(['info', 'caution', 'critical'] as const).map(s => (
          <button
            key={s}
            onClick={() => !readOnly && updateBlock(skillId, block.id, { severity: s } as Partial<WarningBlockType>)}
            disabled={readOnly}
            className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
              block.severity === s ? cfg.button : inactiveButton
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        value={block.content}
        readOnly={readOnly}
        onChange={e => {
          updateBlock(skillId, block.id, { content: e.target.value } as Partial<WarningBlockType>)
          autoResize()
        }}
        onInput={autoResize}
        placeholder="Describe this warning…"
        rows={2}
        className={`w-full bg-neutral-800/60 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder-white/25 outline-none ring-1 resize-none transition-colors ${cfg.ring}`}
        style={{ minHeight: '40px' }}
      />
    </div>
  )
}
