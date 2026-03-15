import React, { useRef, useState } from 'react'
import { usePromptTemplateStore, type TemplateStep, type TemplateSlot } from '@/stores/promptTemplate'
import { useRenderQueueStore } from '@/stores/renderQueue'
import { useSourceMediaStore } from '@/stores/sourceMedia'
import { useWorkflowStore } from '@/stores/workflows'
import { usePromptStore } from '@/stores/prompt'

// ── Workflow dropdown for a step ───────────────────────────────────────────────

function StepWorkflowPicker({
  stepId,
  currentSlug,
}: {
  stepId: string
  currentSlug: string
}): React.ReactElement {
  const { workflows } = useWorkflowStore()
  const { setStepWorkflow } = usePromptTemplateStore()

  return (
    <select
      value={currentSlug}
      onChange={(e) => setStepWorkflow(stepId, e.target.value)}
      className="rounded bg-neutral-700 px-2 py-0.5 text-xs text-white/70 outline-none focus:ring-1 focus:ring-brand ring-1 ring-white/10 max-w-[160px]"
    >
      {!currentSlug && <option value="">Select workflow…</option>}
      {workflows.map((wf) => (
        <option key={wf.id} value={wf.slug}>
          {wf.name}
        </option>
      ))}
    </select>
  )
}

// ── Template preview renderer ──────────────────────────────────────────────────

function renderTemplateSegments(
  templateText: string,
  slots: TemplateSlot[],
  onRemoveSlot: (slotId: string) => void
): React.ReactNode[] {
  const slotMap = new Map(slots.map((s) => [s.id, s]))
  const parts: React.ReactNode[] = []
  const regex = /\{\{([^}]+)\}\}/g
  let lastIndex = 0
  let match
  let key = 0

  while ((match = regex.exec(templateText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{templateText.slice(lastIndex, match.index)}</span>)
    }
    const slotId = match[1]
    const slot = slotMap.get(slotId)
    if (slot) {
      parts.push(
        <span
          key={key++}
          className="inline-flex items-center gap-1 rounded bg-brand/20 text-brand px-1.5 py-0.5 text-xs font-medium mx-0.5 align-middle"
        >
          <span>{slot.label}{slot.value ? `: ${slot.value}` : ''}</span>
          <button
            onClick={() => onRemoveSlot(slotId)}
            className="text-brand/50 hover:text-brand/90 leading-none ml-0.5"
            title="Remove slot"
          >
            ×
          </button>
        </span>
      )
    } else {
      parts.push(<span key={key++} className="text-white/30">{match[0]}</span>)
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < templateText.length) {
    parts.push(<span key={key++}>{templateText.slice(lastIndex)}</span>)
  }

  return parts
}

