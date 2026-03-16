import React, { useEffect, useState } from 'react'
import { useWorkflowStore } from '@/stores/workflows'
import { usePromptStore } from '@/stores/prompt'
import { useSourceMediaStore } from '@/stores/sourceMedia'
import { categorizeWorkflow, type WorkflowCategory } from '@/utils/workflowCategories'
import { getWorkflowInputSlots } from '@/utils/workflowInputs'
import { fetchConcepts, type Concept, type Workflow } from '@/api/graydient'

// ── Simple Mode ───────────────────────────────────────────────────────────────

interface SimpleType {
  label: string
  icon: string
  description: string
  /** Slug must contain ALL of these substrings (lowercased) to match */
  slugKeywords: string[]
  note?: string
}

const SIMPLE_TYPES: SimpleType[] = [
  {
    label: 'Text → Image',
    icon: '🖼',
    description: 'Generate images from a text prompt',
    slugKeywords: ['zimage-turbo'],
  },
  {
    label: 'Image → Image',
    icon: '🔄',
    description: 'Transform or edit an existing image',
    slugKeywords: ['edit', 'flux'],
  },
  {
    label: 'Text → Video',
    icon: '🎬',
    description: 'Create a video clip from a text prompt',
    slugKeywords: ['smoothwan'],
  },
  {
    label: 'Image → Video',
    icon: '🎞',
    description: 'Animate a still image into video',
    slugKeywords: ['animate', 'smoothwan'],
  },
  {
    label: 'Image → Video + Sound',
    icon: '🔊',
    description: 'Animate an image and add generated audio',
    slugKeywords: ['animate', 'ltx'],
  },
  {
    label: 'Video → Video',
    icon: '♻',
    description: 'Extend or restyle an existing video',
    slugKeywords: ['extend', 'smoothwan'],
  },
  {
    label: 'Video → Video + Sound',
    icon: '🎙',
    description: 'Restyle a video and add audio',
    slugKeywords: ['audio', 'ltx'],
  },
  {
    label: 'Text → Video + Sound',
    icon: '🎥',
    description: 'Generate a video with audio from text',
    slugKeywords: ['ltx'],
  },
  {
    label: 'Text → Music',
    icon: '🎵',
    description: 'Generate music or ambient sound from text',
    slugKeywords: ['musicace'],
  },
  {
    label: 'Text → Speech',
    icon: '🗣',
    description: 'Generate spoken audio — requires a face image',
    slugKeywords: ['infinitetalk'],
    note: 'This workflow needs a face image. Generate one first if your library is empty.',
  },
]

function findWorkflowForType(type: SimpleType, workflows: Workflow[]): Workflow | null {
  const kw = type.slugKeywords
  return (
    workflows.find((w) => kw.every((k) => w.slug.toLowerCase().includes(k))) ?? null
  )
}

function SimpleModeView({
  workflows,
  onSelect,
}: {
  workflows: Workflow[]
  onSelect: (wf: Workflow, note?: string) => void
}): React.ReactElement {
  const available = SIMPLE_TYPES.map((t) => ({ type: t, wf: findWorkflowForType(t, workflows) }))
    .filter(({ wf }) => wf !== null) as { type: SimpleType; wf: Workflow }[]

  return (
    <div className="flex flex-col gap-2 px-2 py-3 overflow-y-auto flex-1 min-h-0">
      {available.map(({ type, wf }) => (
        <button
          key={type.label}
          onClick={() => onSelect(wf, type.note)}
          className="w-full text-left rounded-md px-3 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-white/5 hover:border-brand/30 transition-colors group"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xl flex-shrink-0">{type.icon}</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">
                {type.label}
              </p>
              <p className="text-[11px] text-white/35 leading-snug mt-0.5">
                {type.description}
              </p>
            </div>
          </div>
        </button>
      ))}
      {available.length === 0 && (
        <p className="text-xs text-white/25 text-center py-6">Loading workflows…</p>
      )}
    </div>
  )
}

