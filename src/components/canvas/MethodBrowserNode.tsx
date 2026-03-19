import React, { useRef, useState, useEffect, useCallback } from 'react'
import SkillStar from '@/components/icons/SkillStar'
import { useCanvasStore, type CanvasNode } from '@/stores/canvasStore'
import { useWorkflowStore } from '@/stores/workflows'
import { fetchWorkflows, fetchConcepts, type Workflow, type Concept } from '@/api/graydient'

interface Props {
  node: CanvasNode
  isSelected: boolean
  animationClass?: string
  onContextMenu: (e: React.MouseEvent) => void
}

type Tab = 'workflows' | 'concepts'

const FAMILY_FILTERS = ['All', 'SD15', 'SDXL', 'Flux'] as const
const TYPE_FILTERS   = ['All', 'LoRA', 'Full', 'Embed', 'Inpaint'] as const

type FamilyFilter = typeof FAMILY_FILTERS[number]
type TypeFilter   = typeof TYPE_FILTERS[number]

// Map display label → API type value
const TYPE_MAP: Record<TypeFilter, string | null> = {
  All:    null,
  LoRA:   'lora',
  Full:   'full_model',
  Embed:  'inversion',
  Inpaint:'inpainting',
}

function SkeletonCard() {
  return (
    <div className="rounded-lg bg-white/5 overflow-hidden animate-pulse">
      <div className="w-full aspect-video bg-white/8" />
      <div className="p-1.5 space-y-1">
        <div className="h-2.5 bg-white/10 rounded w-3/4" />
        <div className="h-2 bg-white/5 rounded w-1/2" />
      </div>
    </div>
  )
}

interface FlashState { id: string; text: string }