// ── Individual step card ───────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  total,
}: {
  step: TemplateStep
  index: number
  total: number
}): React.ReactElement {
  const {
    removeStep, moveStep, updateTemplateText, updateSlotValue,
    addSlot, removeSlot, setLinkToPrevious,
  } = usePromptTemplateStore()

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [makingSlot, setMakingSlot] = useState(false)
  const [slotLabel, setSlotLabel] = useState('')
  const labelInputRef = useRef<HTMLInputElement>(null)

  function handleSelectionChange() {
    const el = textareaRef.current
    if (!el) return
    if (el.selectionStart !== el.selectionEnd) {
      setSelection({ start: el.selectionStart, end: el.selectionEnd })
    } else {
      if (!makingSlot) setSelection(null)
    }
  }

  function handleMakeSlot() {
    setMakingSlot(true)
    setSlotLabel('')
    setTimeout(() => labelInputRef.current?.focus(), 0)
  }

  function confirmSlot() {
    if (!selection || !slotLabel.trim()) return
    addSlot(step.id, selection.start, selection.end, slotLabel.trim())
    setSelection(null)
    setMakingSlot(false)
    setSlotLabel('')
  }

  function cancelMakeSlot() {
    setMakingSlot(false)
    setSlotLabel('')
    setSelection(null)
  }

  const hasSlots = step.slots.length > 0

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      {/* Step header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800/60 border-b border-white/10">
        <div className="flex gap-0.5 flex-shrink-0">
          <button
            onClick={() => moveStep(step.id, 'up')}
            disabled={index === 0}
            className="rounded p-0.5 text-white/30 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
            title="Move up"
          >
            ↑
          </button>
          <button
            onClick={() => moveStep(step.id, 'down')}
            disabled={index === total - 1}
            className="rounded p-0.5 text-white/30 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
            title="Move down"
          >
            ↓
          </button>
        </div>
        <span className="text-xs text-white/40 flex-shrink-0">
          {step.label ?? `Step ${index + 1}`}
        </span>
        <span className="text-white/20 text-xs">—</span>
        <StepWorkflowPicker stepId={step.id} currentSlug={step.workflowSlug} />
        <button
          onClick={() => removeStep(step.id)}
          className="ml-auto text-xs text-white/25 hover:text-red-400 transition-colors flex-shrink-0"
          title="Remove step"
        >
          × Remove
        </button>
      </div>

      <div className="p-3 flex flex-col gap-2.5">
        {/* Template textarea */}
        <div className="flex flex-col gap-1">
          <p className="text-xs text-white/30">Template <span className="text-white/20">(select text then click "Make slot")</span></p>
          <textarea
            ref={textareaRef}
            value={step.templateText}
            onChange={(e) => updateTemplateText(step.id, e.target.value)}
            onMouseUp={handleSelectionChange}
            onKeyUp={handleSelectionChange}
            onBlur={() => { if (!makingSlot) setSelection(null) }}
            rows={3}
            className="w-full resize-none rounded-lg bg-neutral-800 px-3 py-2 text-sm text-white/80 font-mono outline-none ring-1 ring-white/10 focus:ring-brand leading-relaxed"
            placeholder="Enter your prompt here. Select any word or phrase to turn it into a slot…"
          />
        </div>

        {/* Make slot bar */}
        {selection && !makingSlot && (
          <button
            onMouseDown={(e) => { e.preventDefault(); handleMakeSlot() }}
            className="self-start rounded-md bg-brand/15 border border-brand/30 px-3 py-1 text-xs text-brand hover:bg-brand/25 transition-colors"
          >
            ＋ Make slot from selection
          </button>
        )}

        {makingSlot && (
          <div className="flex items-center gap-2">
            <input
              ref={labelInputRef}
              value={slotLabel}
              onChange={(e) => setSlotLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmSlot()
                if (e.key === 'Escape') cancelMakeSlot()
              }}
              placeholder="Slot label (e.g. Subject, Style…)"
              className="flex-1 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-white outline-none ring-1 ring-brand"
            />
            <button
              onClick={confirmSlot}
              disabled={!slotLabel.trim()}
              className="rounded-md bg-brand px-3 py-1.5 text-xs text-white font-medium disabled:opacity-40 hover:bg-brand/80 transition-colors"
            >
              Add
            </button>
            <button
              onClick={cancelMakeSlot}
              className="rounded-md px-2 py-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Template preview with slot chips */}
        {hasSlots && (
          <div className="rounded-lg bg-white/5 px-3 py-2.5 text-sm text-white/70 leading-relaxed min-h-[2rem]">
            {renderTemplateSegments(step.templateText, step.slots, (slotId) =>
              removeSlot(step.id, slotId)
            )}
          </div>
        )}

        {/* Slot fill inputs */}
        {hasSlots && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
            {step.slots.map((slot) => (
              <div key={slot.id} className="flex items-center gap-1.5">
                <label className="text-xs text-white/40 flex-shrink-0">{slot.label}:</label>
                <input
                  value={slot.value}
                  onChange={(e) => updateSlotValue(step.id, slot.id, e.target.value)}
                  className="rounded bg-neutral-700 px-2 py-1 text-xs text-white outline-none ring-1 ring-white/10 focus:ring-brand w-32"
                  placeholder="value…"
                />
              </div>
            ))}
          </div>
        )}

        {/* Link to previous */}
        {index > 0 && (
          <label className="flex items-center gap-2 text-xs text-white/40 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={step.linkToPrevious ?? false}
              onChange={(e) => setLinkToPrevious(step.id, e.target.checked)}
              className="accent-brand"
            />
            <span>Use previous step's output as source media</span>
          </label>
        )}
      </div>
    </div>
  )
}

