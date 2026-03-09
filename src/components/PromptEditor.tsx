import React, { useEffect, useRef, useState } from 'react'
import { useWorkflowStore } from '@/stores/workflows'
import { usePromptStore } from '@/stores/prompt'
import { useRenderQueueStore } from '@/stores/renderQueue'
import { useSourceMediaStore } from '@/stores/sourceMedia'
import { validatePromptParams } from '@/utils/workflowKnowledge'
import { categorizeWorkflow } from '@/utils/workflowCategories'
import { getWorkflowInputSlots, type MediaInputSlot } from '@/utils/workflowInputs'
import ParameterBar from '@/components/ParameterBar'
import MediaDropZone from '@/components/MediaDropZone'
import type { Workflow } from '@/api/graydient'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPlaceholder(workflow: Workflow | null): string {
  if (!workflow) return 'Select a workflow, then describe what you want to generate…'
  if (workflow.supports_txt2vid) return '[camera movement] [subject + action] [scene description] [style]'
  if (workflow.supports_txt2wav) return '[verse] lyrics here [chorus] chorus here [bridge] bridge here'
  if (workflow.supports_img2img || workflow.supports_img2vid) return 'Describe the motion or changes to apply…'
  if (workflow.supports_txt2img) return '[subject] [scene / environment] [style / mood]'
  return 'Describe what you want to generate…'
}

// ── WorkflowHeader (Step 5) ───────────────────────────────────────────────────