export default function MethodBrowserNode({ node, isSelected, animationClass = '', onContextMenu }: Props): React.ReactElement {
  const { updateNode, setSelectedNode, moveNodes } = useCanvasStore()

  const dragState   = useRef<{ sx: number; sy: number; startPos: Record<string, { x: number; y: number }>; ids: string[] } | null>(null)
  const resizeState = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null)

  // ── Tab / search / filter state ─────────────────────────────────────────
  const [tab,          setTab]         = useState<Tab>('workflows')
  const [search,       setSearch]      = useState('')
  const [debSearch,    setDebSearch]   = useState('')
  const [familyFilter, setFamilyFilter]= useState<FamilyFilter>('All')
  const [typeFilter,   setTypeFilter]  = useState<TypeFilter>('All')

  // ── Data ────────────────────────────────────────────────────────────────
  const { workflows: storeWorkflows, loading: wfLoading } = useWorkflowStore()
  const [localWorkflows,  setLocalWorkflows]  = useState<Workflow[]>([])
  const [concepts,        setConcepts]        = useState<Concept[]>([])
  const [conceptsLoading, setConceptsLoading] = useState(false)

  // ── Scroll reset ref ────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Flash feedback ──────────────────────────────────────────────────────
  const [flash, setFlash] = useState<FlashState | null>(null)

  // ── Debounce search ─────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // ── Scroll to top on filter/tab/search change ───────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [tab, debSearch, familyFilter, typeFilter])

  // ── Load workflows if store is empty ────────────────────────────────────
  useEffect(() => {
    if (storeWorkflows.length > 0) {
      setLocalWorkflows(storeWorkflows)
    } else if (!wfLoading) {
      fetchWorkflows().then(setLocalWorkflows).catch(() => {})
    }
  }, [storeWorkflows, wfLoading])

  useEffect(() => {
    if (storeWorkflows.length > 0) setLocalWorkflows(storeWorkflows)
  }, [storeWorkflows])

  // ── Load concepts when tab switches ─────────────────────────────────────
  const loadConcepts = useCallback((searchStr: string) => {
    setConceptsLoading(true)
    fetchConcepts(undefined, searchStr || undefined)
      .then(setConcepts)
      .catch(() => setConcepts([]))
      .finally(() => setConceptsLoading(false))
  }, [])

  useEffect(() => {
    if (tab === 'concepts') {
      loadConcepts(debSearch)
    }
  }, [tab, debSearch, loadConcepts])

  // ── Filtering ────────────────────────────────────────────────────────────
  const displayedWorkflows = localWorkflows.filter(wf => {
    if (!debSearch) return true
    const q = debSearch.toLowerCase()
    return wf.name.toLowerCase().includes(q) || wf.slug.toLowerCase().includes(q) || (wf.description ?? '').toLowerCase().includes(q)
  })

  const displayedConcepts = concepts.filter(c => {
    if (familyFilter !== 'All' && c.model_family !== familyFilter) return false
    const apiType = TYPE_MAP[typeFilter]
    if (apiType !== null && c.type !== apiType) return false
    return true
  })

  // ── Insert / clipboard logic ─────────────────────────────────────────────
  function showFlash(id: string, text: string) {
    setFlash({ id, text })
    setTimeout(() => setFlash(null), 1200)
  }

  function insertOrCopy(text: string, id: string, isWorkflow: boolean) {
    const store = useCanvasStore.getState()
    const selectedId = store.selectedNodeId
    const targetNode = selectedId ? store.nodes.find(n => n.id === selectedId && n.type === 'prompt') : null

    if (targetNode) {
      let newPrompt: string
      if (isWorkflow) {
        // Replace existing /run:xxx or prepend
        if (targetNode.prompt.match(/\/run:\S+/)) {
          newPrompt = targetNode.prompt.replace(/\/run:\S+/, text)
        } else {
          newPrompt = `${text} ${targetNode.prompt}`.trim()
        }
      } else {
        // Append concept token
        newPrompt = `${targetNode.prompt} ${text}`.trim()
      }
      store.updateNode(targetNode.id, { prompt: newPrompt })
      showFlash(id, 'Inserted')
    } else {
      navigator.clipboard.writeText(text).catch(() => {})
      showFlash(id, 'Copied')
    }
  }

  function onWorkflowClick(wf: Workflow) {
    insertOrCopy(`/run:${wf.slug}`, wf.id, true)
  }

  function onConceptClick(c: Concept) {
    insertOrCopy(`<${c.token}:0.8>`, c.concept_hash, false)
  }

  // ── Drag ─────────────────────────────────────────────────────────────────
  function onHeaderMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    const store = useCanvasStore.getState()
    const isInSelection = store.selectedNodeIds.includes(node.id)
    if (!isInSelection) setSelectedNode(node.id)
    const ids = isInSelection ? store.selectedNodeIds : [node.id]
    const startPos: Record<string, { x: number; y: number }> = {}
    for (const id of ids) {
      const n = store.nodes.find(n2 => n2.id === id)
      if (n) startPos[id] = { ...n.position }
    }
    dragState.current = { sx: e.clientX, sy: e.clientY, startPos, ids }
    function onMove(ev: MouseEvent) {
      if (!dragState.current) return
      const zoom = useCanvasStore.getState().viewport.zoom
      const dx = (ev.clientX - dragState.current.sx) / zoom
      const dy = (ev.clientY - dragState.current.sy) / zoom
      const positions: Record<string, { x: number; y: number }> = {}
      for (const id of dragState.current.ids) {
        const s = dragState.current.startPos[id]
        if (s) positions[id] = { x: s.x + dx, y: s.y + dy }
      }
      moveNodes(positions)
    }
    function onUp() {
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Resize ───────────────────────────────────────────────────────────────
  function onResizeMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    resizeState.current = { sx: e.clientX, sy: e.clientY, sw: node.size.w, sh: node.size.h }
    function onMove(ev: MouseEvent) {
      if (!resizeState.current) return
      const zoom = useCanvasStore.getState().viewport.zoom
      updateNode(node.id, {
        size: {
          w: Math.max(240, resizeState.current.sw + (ev.clientX - resizeState.current.sx) / zoom),
          h: Math.max(320, resizeState.current.sh + (ev.clientY - resizeState.current.sy) / zoom),
        },
      })
    }
    function onUp() {
      resizeState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Layout constants ─────────────────────────────────────────────────────
  const HEADER_H  = 36
  const TAB_H     = 28
  const SEARCH_H  = 32
  const CHIP_H    = 28
  const CHIP_ROWS = tab === 'concepts' ? 2 : 0
  const CHROME_H  = HEADER_H + TAB_H + SEARCH_H + CHIP_H * CHIP_ROWS + 8 // 8px padding
  const GRID_H    = node.size.h - CHROME_H
  const colCount  = Math.max(2, Math.floor((node.size.w - 16) / 130))

  const isLoading = tab === 'workflows' ? (wfLoading && localWorkflows.length === 0) : conceptsLoading

  return (
    <div
      data-node={node.id}
      className={`absolute overflow-visible ${animationClass}`}
      style={{ left: node.position.x, top: node.position.y, width: node.size.w, height: node.size.h }}
      onClick={(e) => { e.stopPropagation(); setSelectedNode(node.id) }}
      onContextMenu={onContextMenu}
    >
      <div className={`absolute inset-0 rounded-xl overflow-hidden border flex flex-col transition-colors ${
        isSelected
          ? 'border-brand/50 shadow-[0_0_0_1px_rgba(108,71,255,0.2),0_4px_32px_rgba(0,0,0,0.6)]'
          : 'border-white/10 shadow-[0_2px_16px_rgba(0,0,0,0.5)]'
      } bg-[#141414]`}>

        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 bg-[#1a1a1a] border-b border-white/8 cursor-grab active:cursor-grabbing flex-shrink-0"
          style={{ height: HEADER_H }}
          onMouseDown={onHeaderMouseDown}
        >
          <span className="text-brand/60 text-xs select-none">⬖</span>
          <span className="text-[11px] text-white/40 font-medium select-none flex-1 tracking-wide">Method Browser</span>
        </div>

        {/* Tab bar */}
        <div
          className="flex items-center gap-1 px-2 bg-[#141414] border-b border-white/5 flex-shrink-0"
          style={{ height: TAB_H }}
        >
          {(['workflows', 'concepts'] as Tab[]).map(t => (
            <button
              key={t}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors capitalize select-none ${
                tab === t
                  ? 'bg-brand/20 text-brand border border-brand/30'
                  : 'text-white/30 hover:text-white/60'
              }`}
              onClick={(e) => { e.stopPropagation(); setTab(t) }}
            >
              {t === 'workflows' ? 'Workflows' : 'Concepts'}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div
          className="flex items-center gap-2 px-2 border-b border-white/5 flex-shrink-0"
          style={{ height: SEARCH_H }}
        >
          <span className="text-white/20 text-xs select-none">⌕</span>
          <input
            className="flex-1 bg-transparent text-[11px] text-white/70 placeholder-white/20 outline-none"
            placeholder={tab === 'workflows' ? 'Search workflows…' : 'Search concepts…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
          />
          {search && (
            <button
              className="text-white/20 hover:text-white/50 text-xs select-none"
              onClick={(e) => { e.stopPropagation(); setSearch('') }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter chips — concepts only */}
        {tab === 'concepts' && (
          <div className="flex-shrink-0 border-b border-white/5 px-2 py-1 space-y-1">
            {/* Family row */}
            <div className="flex items-center gap-1 flex-wrap" style={{ height: CHIP_H }}>
              <span className="text-[9px] text-white/20 select-none w-10 flex-shrink-0">Family</span>
              {FAMILY_FILTERS.map(f => (
                <button
                  key={f}
                  className={`px-1.5 py-0.5 rounded text-[9px] transition-colors select-none ${
                    familyFilter === f
                      ? 'bg-brand/25 text-brand/90 border border-brand/30'
                      : 'text-white/30 hover:text-white/55 border border-white/8'
                  }`}
                  onClick={(e) => { e.stopPropagation(); setFamilyFilter(f) }}
                >
                  {f}
                </button>
              ))}
            </div>
            {/* Type row */}
            <div className="flex items-center gap-1 flex-wrap" style={{ height: CHIP_H }}>
              <span className="text-[9px] text-white/20 select-none w-10 flex-shrink-0">Type</span>
              {TYPE_FILTERS.map(t => (
                <button
                  key={t}
                  className={`px-1.5 py-0.5 rounded text-[9px] transition-colors select-none ${
                    typeFilter === t
                      ? 'bg-brand/25 text-brand/90 border border-brand/30'
                      : 'text-white/30 hover:text-white/55 border border-white/8'
                  }`}
                  onClick={(e) => { e.stopPropagation(); setTypeFilter(t) }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-2 min-h-0"
          style={{ height: GRID_H }}
          onMouseDown={e => e.stopPropagation()}
        >
          {isLoading ? (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
            >
              {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
            >
              {tab === 'workflows' && displayedWorkflows.map(wf => {
                const isFlashing = flash?.id === wf.id
                const thumb = wf.thumbnail_url ?? wf.image_url
                return (
                  <button
                    key={wf.id}
                    draggable
                    className={`rounded-lg overflow-hidden border text-left transition-all group cursor-grab active:cursor-grabbing ${
                      isFlashing
                        ? 'border-brand/70 bg-brand/10'
                        : 'border-white/8 bg-white/3 hover:border-brand/40 hover:bg-white/6'
                    }`}
                    onClick={(e) => { e.stopPropagation(); onWorkflowClick(wf) }}
                    onDragStart={(e) => {
                      e.stopPropagation()
                      e.dataTransfer.setData('application/fj-workflow', JSON.stringify({ slug: wf.slug, name: wf.name }))
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                  >
                    <div className="w-full aspect-video bg-white/5 flex items-center justify-center overflow-hidden relative">
                      {thumb ? (
                        <img src={thumb} alt={wf.name} className="w-full h-full object-cover" />
                      ) : (
                        <SkillStar size={18} className="text-white/15" />
                      )}
                      {isFlashing && (
                        <div className="absolute inset-0 flex items-center justify-center bg-brand/20">
                          <span className="text-[10px] text-brand font-medium">{flash!.text}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-1.5">
                      <div className="text-[10px] text-white/65 leading-tight truncate group-hover:text-white/80 transition-colors">{wf.name}</div>
                      <div className="text-[9px] text-white/25 truncate mt-0.5">{wf.slug}</div>
                    </div>
                  </button>
                )
              })}
              {tab === 'concepts' && displayedConcepts.map(c => {
                const isFlashing = flash?.id === c.concept_hash
                return (
                  <button
                    key={c.concept_hash}
                    className={`rounded-lg overflow-hidden border text-left transition-all group ${
                      isFlashing
                        ? 'border-brand/70 bg-brand/10'
                        : 'border-white/8 bg-white/3 hover:border-brand/40 hover:bg-white/6'
                    }`}
                    onClick={(e) => { e.stopPropagation(); onConceptClick(c) }}
                  >
                    <div className="w-full aspect-video bg-white/5 flex items-center justify-center overflow-hidden relative">
                      {c.example_url ? (
                        <img src={c.example_url} alt={c.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white/15 text-lg">◈</span>
                      )}
                      {isFlashing && (
                        <div className="absolute inset-0 flex items-center justify-center bg-brand/20">
                          <span className="text-[10px] text-brand font-medium">{flash!.text}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-1.5">
                      <div className="text-[10px] text-white/65 leading-tight truncate group-hover:text-white/80 transition-colors">{c.name}</div>
                      <div className="text-[9px] text-white/25 truncate mt-0.5">
                        {c.model_family ?? ''}{c.type ? ` · ${c.type}` : ''}
                      </div>
                    </div>
                  </button>
                )
              })}
              {tab === 'workflows' && !isLoading && displayedWorkflows.length === 0 && (
                <div className="col-span-full text-center py-6 text-white/20 text-[11px]">No workflows found</div>
              )}
              {tab === 'concepts' && !isLoading && displayedConcepts.length === 0 && (
                <div className="col-span-full text-center py-6 text-white/20 text-[11px]">No concepts found</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10"
        style={{ transform: 'translate(0, 0)' }}
        onMouseDown={onResizeMouseDown}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" className="absolute bottom-1.5 right-1.5 text-white/20">
          <path d="M 9 1 L 1 9 M 9 5 L 5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}
