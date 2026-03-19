import React, { useState, useEffect } from 'react'
import SkillsIcon from '@/components/icons/SkillsIcon'
import { useSkillsStore } from '@/stores/skills'
import { usePromptStore } from '@/stores/prompt'
import { useRenderQueueStore } from '@/stores/renderQueue'
import type { Skill } from '@/api/graydient'

interface Props {
  onClose: () => void
}

export default function SkillsPanel({ onClose }: Props): React.ReactElement {
  const { skills, loading, loadSkills } = useSkillsStore()
  const { descriptiveText } = usePromptStore()
  const { enqueueSkill } = useRenderQueueStore()
  const [search, setSearch] = useState('')
  const [queued, setQueued] = useState<string | null>(null)

  useEffect(() => { loadSkills() }, [loadSkills])

  const filtered = skills.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description?.toLowerCase().includes(search.toLowerCase())
  )

  function runSkill(skill: Skill) {
    const prompt = descriptiveText?.trim() || 'create something amazing'
    enqueueSkill(prompt, skill.slug)
    setQueued(skill.id)
    setTimeout(() => setQueued(null), 2000)
  }

  function runAny() {
    const prompt = descriptiveText?.trim() || 'create something amazing'
    enqueueSkill(prompt)
    setQueued('__any__')
    setTimeout(() => setQueued(null), 2000)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/10 px-3 py-2 flex items-center gap-2">
        <SkillsIcon size={14} className="text-brand/70" />
        <span className="text-[11px] text-white/40 uppercase tracking-widest font-semibold flex-1">Skills</span>
      </div>

      {/* "Describe Anything" quick launch */}
      <div className="flex-shrink-0 px-3 py-3 border-b border-white/5">
        <p className="text-[10px] text-white/30 mb-2">
          Skills auto-select the best workflow for your prompt using AI.
        </p>
        <button
          onClick={runAny}
          className={`w-full rounded-lg py-2 text-xs font-semibold transition-colors ${
            queued === '__any__'
              ? 'bg-emerald-600 text-white'
              : 'bg-brand hover:bg-brand/80 text-white'
          }`}
        >
          {queued === '__any__' ? '✓ Queued' : <><SkillsIcon size={11} className="inline-block align-middle mr-1" />Run with Auto-Select</>}
        </button>
        {!descriptiveText?.trim() && (
          <p className="text-[10px] text-white/20 mt-1.5 text-center">
            Type a prompt in the editor below first
          </p>
        )}
      </div>

      {/* Search */}
      <div className="flex-shrink-0 px-2 py-2 border-b border-white/5">
        <input
          type="text"
          placeholder="Search skills…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded bg-neutral-800 px-2.5 py-1.5 text-xs text-white placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-brand"
        />
      </div>

      {/* Skills list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-16">
            <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-brand animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-4 text-xs text-white/25 text-center">
            {skills.length === 0 ? 'No skills available' : 'No matching skills'}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5">
            {filtered.map(skill => (
              <li key={skill.id}>
                <button
                  className="w-full text-left px-3 py-2.5 hover:bg-white/4 transition-colors group"
                  onClick={() => runSkill(skill)}
                  title={`Run "${skill.name}" with current prompt`}
                >
                  <div className="flex items-center gap-2">
                    <SkillsIcon size={10} className="text-brand/50 flex-shrink-0 group-hover:text-brand transition-colors" />
                    <span className="text-sm font-medium text-white/75 group-hover:text-white transition-colors flex-1 truncate">
                      {skill.name}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded transition-colors flex-shrink-0 ${
                      queued === skill.id
                        ? 'text-emerald-400 bg-emerald-900/30'
                        : 'text-white/20 bg-white/5 group-hover:text-brand/70 group-hover:bg-brand/10'
                    }`}>
                      {queued === skill.id ? '✓' : '▶'}
                    </span>
                  </div>
                  {skill.description && (
                    <p className="text-[11px] text-white/30 leading-snug mt-0.5 pl-4 line-clamp-2">
                      {skill.description}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