function WorkflowHeader(): React.ReactElement {
  const { selectedWorkflow, workflows, selectWorkflow } = useWorkflowStore()
  const { setWorkflowSlug } = usePromptStore()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropRef = useRef<HTMLDivElement>(null)

  // Close dropdown on click-outside
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const filtered = workflows.filter((wf) =>
    wf.name.toLowerCase().includes(search.toLowerCase())
  )

  const category = selectedWorkflow ? (categorizeWorkflow(selectedWorkflow)[0] ?? '') : ''

  function pick(slug: string) {
    selectWorkflow(slug)
    setWorkflowSlug(slug)
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="flex-shrink-0 border-b border-white/10 px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="text-sm min-w-0 flex-1 truncate">
        {selectedWorkflow ? (
          <>
            <span className="font-bebas text-xl tracking-wider text-white truncate">{selectedWorkflow.name}</span>
            {category && (
              <span className="ml-2 text-xs text-white/40">({category})</span>
            )}
          </>
        ) : (
          <span className="text-white/30">Select a workflow to begin →</span>
        )}
      </div>

      <div className="relative flex-shrink-0" ref={dropRef}>
        <button
          onClick={() => { setOpen((v) => !v); setSearch('') }}
          className="rounded px-2.5 py-1 text-xs text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
        >
          Change ▼
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-64 rounded-lg bg-neutral-800 border border-white/10 shadow-2xl z-50 overflow-hidden">
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
            <ul className="max-h-60 overflow-y-auto py-1">
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
                <li className="px-3 py-2 text-xs text-white/30">No workflows found</li>
              )}
              {filtered.length > 60 && (
                <li className="px-3 py-2 text-xs text-white/20">
                  +{filtered.length - 60} more — refine search
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// ── RawPromptView (Step 4) ────────────────────────────────────────────────────

function RawPromptView({ onClose }: { onClose: () => void }): React.ReactElement {
  const { rawPrompt, setRawPrompt, copyToClipboard } = usePromptStore()
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    copyToClipboard()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="border-b border-white/10 bg-neutral-950 px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="themed-heading text-xs font-semibold uppercase tracking-widest text-white/40">
          Raw Prompt
        </span>
        <button
          onClick={onClose}
          className="text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          ↙ Close
        </button>
      </div>
      <textarea
        value={rawPrompt}
        onChange={(e) => setRawPrompt(e.target.value)}
        spellCheck={false}
        className="w-full rounded-lg font-mono text-xs bg-neutral-900 text-white/80 p-3 ring-1 ring-white/10 focus:ring-brand outline-none resize-y min-h-[72px] leading-relaxed"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/25">⚠ Editing raw prompt updates all controls</p>
        <button
          onClick={handleCopy}
          className="text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
    </div>
  )
}

// ── PromptEditor (Steps 3 + 7 + 8) ───────────────────────────────────────────

export default function PromptEditor(): React.ReactElement {
  const { selectedWorkflow } = useWorkflowStore()
  const {
    descriptiveText, negativePrompt, rawPrompt, parameters,
    setDescriptiveText, setNegativePrompt, setRawPrompt,
    buildRawPrompt, copyToClipboard, setWorkflowSlug,
  } = usePromptStore()
  const { selectWorkflow } = useWorkflowStore()
  const { enqueue } = useRenderQueueStore()
  const sourceMediaStore = useSourceMediaStore()

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [queued, setQueued] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pasteToast, setPasteToast] = useState(false)
  const [missingSlots, setMissingSlots] = useState<MediaInputSlot[]>([])

  const inputSlots = selectedWorkflow ? getWorkflowInputSlots(selectedWorkflow) : []
  const warnings = selectedWorkflow
    ? validatePromptParams(selectedWorkflow.slug, parameters)
    : []

  // When workflowSlug in the store changes (e.g. via pasted raw prompt),
  // keep the workflow selector in sync
  useEffect(() => {
    const slug = usePromptStore.getState().workflowSlug
    if (slug) selectWorkflow(slug)
  // workflowSlug from the store is read via getState() in the paste handler;
  // rawPrompt changes trigger re-renders which re-evaluate this
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPrompt])

  // When selected workflow changes, clear incompatible media slots and
  // auto-populate primary slot from pending source if applicable
  useEffect(() => {
    if (!selectedWorkflow) return
    const slots = getWorkflowInputSlots(selectedWorkflow)
    sourceMediaStore.clearIncompatibleSlots(slots)
    // Auto-fill primary slot from pending source
    const { pendingSource } = sourceMediaStore
    if (pendingSource && slots.some((s) => s.type === 'primary')) {
      sourceMediaStore.setSlot('init_image_filename', pendingSource)
      sourceMediaStore.setPendingSource(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkflow?.slug])

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData('text')
    // Detect Telegram-style full prompts
    if (/\/run:|^\/wf\s/i.test(pasted)) {
      e.preventDefault()
      setRawPrompt(pasted)
      // Sync workflow selector
      const slug = parseSlugFromRaw(pasted)
      if (slug) selectWorkflow(slug)
      setPasteToast(true)
      setTimeout(() => setPasteToast(false), 3000)
    }
    // Otherwise normal paste — user is editing descriptive text
  }

  function handleSubmit() {
    const slug = selectedWorkflow?.slug || usePromptStore.getState().workflowSlug
    if (!slug) return
    // Ensure the slug is in the raw prompt before enqueuing
    if (!usePromptStore.getState().workflowSlug) {
      setWorkflowSlug(slug)
    }
    const raw = buildRawPrompt()
    if (!raw.trim()) return

    // Validate required input slots
    const missing = inputSlots.length > 0 ? sourceMediaStore.getMissingSlots(inputSlots) : []
    if (missing.length > 0) {
      setMissingSlots(missing)
      setTimeout(() => setMissingSlots([]), 4000)
      return
    }
    setMissingSlots([])

    const { initImage, placeholders, optionPairs } = sourceMediaStore.buildRequestFields()
    // Filter out local data: URLs — they can't be sent to the API
    const safeInitImage = initImage && !initImage.startsWith('data:') ? initImage : undefined
    enqueue(raw, slug, { initImage: safeInitImage, placeholders, optionPairs })
    setQueued(true)
    setTimeout(() => setQueued(false), 2000)
  }

  function handleCopyRaw() {
    copyToClipboard()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky workflow header */}
      <WorkflowHeader />

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* Parameter bar */}
        <ParameterBar onToggleRaw={() => setShowRaw((v) => !v)} showRaw={showRaw} />

        {/* Raw prompt view (collapsible) */}
        {showRaw && <RawPromptView onClose={() => setShowRaw(false)} />}

        <div className="flex flex-col gap-3 px-4 pt-4 pb-4">

          {/* Source media drop zones — one per input slot */}
          {inputSlots.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="themed-heading text-xs font-semibold uppercase tracking-widest text-white/40">
                Input Media
              </p>
              <MediaDropZone slots={inputSlots} />
            </div>
          )}

          {/* Missing required slots validation */}
          {missingSlots.length > 0 && (
            <ul className="flex flex-col gap-1">
              {missingSlots.map((slot) => (
                <li
                  key={slot.fieldName}
                  className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300 ring-1 ring-red-500/30"
                >
                  ⚠ Missing required input: {slot.label}
                </li>
              ))}
            </ul>
          )}

          {/* Pending source toast — shown when "Use as Render Source" was clicked without a workflow */}
          {sourceMediaStore.pendingSource && !selectedWorkflow && (
            <div className="rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand/80 ring-1 ring-brand/20">
              📌 Source media ready — select an input workflow to use it
            </div>
          )}

          {/* Paste detection toast */}
          {pasteToast && (
            <div className="rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-400 ring-1 ring-green-500/20">
              Parsed Telegram prompt ✓
            </div>
          )}

          {/* Main descriptive textarea */}
          <textarea
            ref={textareaRef}
            value={descriptiveText}
            onChange={(e) => setDescriptiveText(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholder(selectedWorkflow)}
            className="min-h-[160px] w-full resize-y rounded-lg bg-neutral-800 p-4 text-base text-white placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-brand leading-relaxed"
          />

          {/* Negative prompt */}
          <div className="flex flex-col gap-1 rounded-lg bg-neutral-800 ring-1 ring-white/10 focus-within:ring-brand px-3 py-2.5">
            <span className="text-xs text-white/30 select-none">Negative:</span>
            <input
              type="text"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="blurry, ugly, distorted, low quality…"
              className="w-full bg-transparent text-sm text-white placeholder-white/20 outline-none"
            />
          </div>

          {/* Validation warnings */}
          {warnings.length > 0 && (
            <ul className="flex flex-col gap-1">
              {warnings.map((w, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-yellow-500/10 px-3 py-1.5 text-xs text-yellow-300 ring-1 ring-yellow-500/30"
                >
                  ⚠ {w}
                </li>
              ))}
            </ul>
          )}

          {/* Action row */}
          <div className="flex gap-2 items-stretch">
            <button
              onClick={handleSubmit}
              className={`btn-primary-submit flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors ${
                queued ? 'is-queued bg-green-600 hover:bg-green-500' : 'bg-brand hover:bg-brand/80'
              }`}
            >
              {queued ? 'Queued!' : 'Submit Render'}
            </button>
            <button
              onClick={handleCopyRaw}
              title="Copy Telegram-compatible raw prompt to clipboard"
              className="rounded-lg border border-white/10 px-3 py-2.5 text-xs text-white/50 hover:border-white/20 hover:text-white transition-colors whitespace-nowrap"
            >
              {copied ? '✓ Copied!' : '📋 Copy Raw'}
            </button>
          </div>

          {/* Raw prompt preview with slot badges (collapsed hint when showRaw is off) */}
          {!showRaw && rawPrompt && (
            <p
              className="text-xs text-white/20 font-mono leading-relaxed truncate cursor-pointer hover:text-white/40 transition-colors"
              title={rawPrompt}
              onClick={() => setShowRaw(true)}
            >
              {rawPrompt}
              {inputSlots
                .filter((s) => s.type === 'secondary')
                .map((s) => {
                  const filled = sourceMediaStore.getSlot(s.fieldName) != null
                  return (
                    <span
                      key={s.fieldName}
                      className={`ml-1 ${filled ? 'text-green-400/50' : 'text-yellow-400/50'}`}
                    >
                      [{s.label} {filled ? '✓' : '—'}]
                    </span>
                  )
                })}
            </p>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Utility ───────────────────────────────────────────────────────────────────

function parseSlugFromRaw(raw: string): string | null {
  const m = raw.match(/\/run:(\S+)/)
  return m ? m[1] : null
}
