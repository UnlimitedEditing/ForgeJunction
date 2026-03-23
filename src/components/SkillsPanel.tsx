import React, { useState, useEffect } from 'react'
import SkillsIcon from '@/components/icons/SkillsIcon'
import { useSkillsStore } from '@/stores/skills'
import { useSkillEditorStore, type SkillEditorTarget } from '@/stores/skillEditor'
import { validateSkill } from '@/utils/skillValidator'
import { usePromptStore } from '@/stores/prompt'
import { useRenderQueueStore } from '@/stores/renderQueue'
import type { Skill } from '@/api/graydient'

interface Props {
  onClose: () => void
  onOpenEditor: (target: SkillEditorTarget) => void
}

type Tab = 'browse' | 'mine'

const STATUS_DOT: Record<string, string> = {
  draft: 'bg-neutral-500',
  active: 'bg-emerald-500',
  archived: 'bg-red-500/60',
}

function formatTimeAgo(date: Date): string {
  const now = Date.now()
  const diff = now - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

export default function SkillsPanel({ onClose, onOpenEditor }: Props): React.ReactElement {
  const { skills: apiSkills, loading, loadSkills } = useSkillsStore()
  const { skills: localSkills, deleteSkill } = useSkillEditorStore()
  const { descriptiveText } = usePromptStore()
  const { enqueueSkill } = useRenderQueueStore()

  const [tab, setTab] = useState<Tab>('browse')
  const [search, setSearch] = useState('')
  const [queued, setQueued] = useState<string | null>(null)

  useEffect(() => { loadSkills() }, [loadSkills])

  const filteredApi = apiSkills.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description?.toLowerCase().includes(search.toLowerCase())
  )

  const filteredLocal = localSkills.filter(s =>
    !search ||
    s.meta.name.toLowerCase().includes(search.toLowerCase()) ||
    s.meta.description?.toLowerCase().includes(search.toLowerCase())
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

  function handleDeleteLocal(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    deleteSkill(id)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/10 px-3 py-2 flex items-center gap-2">
        <SkillsIcon size={14} className="text-brand/70" />
        <span className="text-[11px] text-white/70 uppercase tracking-widest font-semibold flex-1">Skills</span>
        <button
          onClick={() => onOpenEditor({ mode: 'new' })}
          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-brand/20 text-brand hover:bg-brand/30 border border-brand/30 transition-colors"
          title="Create new skill"
        >+ New</button>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-white/8">
        {(['browse', 'mine'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-[11px] font-medium transition-colors ${
              tab === t
                ? 'text-white border-b-2 border-brand -mb-px'
                : 'text-white/45 hover:text-white/70'
            }`}
          >
            {t === 'browse' ? 'Browse' : `Mine${localSkills.length ? ` (${localSkills.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* ── Browse tab ── */}
      {tab === 'browse' && (
        <>
          {/* "Run with Auto-Select" quick launch */}
          <div className="flex-shrink-0 px-3 py-3 border-b border-white/5">
            <p className="text-[10px] text-white/60 mb-2">
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
              {queued === '__any__'
                ? '✓ Queued'
                : <><SkillsIcon size={11} className="inline-block align-middle mr-1" />Run with Auto-Select</>}
            </button>
            {!descriptiveText?.trim() && (
              <p className="text-[10px] text-white/45 mt-1.5 text-center">
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

          {/* API skills list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center h-16">
                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-brand animate-spin" />
              </div>
            ) : filteredApi.length === 0 ? (
              <div className="px-3 py-4 text-xs text-white/50 text-center">
                {apiSkills.length === 0 ? 'No skills available' : 'No matching skills'}
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-white/5">
                {filteredApi.map(skill => (
                  <li key={skill.id}>
                    <div className="flex items-stretch group">
                      {/* Run button */}
                      <button
                        className="flex-1 text-left px-3 py-2.5 hover:bg-white/4 transition-colors min-w-0"
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
                              : 'text-white/45 bg-white/5 group-hover:text-brand/70 group-hover:bg-brand/10'
                          }`}>
                            {queued === skill.id ? '✓' : '▶'}
                          </span>
                        </div>
                        {skill.description && (
                          <p className="text-[11px] text-white/60 leading-snug mt-0.5 pl-4 line-clamp-2">
                            {skill.description}
                          </p>
                        )}
                      </button>

                      {/* View button — opens skill in editor pane */}
                      <button
                        onClick={() => onOpenEditor({ mode: 'api-view', slug: skill.slug, editable: !!skill.editable })}
                        className="flex-shrink-0 w-8 flex items-center justify-center text-[11px] text-white/25 hover:text-white/60 hover:bg-white/5 border-l border-white/5 transition-colors"
                        title={`View "${skill.name}" source`}
                      >◨</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* ── Mine tab ── */}
      {tab === 'mine' && (
        <>
          <div className="flex-shrink-0 px-2 py-2 border-b border-white/5">
            <input
              type="text"
              placeholder="Search local skills…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded bg-neutral-800 px-2.5 py-1.5 text-xs text-white placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-brand"
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {filteredLocal.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-center px-4">
                <p className="text-xs text-white/40">
                  {localSkills.length === 0 ? 'No local skills yet' : 'No matching skills'}
                </p>
                {localSkills.length === 0 && (
                  <button
                    onClick={() => onOpenEditor({ mode: 'new' })}
                    className="px-3 py-1.5 rounded text-[11px] font-semibold bg-brand/20 text-brand hover:bg-brand/30 border border-brand/30 transition-colors"
                  >Create your first skill</button>
                )}
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-white/5">
                {filteredLocal.map(doc => {
                  const validation = validateSkill(doc)
                  const updatedAt = new Date(doc.updatedAt)

                  return (
                    <li key={doc.id} className="px-3 py-2.5 hover:bg-white/3 transition-colors">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[doc.meta.status] ?? 'bg-neutral-500'}`}
                          title={doc.meta.status}
                        />
                        <span className="text-[12px] font-medium text-white/80 flex-1 truncate">
                          {doc.meta.name}
                        </span>
                        <span className={`text-[10px] font-bold tabular-nums flex-shrink-0 ${
                          validation.score === 6 ? 'text-emerald-400' :
                          validation.score >= 4 ? 'text-yellow-400' :
                          'text-white/35'
                        }`}>
                          {validation.score}/6
                        </span>
                      </div>

                      {doc.meta.description && (
                        <p className="text-[10px] text-white/40 line-clamp-1 mb-1 pl-3.5">
                          {doc.meta.description}
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 pl-3.5">
                        <span className="text-[9px] text-white/25">{formatTimeAgo(updatedAt)}</span>
                        <span className="text-white/15 text-[10px]">·</span>
                        <span className="text-[9px] text-white/25">{doc.blocks.length} blocks</span>
                        <div className="flex-1" />
                        <button
                          onClick={() => onOpenEditor({ mode: 'local', skillId: doc.id })}
                          className="px-2 py-0.5 rounded text-[10px] text-brand/70 hover:text-brand hover:bg-brand/10 border border-brand/20 hover:border-brand/40 transition-colors"
                        >Edit</button>
                        <button
                          onClick={() => handleDeleteLocal(doc.id, doc.meta.name)}
                          className="px-2 py-0.5 rounded text-[10px] text-white/30 hover:text-red-400 hover:bg-red-950/30 border border-white/8 hover:border-red-500/30 transition-colors"
                        >Delete</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
