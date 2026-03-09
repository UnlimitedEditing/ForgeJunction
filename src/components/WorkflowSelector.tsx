import React, { useEffect, useState } from 'react'
import { useWorkflowStore } from '@/stores/workflows'
import { usePromptStore } from '@/stores/prompt'
import { useSourceMediaStore } from '@/stores/sourceMedia'
import { categorizeWorkflow, type WorkflowCategory } from '@/utils/workflowCategories'
import { getWorkflowInputSlots } from '@/utils/workflowInputs'
import type { Workflow } from '@/api/graydient'

function isCompatibleWithMedia(wf: Workflow, mediaType: 'image' | 'video' | 'audio'): boolean {
  if (mediaType === 'image') {
    // Broader than just supports_img2img — check field_mapping for init_image_filename
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

export default function WorkflowSelector(): React.ReactElement {
  const { workflows, selectedWorkflow, loading, error, loadWorkflows, selectWorkflow } =
    useWorkflowStore()
  const { setWorkflowSlug } = usePromptStore()
  const { media, clear: clearSourceMedia } = useSourceMediaStore()
  const sourceMediaType = media?.mediaType ?? null
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<WorkflowCategory | null>(null)

  useEffect(() => {
    loadWorkflows()
  }, [loadWorkflows])

  // Build category counts from all workflows
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
    return (
      <p className="p-4 text-sm text-red-400">{error}</p>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Sticky header: banner + tabs + search ── */}
      <div className="flex-shrink-0 border-b border-white/10">
        {/* Source media filter banner */}
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

        {/* Category tabs */}
        {availableCategories.length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 pt-3 pb-1">
            <button
              onClick={() => setActiveCategory(null)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                activeCategory === null
                  ? 'border-l-2 border-brand bg-brand/10 pl-1.5 text-brand'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              All ({workflows.length})
            </button>
            {availableCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  activeCategory === cat
                    ? 'border-l-2 border-brand bg-brand/10 pl-1.5 text-brand'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                {cat} ({categoryCounts.get(cat) ?? 0})
              </button>
            ))}
          </div>
        )}

        {/* Search */}
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

      {/* ── Scrollable list ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
      <ul className="flex flex-col gap-1 px-2 pb-2 pt-1">
        {filtered.map((wf) => {
          const isSelected = selectedWorkflow?.slug === wf.slug
          const inputSlots = getWorkflowInputSlots(wf)
          const extraInputCount = inputSlots.filter((s) => s.type === 'secondary' && s.required).length
          return (
            <li key={wf.id}>
              <button
                onClick={() => { selectWorkflow(wf.slug); setWorkflowSlug(wf.slug) }}
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
                  <p className="mt-0.5 line-clamp-2 text-xs opacity-60">
                    {wf.description}
                  </p>
                )}
              </button>
            </li>
          )
        })}
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-white/30">No workflows found.</p>
        )}
      </ul>

      </div>{/* end scrollable */}
    </div>
  )
}
