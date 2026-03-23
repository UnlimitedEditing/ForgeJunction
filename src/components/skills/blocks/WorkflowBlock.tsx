import React, { useState, useRef, useEffect } from 'react'
import type { WorkflowBlock as WorkflowBlockType } from '@/stores/skillEditor'
import { useSkillEditorStore } from '@/stores/skillEditor'

interface Props {
  block: WorkflowBlockType
  skillId: string
  readOnly?: boolean
}

const KNOWN_WORKFLOWS = [
  { slug: 'flux2', commandType: 'txt2img', label: 'Flux 2' },
  { slug: 'zimage-turbo', commandType: 'txt2img', label: 'Zimage Turbo' },
  { slug: 'render', commandType: 'txt2img', label: 'Render (Anime/SDXL)' },
  { slug: 'edit-qwen', commandType: 'img2img', label: 'Qwen Edit' },
  { slug: 'musicace15', commandType: 'wf', label: 'MusicAce 15' },
]

const COMMAND_TYPES = ['txt2img', 'img2img', 'wf', 'render', 'custom'] as const

export default function WorkflowBlock({ block, skillId, readOnly }: Props): React.ReactElement {
  const { updateBlock } = useSkillEditorStore()
  const [showDropdown, setShowDropdown] = useState(false)
  const slugRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  const filtered = block.slug
    ? KNOWN_WORKFLOWS.filter(w =>
        w.slug.includes(block.slug.toLowerCase()) || w.label.toLowerCase().includes(block.slug.toLowerCase())
      )
    : KNOWN_WORKFLOWS

  function selectWorkflow(wf: typeof KNOWN_WORKFLOWS[number]) {
    updateBlock(skillId, block.id, {
      slug: wf.slug,
      commandType: wf.commandType,
    } as Partial<WorkflowBlockType>)
    setShowDropdown(false)
  }

  function autoResizeNotes() {
    const ta = notesRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }

  useEffect(() => {
    autoResizeNotes()
  }, [block.notes])

  return (
    <div className="space-y-2">
      <div className="relative">
        <label className="block text-[10px] text-white/45 uppercase tracking-wider mb-1">Workflow Slug</label>
        <input
          ref={slugRef}
          type="text"
          value={block.slug}
          readOnly={readOnly}
          onChange={e => {
            updateBlock(skillId, block.id, { slug: e.target.value } as Partial<WorkflowBlockType>)
            setShowDropdown(true)
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          placeholder="e.g. flux2"
          className="w-full rounded bg-neutral-800/60 px-2.5 py-1.5 text-xs text-white placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-blue-500/50 font-mono"
        />
        {showDropdown && filtered.length > 0 && !readOnly && (
          <div className="absolute top-full left-0 right-0 mt-0.5 bg-neutral-800 border border-white/10 rounded shadow-xl z-20">
            {filtered.map(wf => (
              <button
                key={wf.slug}
                onMouseDown={() => selectWorkflow(wf)}
                className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-white/8 transition-colors flex items-center gap-2"
              >
                <span className="text-blue-300 font-mono">{wf.slug}</span>
                <span className="text-white/50">{wf.label}</span>
                <span className="ml-auto text-[10px] text-white/30">{wf.commandType}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-[10px] text-white/45 uppercase tracking-wider mb-1">Command Type</label>
        <select
          value={block.commandType}
          disabled={readOnly}
          onChange={e => updateBlock(skillId, block.id, { commandType: e.target.value } as Partial<WorkflowBlockType>)}
          className="w-full rounded bg-neutral-800/60 px-2.5 py-1.5 text-xs text-white outline-none ring-1 ring-white/10 focus:ring-blue-500/50"
        >
          {COMMAND_TYPES.map(ct => (
            <option key={ct} value={ct}>{ct}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10px] text-white/45 uppercase tracking-wider mb-1">Notes</label>
        <textarea
          ref={notesRef}
          value={block.notes}
          readOnly={readOnly}
          onChange={e => {
            updateBlock(skillId, block.id, { notes: e.target.value } as Partial<WorkflowBlockType>)
            autoResizeNotes()
          }}
          placeholder="Any notes about this workflow…"
          rows={2}
          className="w-full bg-neutral-800/60 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-blue-500/50 resize-none"
          style={{ minHeight: '40px' }}
        />
      </div>
    </div>
  )
}