function isCompatibleWithMedia(wf: Workflow, mediaType: 'image' | 'video' | 'audio'): boolean {
  if (mediaType === 'image') {
    return (
      wf.supports_img2img ||
      wf.supports_img2vid ||
      !!(wf.field_mapping?.some((f) => f.local_field === 'init_image_filename'))
    )
  }
  if (mediaType === 'video') return wf.supports_vid2vid || wf.supports_vid2img || wf.supports_vid2wav
  if (mediaType === 'audio') return wf.supports_wav2txt
  return true
}

// ── Workflow Info Panel ───────────────────────────────────────────────────────

function WorkflowInfoPanel({ workflow }: { workflow: Workflow }): React.ReactElement {
  const previewUrl = workflow.image_url ?? workflow.thumbnail_url ?? null

  const caps: Array<{ label: string; active: boolean }> = [
    { label: 'txt→img', active: workflow.supports_txt2img },
    { label: 'img→img', active: workflow.supports_img2img },
    { label: 'txt→vid', active: workflow.supports_txt2vid },
    { label: 'img→vid', active: workflow.supports_img2vid },
    { label: 'vid→vid', active: workflow.supports_vid2vid },
    { label: 'vid→img', active: workflow.supports_vid2img },
    { label: 'txt→wav', active: workflow.supports_txt2wav },
    { label: 'vid→wav', active: workflow.supports_vid2wav },
    { label: 'wav→txt', active: workflow.supports_wav2txt },
    { label: 'Concepts', active: workflow.supports_dynamic_concepts },
  ].filter((c) => c.active)

  return (
    <div className="flex flex-col gap-3 px-3 py-3 overflow-y-auto flex-1 min-h-0">
      {previewUrl && (
        <img
          src={previewUrl}
          alt={workflow.name}
          className="w-full rounded-md object-cover max-h-40"
        />
      )}

      {workflow.description && (
        <p className="text-xs text-white/60 leading-relaxed">{workflow.description}</p>
      )}

      {caps.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {caps.map((c) => (
            <span
              key={c.label}
              className="rounded px-1.5 py-0.5 text-[10px] bg-brand/15 text-brand/80 font-mono"
            >
              {c.label}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 text-xs text-white/40">
        {workflow.avg_elapsed != null && (
          <div className="flex justify-between">
            <span>Avg. render time</span>
            <span className="text-white/60">{Math.round(workflow.avg_elapsed)}s</span>
          </div>
        )}
        {workflow.platform && (
          <div className="flex justify-between">
            <span>Platform</span>
            <span className="text-white/60 font-mono">{workflow.platform}</span>
          </div>
        )}
        {workflow.slug && (
          <div className="flex justify-between">
            <span>Slug</span>
            <span className="text-white/60 font-mono truncate max-w-[60%] text-right">{workflow.slug}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Concepts Panel ────────────────────────────────────────────────────────────

const KNOWN_FAMILIES = ['SD15', 'SDXL', 'flux', 'zimage', 'ltx', 'wan', 'hunyun', 'qwen']

function ConceptsPanel({
  workflow,
  onPeek,
}: {
  workflow: Workflow
  onPeek: (concept: Concept) => void
}): React.ReactElement {
  const { descriptiveText, setDescriptiveText } = usePromptStore()
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFamily, setSelectedFamily] = useState<string>('SD15')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    setSearch('')
    fetchConcepts(selectedFamily).then((result) => {
      setConcepts(result)
      setLoading(false)
    })
  }, [selectedFamily])

  useEffect(() => {
    setSelectedFamily('SD15')
    setSearch('')
  }, [workflow.slug])

  function handleClick(concept: Concept) {
    const trigger = `<${concept.token}:0.8>`
    const base = (descriptiveText ?? '').trim()
    setDescriptiveText(base ? `${base} ${trigger}` : trigger)
    onPeek(concept)
  }

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return concepts
    return concepts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.token.toLowerCase().includes(q)
    )
  }, [concepts, search])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Family dropdown + search */}
      <div className="flex-shrink-0 px-2 py-2 border-b border-white/5 flex flex-col gap-1.5">
        <select
          value={selectedFamily}
          onChange={(e) => setSelectedFamily(e.target.value)}
          className="w-full rounded bg-neutral-800 px-2 py-1.5 text-xs text-white/70 outline-none ring-1 ring-white/10 focus:ring-brand"
        >
          {KNOWN_FAMILIES.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search concepts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded bg-neutral-800 px-2.5 py-1.5 text-xs text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-brand"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-1.5 px-2 pt-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="rounded-md bg-neutral-800 animate-pulse aspect-square" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-1.5 flex-1">
          <p className="text-xs text-white/25">
            {search ? 'No matching concepts' : 'No concepts available for this family'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-2 gap-1.5 px-2 py-2">
            {filtered.map((concept) => (
              <button
                key={concept.concept_hash}
                onClick={() => handleClick(concept)}
                className="group flex flex-col rounded-md overflow-hidden bg-neutral-800 hover:bg-neutral-700 border border-white/5 hover:border-brand/30 transition-colors text-left"
                title={concept.description ?? concept.name}
              >
                {/* Image area */}
                <div className="w-full aspect-square bg-neutral-900 overflow-hidden flex-shrink-0 relative">
                  {concept.example_url ? (
                    <img
                      src={concept.example_url}
                      alt={concept.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/10 text-2xl font-bold select-none">
                      {concept.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  {/* Click-to-add overlay */}
                  <div className="absolute inset-0 bg-brand/0 group-hover:bg-brand/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="text-white text-xs font-medium drop-shadow">+ Add</span>
                  </div>
                </div>
                {/* Name */}
                <div className="px-1.5 py-1 min-w-0">
                  <p className="text-[11px] text-white/70 group-hover:text-white truncate transition-colors leading-tight">
                    {concept.name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type DetailTab = 'concepts' | 'details'

const SIMPLE_MODE_KEY = 'fj-simple-mode'

export default function WorkflowSelector(): React.ReactElement {
  const { workflows, selectedWorkflow, loading, error, loadWorkflows, selectWorkflow } =
    useWorkflowStore()
  const { setWorkflowSlug } = usePromptStore()
  const { media, clear: clearSourceMedia } = useSourceMediaStore()
  const sourceMediaType = media?.mediaType ?? null

  // Default to simple mode for new users (persisted)
  const [simpleMode, setSimpleMode] = useState<boolean>(() => {
    const stored = localStorage.getItem(SIMPLE_MODE_KEY)
    return stored === null ? true : stored === 'true'
  })
  const [simpleNote, setSimpleNote] = useState<string | null>(null)
  const [view, setView] = useState<'workflows' | 'detail'>('workflows')
  const [detailTab, setDetailTab] = useState<DetailTab>('details')
  const [lastConcept, setLastConcept] = useState<Concept | null>(null)
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<WorkflowCategory | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  function toggleSimpleMode() {
    setSimpleMode((v) => {
      const next = !v
      localStorage.setItem(SIMPLE_MODE_KEY, String(next))
      return next
    })
  }

  function handleSelectWorkflow(slug: string) {
    selectWorkflow(slug)
    setWorkflowSlug(slug)
    setView('detail')
  }

  function handleSimpleSelect(wf: Workflow, note?: string) {
    setSimpleNote(note ?? null)
    handleSelectWorkflow(wf.slug)
  }

  useEffect(() => {
    if (selectedWorkflow) {
      setView('detail')
      setDetailTab(selectedWorkflow.supports_dynamic_concepts ? 'concepts' : 'details')
      setLastConcept(null)
    }
  }, [selectedWorkflow?.slug])

  useEffect(() => {
    loadWorkflows()
  }, [loadWorkflows])

  const categoryCounts = React.useMemo(() => {
    const counts = new Map<WorkflowCategory, number>()
    for (const wf of workflows) {
      for (const cat of categorizeWorkflow(wf)) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1)
      }
    }
    return counts
  }, [workflows])

  const availableCategories = Array.from(categoryCounts.keys())

  const filtered = workflows.filter((w) => {
    const matchesQuery = w.name.toLowerCase().includes(query.toLowerCase())
    const matchesCategory = activeCategory === null || categorizeWorkflow(w).includes(activeCategory)
    const matchesMedia = sourceMediaType === null || isCompatibleWithMedia(w, sourceMediaType)
    return matchesQuery && matchesCategory && matchesMedia
  })

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    )
  }

  if (error) {
    return <p className="p-4 text-sm text-red-400">{error}</p>
  }

  // ── Detail view (Concepts + Details tabs) ──────────────────────────────────
  if (view === 'detail' && selectedWorkflow) {
    const hasConcepts = selectedWorkflow.supports_dynamic_concepts
    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-white/10 px-2 py-2 flex items-center gap-2">
          <button
            onClick={() => setView('workflows')}
            className="rounded p-1 text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors text-xs flex-shrink-0"
            title="Back"
          >
            ←
          </button>
          <span className="text-xs text-white/60 truncate font-medium flex-1">
            {selectedWorkflow.name}
          </span>
          <button
            onClick={toggleSimpleMode}
            className="text-[11px] text-white/25 hover:text-brand transition-colors flex-shrink-0"
            title={simpleMode ? 'Switch to Advanced' : 'Switch to Simple'}
          >
            {simpleMode ? 'Advanced →' : '← Simple'}
          </button>
        </div>
        {/* Simple mode note (e.g. for text-to-speech requiring a face image) */}
        {simpleNote && (
          <div className="flex-shrink-0 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-300/80 leading-snug">
            ⚠ {simpleNote}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex-shrink-0 flex border-b border-white/10">
          {hasConcepts && (
            <button
              onClick={() => setDetailTab('concepts')}
              className={`flex-1 py-1.5 text-xs transition-colors ${
                detailTab === 'concepts'
                  ? 'text-brand border-b-2 border-brand bg-brand/5'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              Concepts
            </button>
          )}
          <button
            onClick={() => setDetailTab('details')}
            className={`flex-1 py-1.5 text-xs transition-colors ${
              detailTab === 'details'
                ? 'text-brand border-b-2 border-brand bg-brand/5'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            Details
          </button>
        </div>

        {/* Tab content */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {detailTab === 'concepts' && hasConcepts
            ? <ConceptsPanel workflow={selectedWorkflow} onPeek={setLastConcept} />
            : detailTab === 'concepts' && !hasConcepts
              ? (
                <div className="flex flex-col flex-1 items-center justify-center gap-3 px-4 text-center">
                  <div className="relative flex items-center justify-center w-10 h-10 text-white/20">
                    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
                      <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2.5" />
                      <line x1="7" y1="7" x2="33" y2="33" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="text-xs text-white/30 leading-relaxed">
                    Not compatible with Concepts
                  </p>
                </div>
              )
              : (
                /* Details tab — workflow info + last selected concept */
                <div className="flex flex-col h-full min-h-0 overflow-y-auto">
                  <WorkflowInfoPanel workflow={selectedWorkflow} />
                  {lastConcept && (
                    <div className="flex-shrink-0 border-t border-white/10 px-3 py-3 flex flex-col gap-2">
                      <p className="text-[11px] uppercase tracking-widest text-white/25">Last Concept</p>
                      {lastConcept.example_url && (
                        <img
                          src={lastConcept.example_url}
                          alt={lastConcept.name}
                          className="w-full rounded-md object-cover max-h-36"
                        />
                      )}
                      <div>
                        <p className="text-xs font-semibold text-white/80">{lastConcept.name}</p>
                        <p className="text-[11px] text-white/30 font-mono mt-0.5">{lastConcept.token}</p>
                      </div>
                      {lastConcept.description && (
                        <p className="text-xs text-white/50 leading-relaxed">{lastConcept.description}</p>
                      )}
                      {lastConcept.model_family && (
                        <span className="self-start rounded px-1.5 py-0.5 text-[10px] bg-white/5 text-white/30 font-mono">
                          {lastConcept.model_family}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
          }
        </div>
      </div>
    )
  }

  // ── Simple mode ────────────────────────────────────────────────────────────
  if (simpleMode && view === 'workflows') {
    return (
      <div className="flex flex-col h-full">
        {/* Mode toggle */}
        <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10">
          <span className="text-[11px] text-white/30 uppercase tracking-widest">Quick Start</span>
          <button
            onClick={toggleSimpleMode}
            className="text-[11px] text-white/30 hover:text-brand transition-colors"
          >
            Advanced →
          </button>
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </div>
        ) : (
          <SimpleModeView workflows={workflows} onSelect={handleSimpleSelect} />
        )}
      </div>
    )
  }

  // ── Workflows list view ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="flex-shrink-0 border-b border-white/10">
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <span className="text-[11px] text-white/25 uppercase tracking-widest">All Workflows</span>
          <button
            onClick={toggleSimpleMode}
            className="text-[11px] text-white/30 hover:text-brand transition-colors"
          >
            ← Simple
          </button>
        </div>
        {sourceMediaType && (
          <div className="flex items-center gap-2 px-3 py-2 bg-brand/10 border-b border-brand/20 text-xs">
            <span className="flex-1 text-brand/80">
              Showing workflows compatible with {sourceMediaType} input
            </span>
            <button
              onClick={() => clearSourceMedia()}
              className="text-white/40 hover:text-white transition-colors"
              title="Clear filter and source media"
            >
              ✕ Show all
            </button>
          </div>
        )}

        {availableCategories.length > 0 && (
          <div className="border-b border-white/8">
            {/* Collapsed row — active filter + toggle */}
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <span className="text-[10px] text-white/25 uppercase tracking-widest flex-shrink-0">Type</span>
              <button
                onClick={() => { setActiveCategory(null); setFiltersOpen(false) }}
                className={`rounded px-2 py-0.5 text-xs transition-colors flex-shrink-0 ${
                  activeCategory === null
                    ? 'bg-brand/15 text-brand border border-brand/30'
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                {activeCategory === null ? `All (${workflows.length})` : 'All'}
              </button>
              {activeCategory !== null && (
                <span className="text-xs bg-brand/15 text-brand border border-brand/30 rounded px-2 py-0.5 flex-shrink-0">
                  {activeCategory}
                </span>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setFiltersOpen(v => !v)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors flex-shrink-0"
                title={filtersOpen ? 'Hide filters' : 'Show all types'}
              >
                <span className="text-[10px] text-white/30">filter</span>
                <svg
                  width="10" height="10" viewBox="0 0 10 10" fill="none"
                  className={`transition-transform duration-150 ${filtersOpen ? 'rotate-180' : ''}`}
                >
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Expanded — all category chips */}
            {filtersOpen && (
              <div className="flex flex-wrap gap-1 px-3 pb-2">
                {availableCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => { setActiveCategory(cat); setFiltersOpen(false) }}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      activeCategory === cat
                        ? 'bg-brand/15 text-brand border border-brand/30'
                        : 'text-white/45 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {cat} ({categoryCounts.get(cat) ?? 0})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="p-3">
          <input
            type="text"
            placeholder="Filter workflows…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded bg-neutral-800 px-3 py-1.5 font-mono text-xs text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-brand/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <ul className="flex flex-col gap-1 px-2 pb-2 pt-1">
          {filtered.map((wf) => {
            const isSelected = selectedWorkflow?.slug === wf.slug
            const inputSlots = getWorkflowInputSlots(wf)
            const extraInputCount = inputSlots.filter((s) => s.type === 'secondary' && s.required).length
            return (
              <li key={wf.id}>
                <button
                  onClick={() => handleSelectWorkflow(wf.slug)}
                  className={`w-full rounded px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? 'border-l-2 border-brand bg-brand/10 pl-[10px] text-brand'
                      : 'text-white/80 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium leading-snug flex-1">{wf.name}</p>
                    {extraInputCount > 0 && (
                      <span className={`text-[10px] flex-shrink-0 ${isSelected ? 'text-white/60' : 'text-white/30'}`}>
                        📎+{extraInputCount}
                      </span>
                    )}
                  </div>
                  {wf.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs opacity-60">{wf.description}</p>
                  )}
                </button>
              </li>
            )
          })}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-white/30">No workflows found.</p>
          )}
        </ul>
      </div>
    </div>
  )
}
