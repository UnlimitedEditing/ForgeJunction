import React, { useEffect, useRef, useState } from 'react'
import SkillsIcon from '@/components/icons/SkillsIcon'
import { useWorkflowStore } from '@/stores/workflows'
import { usePromptStore } from '@/stores/prompt'
import { useRenderQueueStore } from '@/stores/renderQueue'
import { useSourceMediaStore } from '@/stores/sourceMedia'
import { validatePromptParams } from '@/utils/workflowKnowledge'
import { getWorkflowInputSlots, type MediaInputSlot } from '@/utils/workflowInputs'
import ParameterBar from '@/components/ParameterBar'
import MediaDropZone from '@/components/MediaDropZone'
import PromptTemplateEditor from '@/components/PromptTemplateEditor'
import HighlightedPromptInput from '@/components/HighlightedPromptInput'
import type { Workflow } from '@/api/graydient'

// ── Helpers ────────────────────────────────────────────────────────────────────

function getPlaceholder(workflow: Workflow | null): string {
  if (!workflow) return 'Describe Anything.'
  if (workflow.supports_txt2vid) return '[camera movement] [subject] [scene] [style]'
  if (workflow.supports_txt2wav) return '[verse] lyrics here [chorus] chorus here…'
  if (workflow.supports_img2img || workflow.supports_img2vid) return 'Describe the motion or changes to apply…'
  if (workflow.supports_txt2img) return '[subject] [scene / environment] [style / mood]'
  return 'Describe what you want to generate…'
}

function parseSlugFromRaw(raw: string): string | null {
  const m = raw.match(/\/run:(\S+)/)
  return m ? m[1] : null
}

// ── RawPromptView ──────────────────────────────────────────────────────────────

function RawPromptView({ onClose }: { onClose: () => void }): React.ReactElement {
  const { rawPrompt, setRawPrompt, copyToClipboard } = usePromptStore()
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    copyToClipboard()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-2 px-3 pt-2 pb-1 border-b border-white/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/60">
          Raw Prompt
        </span>
        <div className="flex items-center gap-3">
          <button onClick={handleCopy} className="text-xs text-white/70 hover:text-white/70 transition-colors">
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
          <button onClick={onClose} className="text-xs text-white/70 hover:text-white/70 transition-colors">
            ✕
          </button>
        </div>
      </div>
      <textarea
        value={rawPrompt}
        onChange={(e) => setRawPrompt(e.target.value)}
        spellCheck={false}
        className="w-full rounded font-mono text-xs bg-black/30 text-white/80 p-2 ring-1 ring-white/10 focus:ring-brand outline-none resize-none min-h-[56px] leading-relaxed"
      />
      <p className="text-xs text-white/45 pb-1">⚠ Editing raw prompt updates all controls</p>
    </div>
  )
}

// ── Simple type quick-picks (migrated from WorkflowSelector Quick Start) ───────

interface SimpleType { label: string; icon: string; slugKeywords: string[] }

const QUICK_TYPES: SimpleType[] = [
  { label: 'Text → Image',          icon: '🖼',  slugKeywords: ['zimage-turbo'] },
  { label: 'Image → Image',         icon: '🔄',  slugKeywords: ['edit', 'flux'] },
  { label: 'Text → Video',          icon: '🎬',  slugKeywords: ['smoothwan'] },
  { label: 'Image → Video',         icon: '🎞',  slugKeywords: ['animate', 'smoothwan'] },
  { label: 'Text → Music',          icon: '🎵',  slugKeywords: ['musicace'] },
  { label: 'Text → Speech',         icon: '🗣',  slugKeywords: ['infinitetalk'] },
]

function findWfForType(type: SimpleType, workflows: Workflow[]): Workflow | null {
  return workflows.find(w => type.slugKeywords.every(k => w.slug.toLowerCase().includes(k))) ?? null
}

// ── WorkflowChip ───────────────────────────────────────────────────────────────

