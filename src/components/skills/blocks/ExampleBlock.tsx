import React, { useRef, useEffect, useState } from 'react'
import type { ExampleBlock as ExampleBlockType } from '@/stores/skillEditor'
import { useSkillEditorStore } from '@/stores/skillEditor'

interface Props {
  block: ExampleBlockType
  skillId: string
  readOnly?: boolean
}

export default function ExampleBlock({ block, skillId, readOnly }: Props): React.ReactElement {
  const { updateBlock } = useSkillEditorStore()
  const [showNotes, setShowNotes] = useState(!!block.notes)
  const cmdRef = useRef<HTMLTextAreaElement>(null)
  const userRef = useRef<HTMLTextAreaElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  function autoResize(ref: React.RefObject<HTMLTextAreaElement | null>) {
    const ta = ref.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }

  useEffect(() => { autoResize(userRef) }, [block.userInput])
  useEffect(() => { autoResize(cmdRef) }, [block.command])
  useEffect(() => { autoResize(notesRef) }, [block.notes])

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-[10px] text-white/45 uppercase tracking-wider mb-1">User Input</label>
        <textarea
          ref={userRef}
          value={block.userInput}
          readOnly={readOnly}
          onChange={e => {
            updateBlock(skillId, block.id, { userInput: e.target.value } as Partial<ExampleBlockType>)
            autoResize(userRef)
          }}
          placeholder="What the user would type…"
          rows={2}
          className="w-full bg-neutral-800/60 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-cyan-500/30 resize-none"
          style={{ minHeight: '40px' }}
        />
      </div>

      <div>
        <label className="block text-[10px] text-white/45 uppercase tracking-wider mb-1">Command</label>
        <textarea
          ref={cmdRef}
          value={block.command}
          readOnly={readOnly}
          onChange={e => {
            updateBlock(skillId, block.id, { command: e.target.value } as Partial<ExampleBlockType>)
            autoResize(cmdRef)
          }}
          placeholder="/wf /run:slug /steps:20 prompt text…"
          rows={2}
          className="w-full bg-neutral-800/60 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-cyan-500/30 resize-none font-mono"
          style={{ minHeight: '40px' }}
        />
      </div>

      <button
        onClick={() => setShowNotes(v => !v)}
        className="text-[10px] text-white/40 hover:text-white/60 transition-colors"
      >
        {showNotes ? '▾ Hide notes' : '▸ Add notes'}
      </button>

      {showNotes && (
        <div>
          <textarea
            ref={notesRef}
            value={block.notes}
            readOnly={readOnly}
            onChange={e => {
              updateBlock(skillId, block.id, { notes: e.target.value } as Partial<ExampleBlockType>)
              autoResize(notesRef)
            }}
            placeholder="Optional notes about this example…"
            rows={1}
            className="w-full bg-neutral-800/40 rounded px-2.5 py-1.5 text-xs text-white/60 placeholder-white/20 outline-none ring-1 ring-white/8 focus:ring-white/20 resize-none italic"
            style={{ minHeight: '28px' }}
          />
        </div>
      )}
    </div>
  )
}
