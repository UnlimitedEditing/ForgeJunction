import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import SkillStar from '@/components/icons/SkillStar'
import { useWorkflowStore } from '@/stores/workflows'
import { usePromptStore } from '@/stores/prompt'
import { fetchConcepts, type Concept, type Workflow } from '@/api/graydient'

// ── Helpers ────────────────────────────────────────────────────────────────────

function workflowIcon(wf: Workflow): string {
  if (wf.supports_txt2vid || wf.supports_img2vid || wf.supports_vid2vid) return '🎬'
  if (wf.supports_txt2wav || wf.supports_vid2wav) return '🎵'
  return '🖼'
}

// ── Workflow card ──────────────────────────────────────────────────────────────

function WorkflowCard({
  workflow,
  onClick,
}: {
  workflow: Workflow
  onClick: () => void
}): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const thumb = workflow.thumbnail_url ?? workflow.image_url

  function onDragStart(e: React.DragEvent) {
    e.dataTransfer.setData(
      'application/fj-workflow',
      JSON.stringify({ slug: workflow.slug, name: workflow.name }),
    )
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <button
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex-shrink-0 flex flex-col items-center gap-1.5 w-24 group relative"
    >
      <div className="w-24 h-20 rounded-lg overflow-hidden bg-neutral-800 flex items-center justify-center ring-1 ring-white/10 group-hover:ring-brand/60 transition-all relative">
        {thumb ? (
          <img
            src={thumb}
            alt={workflow.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <span className="text-3xl">{workflowIcon(workflow)}</span>
        )}

        {/* Description tooltip overlay */}
        {hovered && workflow.description && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-start justify-end p-1.5 rounded-lg pointer-events-none">
            <p className="text-[9px] text-white/80 text-left leading-tight line-clamp-4">
              {workflow.description}
            </p>
            {!workflow.supports_dynamic_concepts && (
              <span className="mt-1 text-[8px] text-white/60 italic">no LoRA support</span>
            )}
          </div>
        )}
      </div>

      <span className="text-xs text-white/82 group-hover:text-white/90 text-center leading-tight line-clamp-2 transition-colors w-full">
        {workflow.name}
      </span>
    </button>
  )
}

// ── Concept card ──────────────────────────────────────────────────────────────

function ConceptCard({
  concept,
  onClick,
}: {
  concept: Concept
  onClick: () => void
}): React.ReactElement {
  const [hovered, setHovered] = useState(false)

  function onDragStart(e: React.DragEvent) {
    e.dataTransfer.setData(
      'application/fj-concept',
      JSON.stringify({ token: concept.token, name: concept.name }),
    )
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <button
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex-shrink-0 flex flex-col items-center gap-1.5 w-24 group relative"
    >
      <div className="w-24 h-20 rounded-lg overflow-hidden bg-neutral-800 flex items-center justify-center ring-1 ring-white/10 group-hover:ring-brand/60 transition-all relative">
        {concept.example_url ? (
          <img
            src={concept.example_url}
            alt={concept.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <SkillStar size={24} />
        )}

        {/* Description + token overlay on hover */}
        {hovered && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-start justify-end p-1.5 rounded-lg pointer-events-none gap-1">
            {concept.description && (
              <p className="text-[9px] text-white/75 text-left leading-tight line-clamp-3">
                {concept.description}
              </p>
            )}
            {concept.token && (
              <p className="text-[8px] text-brand/80 font-mono truncate w-full">
                &lt;{concept.token}&gt;
              </p>
            )}
          </div>
        )}
      </div>

      <span className="text-xs text-white/82 group-hover:text-white/90 text-center leading-tight line-clamp-2 transition-colors w-full">
        {concept.name}
      </span>
    </button>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCards(): React.ReactElement {
  return (
    <>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex-shrink-0 flex flex-col items-center gap-1.5 w-24">
          <div className="w-24 h-20 rounded-lg bg-neutral-800 animate-pulse" />
          <div className="h-3 w-16 rounded bg-neutral-800 animate-pulse" />
        </div>
      ))}
    </>
  )
}

// ── Main popup ────────────────────────────────────────────────────────────────