function WorkflowChip(): React.ReactElement {
  const { selectedWorkflow, workflows, selectWorkflow, clearWorkflow } = useWorkflowStore()
  const { setWorkflowSlug } = usePromptStore()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dragFromRef = useRef(false)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Drag-off-to-clear: mousedown on chip → drag off → release = clear selection
  useEffect(() => {
    function onUp(e: MouseEvent) {
      if (!dragFromRef.current) return
      dragFromRef.current = false
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        clearWorkflow()
        setWorkflowSlug('')
        setOpen(false)
      }
    }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [clearWorkflow, setWorkflowSlug])

  const filtered = workflows.filter((wf) =>
    wf.name.toLowerCase().includes(search.toLowerCase())
  )

  function pick(slug: string) {
    selectWorkflow(slug)
    setWorkflowSlug(slug)
    setOpen(false)
    setSearch('')
  }

  const quickPicks = React.useMemo(
    () => QUICK_TYPES.map(t => ({ type: t, wf: findWfForType(t, workflows) })).filter(x => x.wf !== null) as { type: SimpleType; wf: Workflow }[],
    [workflows]
  )

  return (
    <div className="relative flex-shrink-0" ref={dropRef}>
      <button
        ref={btnRef}
        onMouseDown={() => { dragFromRef.current = true }}
        onClick={() => { setOpen((v) => !v); setSearch('') }}
        title={selectedWorkflow ? `${selectedWorkflow.name} — drag off to clear` : 'Skills auto-select — AI picks the best workflow'}
        className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors max-w-[160px] ${
          selectedWorkflow
            ? 'bg-white/8 text-white/70 hover:bg-white/12 hover:text-white'
            : 'bg-brand/15 text-brand/80 hover:bg-brand/25 hover:text-brand'
        }`}
      >
        {selectedWorkflow ? (
          <span className="truncate font-medium">{selectedWorkflow.name}</span>
        ) : (
          <>
            <SkillsIcon size={12} className="flex-shrink-0" />
            <span className="font-medium">Skills</span>
          </>
        )}
        <span className="text-white/60 flex-shrink-0 text-[10px]">▼</span>
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-2 w-72 rounded-lg bg-neutral-800 border border-white/10 shadow-2xl z-50 overflow-hidden">
          {/* Clear selection */}
          {selectedWorkflow && !search && (
            <div className="border-b border-white/8 px-2 py-1.5">
              <button
                onClick={() => { clearWorkflow(); setWorkflowSlug(''); setOpen(false) }}
                className="w-full text-left px-2 py-1 rounded text-xs text-white/70 hover:text-white/70 hover:bg-white/5 transition-colors"
              >
                ✕ Clear selection
              </button>
            </div>
          )}
          {/* Quick-start picks */}
          {!search && quickPicks.length > 0 && (
            <div className="border-b border-white/8">
              <div className="px-3 pt-2 pb-1 text-[10px] text-white/50 uppercase tracking-widest">Quick Start</div>
              <div className="grid grid-cols-3 gap-1 px-2 pb-2">
                {quickPicks.map(({ type, wf }) => (
                  <button
                    key={type.label}
                    onClick={() => pick(wf.slug)}
                    className="flex flex-col items-center gap-0.5 rounded-md px-1 py-2 bg-neutral-700/50 hover:bg-brand/15 hover:border-brand/30 border border-transparent transition-colors text-center"
                    title={type.label}
                  >
                    <span className="text-lg leading-none">{type.icon}</span>
                    <span className="text-[9px] text-white/75 leading-tight">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="p-2 border-b border-white/10">
            <input
              autoFocus
              type="text"
              placeholder="Search workflows…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded bg-neutral-700 px-2.5 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-brand ring-1 ring-transparent"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.slice(0, 60).map((wf) => (
              <li key={wf.id}>
                <button
                  onClick={() => pick(wf.slug)}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    selectedWorkflow?.slug === wf.slug
                      ? 'text-brand bg-brand/10'
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {wf.name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-white/60">No workflows found</li>
            )}
            {filtered.length > 60 && (
              <li className="px-3 py-2 text-xs text-white/45">+{filtered.length - 60} more — refine search</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── PromptEditor ───────────────────────────────────────────────────────────────

export default function PromptEditor(): React.ReactElement {
  const { selectedWorkflow } = useWorkflowStore()
  const {
    descriptiveText, negativePrompt, rawPrompt, parameters,
    setDescriptiveText, setNegativePrompt, setRawPrompt,
    buildRawPrompt, copyToClipboard, setWorkflowSlug,
  } = usePromptStore()
  const { selectWorkflow } = useWorkflowStore()
  const { enqueue, enqueueSkill } = useRenderQueueStore()
  const sourceMediaStore = useSourceMediaStore()

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [queued, setQueued] = useState(false)
  const [pasteToast, setPasteToast] = useState(false)
  const [missingSlots, setMissingSlots] = useState<MediaInputSlot[]>([])
  const [templateOpen, setTemplateOpen] = useState(false)

  const inputSlots = selectedWorkflow ? getWorkflowInputSlots(selectedWorkflow) : []
  const warnings = selectedWorkflow ? validatePromptParams(selectedWorkflow.slug, parameters) : []

  // Auto-grow textarea (1–4 lines)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 96) + 'px'
  }, [descriptiveText])

  // Sync workflow selector when raw prompt changes (e.g. via paste)
  useEffect(() => {
    const slug = usePromptStore.getState().workflowSlug
    if (slug) selectWorkflow(slug)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPrompt])

  // Clear incompatible media slots on workflow change + auto-populate from pending
  useEffect(() => {
    if (!selectedWorkflow) return
    const slots = getWorkflowInputSlots(selectedWorkflow)
    sourceMediaStore.clearIncompatibleSlots(slots)
    const { pendingSource } = sourceMediaStore
    if (pendingSource && slots.some((s) => s.type === 'primary')) {
      sourceMediaStore.setSlot('init_image_filename', pendingSource)
      sourceMediaStore.setPendingSource(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkflow?.slug])

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData('text')
    if (/\/run:|^\/wf\s/i.test(pasted)) {
      e.preventDefault()
      setRawPrompt(pasted)
      const slug = parseSlugFromRaw(pasted)
      if (slug) selectWorkflow(slug)
      setPasteToast(true)
      setTimeout(() => setPasteToast(false), 3000)
    }
  }

  function handleSubmit() {
    const slug = selectedWorkflow?.slug || usePromptStore.getState().workflowSlug
    const { initImage, placeholders, optionPairs } = sourceMediaStore.buildRequestFields()
    const safeInitImage = initImage && !initImage.startsWith('data:') ? initImage : undefined

    if (!slug) {
      // No workflow selected — Skills auto-select mode
      const promptText = descriptiveText?.trim()
      if (!promptText) return
      enqueueSkill(promptText, undefined, safeInitImage ? { initImage: safeInitImage } : undefined)
      setQueued(true)
      setTimeout(() => setQueued(false), 2000)
      return
    }

    if (!usePromptStore.getState().workflowSlug) setWorkflowSlug(slug)
    const raw = buildRawPrompt()
    if (!raw.trim()) return

    const missing = inputSlots.length > 0 ? sourceMediaStore.getMissingSlots(inputSlots) : []
    if (missing.length > 0) {
      setMissingSlots(missing)
      setDrawerOpen(true)
      setTimeout(() => setMissingSlots([]), 4000)
      return
    }
    setMissingSlots([])

    enqueue(raw, slug, { initImage: safeInitImage, placeholders, optionPairs })
    setQueued(true)
    setTimeout(() => setQueued(false), 2000)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <>
    <PromptTemplateEditor open={templateOpen} onClose={() => setTemplateOpen(false)} />
    <div className="bg-neutral-900/90 backdrop-blur-md border-t border-white/10">

      {/* ── Advanced drawer ── */}
      <div className={`overflow-hidden transition-all duration-200 ease-in-out ${drawerOpen ? 'max-h-[400px]' : 'max-h-0'}`}>
        <div className="rounded-t-xl border border-b-0 border-white/10 mx-2 overflow-y-auto max-h-[400px] bg-neutral-900/95">

          <ParameterBar onToggleRaw={() => setShowRaw((v) => !v)} showRaw={showRaw} />

          {showRaw && <RawPromptView onClose={() => setShowRaw(false)} />}

          <div className="flex flex-col gap-2 px-3 pt-2 pb-3">

            {inputSlots.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
                  Input Media
                </p>
                <MediaDropZone slots={inputSlots} />
              </div>
            )}

            {/* Negative prompt */}
            <div className="flex items-center gap-2 rounded-lg bg-white/5 ring-1 ring-white/10 focus-within:ring-brand px-3 py-2">
              <span className="text-xs text-white/60 flex-shrink-0 select-none">Negative:</span>
              <input
                type="text"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="blurry, ugly, distorted, low quality…"
                className="flex-1 bg-transparent text-xs text-white placeholder-white/20 outline-none"
              />
            </div>

            {/* Raw prompt preview hint */}
            {!showRaw && rawPrompt && (
              <p
                className="text-xs text-white/45 font-mono leading-relaxed truncate cursor-pointer hover:text-white/70 transition-colors"
                title={rawPrompt}
                onClick={() => setShowRaw(true)}
              >
                {rawPrompt}
                {inputSlots.filter((s) => s.type === 'secondary').map((s) => {
                  const filled = sourceMediaStore.getSlot(s.fieldName) != null
                  return (
                    <span key={s.fieldName} className={`ml-1 ${filled ? 'text-green-400/50' : 'text-yellow-400/50'}`}>
                      [{s.label} {filled ? '✓' : '—'}]
                    </span>
                  )
                })}
              </p>
            )}

            {/* Toasts */}
            {pasteToast && (
              <div className="rounded bg-green-500/10 px-2 py-1.5 text-xs text-green-400 ring-1 ring-green-500/20">
                Parsed Telegram prompt ✓
              </div>
            )}
            {sourceMediaStore.pendingSource && !selectedWorkflow && (
              <div className="rounded bg-brand/10 px-2 py-1.5 text-xs text-brand/80 ring-1 ring-brand/20">
                📌 Source media ready — select a workflow to use it
              </div>
            )}

            {/* Validation */}
            {missingSlots.length > 0 && (
              <ul className="flex flex-col gap-1">
                {missingSlots.map((slot) => (
                  <li key={slot.fieldName} className="rounded bg-red-500/10 px-2 py-1.5 text-xs text-red-300 ring-1 ring-red-500/30">
                    ⚠ Missing required input: {slot.label}
                  </li>
                ))}
              </ul>
            )}
            {warnings.length > 0 && (
              <ul className="flex flex-col gap-1">
                {warnings.map((w, i) => (
                  <li key={i} className="rounded bg-yellow-500/10 px-2 py-1.5 text-xs text-yellow-300 ring-1 ring-yellow-500/30">
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            )}

          </div>
        </div>
      </div>

      {/* ── Main bar ── */}
      <div className="flex items-end gap-2 px-3 py-2">

        <WorkflowChip />

        {/* 📎 Media attach — toggles drawer */}
        <button
          onClick={() => setDrawerOpen(v => !v)}
          className={`flex-shrink-0 rounded-md p-1.5 transition-colors ${drawerOpen && inputSlots.length > 0 ? 'text-brand bg-brand/10' : 'text-white/70 hover:text-white/70 hover:bg-white/10'}`}
          title={drawerOpen ? 'Close media drawer' : inputSlots.length > 0 ? 'Attach input media' : 'Attach media (select a workflow that accepts input first)'}
        >
          📎
        </button>

        {/* ⚙ Drawer toggle */}
        <button
          onClick={() => setDrawerOpen((v) => !v)}
          className={`flex-shrink-0 rounded-md p-1.5 transition-colors ${
            drawerOpen
              ? 'text-brand bg-brand/10 hover:bg-brand/20'
              : 'text-white/70 hover:text-white/70 hover:bg-white/10'
          }`}
          title={drawerOpen ? 'Close advanced options' : 'Advanced options'}
        >
          ⚙
        </button>

        {/* ⎇ Template mode */}
        <button
          onClick={() => setTemplateOpen(true)}
          className="flex-shrink-0 rounded-md px-2 py-1.5 text-xs transition-colors text-white/70 hover:text-white/70 hover:bg-white/10"
          title="Prompt templates"
        >
          ⎇
        </button>

        {/* Prompt textarea — auto-grows 1–4 lines */}
        <HighlightedPromptInput
          textareaRef={textareaRef}
          value={descriptiveText ?? ''}
          onChange={setDescriptiveText}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={getPlaceholder(selectedWorkflow)}
          wrapperClassName="flex-1 rounded-lg bg-white/5 ring-1 ring-white/10 focus-within:ring-brand"
          textClassName="px-3 py-2 text-sm leading-relaxed overflow-y-auto"
          style={{ minHeight: '36px', maxHeight: '96px' }}
        />

        {/* Submit */}
        <button
          onClick={handleSubmit}
          className={`flex-shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
            queued ? 'bg-green-600 hover:bg-green-500' : 'bg-brand hover:bg-brand/80'
          }`}
          title="Submit render (Enter)"
        >
          {queued ? '✓' : '→'}
        </button>

      </div>
    </div>
    </>
  )
}
