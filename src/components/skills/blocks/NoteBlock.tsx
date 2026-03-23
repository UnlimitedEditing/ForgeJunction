import React, { useRef, useEffect } from 'react'
import type { NoteBlock as NoteBlockType } from '@/stores/skillEditor'
import { useSkillEditorStore } from '@/stores/skillEditor'

interface Props {
  block: NoteBlockType
  skillId: string
  readOnly?: boolean
}

export default function NoteBlock({ block, skillId, readOnly }: Props): React.ReactElement {
  const { updateBlock } = useSkillEditorStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function autoResize() {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }

  useEffect(() => { autoResize() }, [block.content])

  return (
    <textarea
      ref={textareaRef}
      value={block.content}
      readOnly={readOnly}
      onChange={e => {
        updateBlock(skillId, block.id, { content: e.target.value } as Partial<NoteBlockType>)
        autoResize()
      }}
      onInput={autoResize}
      placeholder="Add a note…"
      rows={2}
      className="w-full bg-transparent text-[12px] text-neutral-400 placeholder-neutral-600 outline-none resize-none leading-relaxed"
      style={{ minHeight: '40px' }}
    />
  )
}