export default function WorkflowGalleryPopup({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}): React.ReactElement {
  const { workflows, selectWorkflow } = useWorkflowStore()
  const { setWorkflowSlug, descriptiveText, setDescriptiveText } = usePromptStore()

  const [view, setView] = useState<'workflows' | 'loras'>('workflows')
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null)
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [conceptsLoading, setConceptsLoading] = useState(false)
  const [familyFilter, setFamilyFilter] = useState<string>('all')

  // Reset to workflow view when popup closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setView('workflows')
        setActiveWorkflow(null)
        setConcepts([])
      }, 200)
    }
  }, [open])

  function handleSelectWorkflow(wf: Workflow) {
    selectWorkflow(wf.slug)
    setWorkflowSlug(wf.slug)

    // Only enter the LoRA browser if this workflow supports dynamic concepts
    if (!wf.supports_dynamic_concepts) {
      onClose()
      return
    }

    setActiveWorkflow(wf)
    setView('loras')
    setConcepts([])
    setFamilyFilter('all')
    setConceptsLoading(true)
    fetchConcepts().then((result) => {
      setConcepts(result)
      setConceptsLoading(false)
    })
  }

  function handleSelectConcept(concept: Concept) {
    const trigger = `<${concept.token}:0.8>`
    const base = (descriptiveText ?? '').trim()
    setDescriptiveText(base ? `${base} ${trigger}` : trigger)
    onClose()
  }

  const popup = (
    <div
      className={`fixed bottom-7 left-0 right-0 z-40 transition-transform duration-200 ease-in-out ${
        open ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ height: '240px' }}
    >
      <div className="h-full bg-neutral-900 border-t border-white/10 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 flex-shrink-0">
          {view === 'loras' ? (
            <button
              onClick={() => setView('workflows')}
              className="text-xs text-white/75 hover:text-white/80 transition-colors flex items-center gap-1"
            >
              ← Back
            </button>
          ) : (
            <span className="text-xs font-semibold uppercase tracking-widest text-white/60">
              Workflows
            </span>
          )}

          {view === 'loras' && activeWorkflow && (
            <span className="text-xs font-semibold text-white/70 truncate mx-2">
              {activeWorkflow.name} — LoRAs
            </span>
          )}

          <button
            onClick={onClose}
            className="text-xs text-white/60 hover:text-white/70 transition-colors ml-auto"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-3">
          <div className="flex items-start gap-3 h-full">

            {view === 'workflows' && (
              workflows.length === 0 ? (
                <p className="text-xs text-white/60 self-center">No workflows loaded</p>
              ) : (
                workflows.map((wf) => (
                  <WorkflowCard
                    key={wf.id}
                    workflow={wf}
                    onClick={() => handleSelectWorkflow(wf)}
                  />
                ))
              )
            )}

            {view === 'loras' && (
              conceptsLoading ? (
                <SkeletonCards />
              ) : concepts.length === 0 ? (
                <div className="self-center flex flex-col gap-1">
                  <p className="text-xs text-white/70">No concepts found</p>
                  <p className="text-xs text-white/45">Check back later as more are added</p>
                </div>
              ) : (() => {
                const families = Array.from(new Set(concepts.map(c => c.model_family).filter(Boolean) as string[])).sort()
                const filtered = familyFilter === 'all' ? concepts : concepts.filter(c => c.model_family === familyFilter)
                return (
                  <>
                    {families.length > 0 && (
                      <div className="flex items-center gap-1 flex-shrink-0 self-center">
                        {['all', ...families].map(f => (
                          <button
                            key={f}
                            onClick={() => setFamilyFilter(f)}
                            className={`rounded px-2 py-0.5 text-[10px] transition-colors whitespace-nowrap ${
                              familyFilter === f
                                ? 'bg-brand/30 text-brand border border-brand/40'
                                : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white/70'
                            }`}
                          >
                            {f === 'all' ? 'All' : f}
                          </button>
                        ))}
                      </div>
                    )}
                    {filtered.map(concept => (
                      <ConceptCard
                        key={concept.concept_hash}
                        concept={concept}
                        onClick={() => handleSelectConcept(concept)}
                      />
                    ))}
                    {filtered.length === 0 && (
                      <div className="self-center text-xs text-white/60">No LoRAs for this family</div>
                    )}
                  </>
                )
              })()
            )}

          </div>
        </div>

        {/* Drag hint */}
        <div className="px-4 pb-2 flex-shrink-0">
          <p className="text-[9px] text-white/30 select-none">
            {view === 'workflows'
              ? 'Click to select · Drag onto canvas to create a node'
              : 'Click to insert into prompt · Drag onto a canvas node to append'}
          </p>
        </div>
      </div>
    </div>
  )

  return ReactDOM.createPortal(popup, document.body)
}
