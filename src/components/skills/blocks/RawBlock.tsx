import React, { useRef, useEffect } from 'react'
import type { RawBlock as RawBlockType } from '@/stores/skillEditor'
import { useSkillEditorStore } from '@/stores/skillEditor'

interface Props {
  block: RawBlockType
  skillId: string
  readOnly?: boolean
}

export default function RawBlock({ block, skillId, readOnly }: Props): React.ReactElement {
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
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-900/40 text-yellow-400 uppercase tracking-wider">
          raw — injected verbatim
        </span>
        <span className="text-[10px] text-white/30">This block is written directly into the exported skill text.</span>
      </div>
      <textarea
        ref={textareaRef}
        value={block.content}
        readOnly={readOnly}
        onChange={e => {
          updateBlock(skillId, block.id, { content: e.target.value } as Partial<RawBlockType>)
          autoResize()
        }}
        onInput={autoResize}
        placeholder="Raw text content…"
        rows={3}
        className="w-full bg-neutral-900/60 rounded px-2.5 py-1.5 text-xs text-white/70 placeholder-white/20 outline-none ring-1 ring-yellow-500/20 focus:ring-yellow-500/40 resize-none font-mono leading-relaxed"
        style={{ minHeight: '60px' }}
      />
    </div>
  )
}
