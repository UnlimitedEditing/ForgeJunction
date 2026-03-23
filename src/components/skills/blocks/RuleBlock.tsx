import React, { useRef, useEffect } from 'react'
import type { RuleBlock as RuleBlockType } from '@/stores/skillEditor'
import { useSkillEditorStore } from '@/stores/skillEditor'

interface Props {
  block: RuleBlockType
  skillId: string
  readOnly?: boolean
}

export default function RuleBlock({ block, skillId, readOnly }: Props): React.ReactElement {
  const { updateBlock, logEvent } = useSkillEditorStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function autoResize() {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }

  useEffect(() => {
    autoResize()
  }, [block.content])

  function setPriority(priority: RuleBlockType['priority']) {
    updateBlock(skillId, block.id, { priority } as Partial<RuleBlockType>)
    logEvent({ skillId, eventType: 'rule_priority_changed', payload: { blockId: block.id, priority } })
  }

  const priorityStyles: Record<RuleBlockType['priority'], { button: string; area: string }> = {
    required: {
      button: 'bg-green-900/50 text-green-300 ring-1 ring-green-500/50',
      area: 'ring-green-500/30',
    },
    optional: {
      button: 'bg-yellow-900/50 text-yellow-300 ring-1 ring-yellow-500/50',
      area: 'ring-yellow-500/30',
    },
    never: {
      button: 'bg-red-900/50 text-red-300 ring-1 ring-red-500/50',
      area: 'ring-red-500/30',
    },
  }

  const inactiveStyle = 'bg-neutral-800/60 text-white/40 hover:bg-neutral-700/60 hover:text-white/60'

  return (
    <div className="space-y-2">
      {/* Priority toggle */}
      <div className="flex items-center gap-1">
        {(['required', 'optional', 'never'] as const).map(p => (
          <button
            key={p}
            onClick={() => !readOnly && setPriority(p)}
            disabled={readOnly}
            className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
              block.priority === p ? priorityStyles[p].button : inactiveStyle
            }`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        value={block.content}
        readOnly={readOnly}
        onChange={e => {
          updateBlock(skillId, block.id, { content: e.target.value } as Partial<RuleBlockType>)
          autoResize()
        }}
        onInput={autoResize}
        placeholder="Describe this rule…"
        rows={2}
        className={`w-full bg-neutral-800/60 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder-white/25 outline-none ring-1 resize-none transition-colors ${priorityStyles[block.priority].area}`}
        style={{ minHeight: '40px' }}
      />
    </div>
  )
}