// ── Main modal ─────────────────────────────────────────────────────────────────

export default function PromptTemplateEditor({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}): React.ReactElement | null {
  const {
    steps, activeStepId, addStep, buildFilledPrompt,
  } = usePromptTemplateStore()
  const { enqueue } = useRenderQueueStore()
  const { setFromRender } = useSourceMediaStore()
  const { selectedWorkflow } = useWorkflowStore()
  const { setDescriptiveText } = usePromptStore()

  const [chainRunning, setChainRunning] = useState(false)
  const abortRef = useRef(false)

  if (!open) return null

  async function handleRunChain() {
    if (steps.length === 0) return
    setChainRunning(true)
    abortRef.current = false

    let previousResultUrl: string | null = null
    let previousMediaType: string | null = null

    for (let i = 0; i < steps.length; i++) {
      if (abortRef.current) break
      const step = steps[i]
      const prompt = buildFilledPrompt(step.id)
      if (!prompt.trim()) continue

      // If linked to previous and we have a result, set it as source first
      if (step.linkToPrevious && previousResultUrl) {
        setFromRender(previousResultUrl, previousMediaType ?? 'image')
      }

      const beforeTime = Date.now()
      enqueue(prompt, step.workflowSlug)

      // If next step needs our output, wait for this render to complete
      const nextStep = steps[i + 1]
      if (nextStep?.linkToPrevious) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => { clearInterval(interval); resolve() }, 20 * 60 * 1000)
          const interval = setInterval(() => {
            if (abortRef.current) { clearInterval(interval); clearTimeout(timeout); resolve(); return }
            const queue = useRenderQueueStore.getState().queue
            const ourRender = queue.find(
              (r) =>
                r.submittedAt >= beforeTime &&
                r.workflowSlug === step.workflowSlug &&
                (r.status === 'done' || r.status === 'error')
            )
            if (ourRender) {
              clearInterval(interval)
              clearTimeout(timeout)
              previousResultUrl = ourRender.resultUrl
              previousMediaType = ourRender.mediaType
              resolve()
            }
          }, 1000)
        })
      }
    }

    setChainRunning(false)
    onClose()
  }

  function handleClose() {
    // Paste active step's filled prompt back into descriptive text
    if (activeStepId) {
      const filled = buildFilledPrompt(activeStepId)
      if (filled.trim()) setDescriptiveText(filled)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Panel */}
      <div className="relative z-10 flex flex-col w-full max-w-2xl max-h-[80vh] mx-4 rounded-xl bg-neutral-900 border border-white/10 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 flex-shrink-0">
          <span className="text-sm font-semibold uppercase tracking-widest text-white/50">
            Prompt Templates
          </span>
          <button
            onClick={handleClose}
            className="text-white/30 hover:text-white/70 transition-colors text-sm"
          >
            ✕ Close
          </button>
        </div>

        {/* Steps list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {steps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-white/30 text-sm">No template steps yet</p>
              <p className="text-white/20 text-xs text-center max-w-xs">
                Add a step to start building a reusable prompt template with variable slots
              </p>
            </div>
          ) : (
            steps.map((step, i) => (
              <StepCard key={step.id} step={step} index={i} total={steps.length} />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-white/10 flex-shrink-0">
          <button
            onClick={() =>
              addStep(
                selectedWorkflow?.slug ?? steps[steps.length - 1]?.workflowSlug ?? '',
                ''
              )
            }
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 hover:border-white/20 hover:text-white transition-colors"
          >
            ＋ Add Step
          </button>

          <div className="flex-1" />

          {chainRunning && (
            <button
              onClick={() => { abortRef.current = true }}
              className="rounded-lg px-3 py-1.5 text-xs text-red-400 border border-red-500/30 hover:bg-red-900/20 transition-colors"
            >
              ✕ Stop Chain
            </button>
          )}

          <button
            onClick={handleRunChain}
            disabled={steps.length === 0 || chainRunning}
            className="rounded-lg bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {chainRunning ? '⏳ Running…' : '▶ Run Chain'}
          </button>
        </div>
      </div>
    </div>
  )
}
