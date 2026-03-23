import React, { useRef, useEffect } from 'react'
import type { PurposeBlock as PurposeBlockType } from '@/stores/skillEditor'
import { useSkillEditorStore } from '@/stores/skillEditor'

interface Props {
  block: PurposeBlockType
  skillId: string
  readOnly?: boolean
}

export default function PurposeBlock({ block, skillId, readOnly }: Props): React.ReactElement {
  const { updateBlock } = useSkillEditorStore()
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

  return (
    <div>
      <textarea
        ref={textareaRef}
        value={block.content}
        onChange={e => {
          updateBlock(skillId, block.id, { content: e.target.value } as Partial<PurposeBlockType>)
          autoResize()
        }}
        onInput={autoResize}
        readOnly={readOnly}
        placeholder="Describe what this skill does and when it should be used…"
        rows={3}
        className="w-full bg-transparent text-[12px] text-white/80 placeholder-white/25 outline-none resize-none leading-relaxed"
        style={{ minHeight: '60px' }}
      />
      <div className="text-right text-[10px] text-white/25 mt-1">
        {block.content.length} chars
      </div>
    </div>
  )
}
