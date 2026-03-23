import React, { useState } from 'react'
import { useWorkflowStore } from '@/stores/workflows'
import { usePromptStore } from '@/stores/prompt'
import { getWorkflowTips, getParamConstraints } from '@/utils/workflowKnowledge'
import type { WorkflowFieldMapping, Workflow } from '@/api/graydient'

// Parameters that always show by default (before "Show more")
const PRIMARY_PARAMS = new Set([
  'width', 'height', 'size', 'guidance', 'steps', 'seed',
  'num_images', 'images', 'fps', 'length', 'strength',
])
// Parameters that are part of the prompt text, not the bar
const SKIP_PARAMS = new Set(['prompt_positive', 'prompt_negative', 'init_image'])

const SIZE_PRESETS = [
  { label: '512', w: '512', h: '512' },
  { label: '768', w: '768', h: '768' },
  { label: '1024', w: '1024', h: '1024' },
  { label: '1280×720', w: '1280', h: '720' },
]

const IMAGES_OPTIONS = ['1', '2', '3', '4', '6', '9']

// ── Sub-widgets ───────────────────────────────────────────────────────────────

function SliderWidget({
  label, min, max, step, value, defaultValue, onChange,
}: {
  label: string; min: number; max: number; step: number
  value: string; defaultValue: string; onChange: (v: string) => void
}) {
  const num = parseFloat(value !== '' ? value : defaultValue) || min
  const display = step < 1 ? num.toFixed(1) : String(num)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/75">{label}</span>
        <span className="text-xs font-mono text-white/70 tabular-nums">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={num}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-1.5 accent-brand cursor-pointer"
      />
    </div>
  )
}

function SeedWidget({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-white/75">Seed</span>
      <div className="flex gap-1.5">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="random"
          className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-white placeholder-white/20 outline-none ring-1 ring-white/10 focus:ring-brand [appearance:textfield]"
        />
        <button
          onClick={() => onChange('')}
          title="Use random seed"
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-white/70 ring-1 ring-white/10 hover:text-white/70 transition-colors"
        >
          🎲
        </button>
      </div>
    </div>
  )
}

function ImagesWidget({ value, defaultValue, onChange }: { value: string; defaultValue: string; onChange: (v: string) => void }) {
  const current = value !== '' ? value : defaultValue
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-white/75">Images</span>
      <div className="flex gap-1 flex-wrap">
        {IMAGES_OPTIONS.map((n) => (
          <button
            key={n}
            onClick={() => onChange(n === defaultValue ? '' : n)}
            className={`rounded px-2 py-0.5 text-xs font-mono transition-colors ${
              current === n
                ? 'bg-brand text-white'
                : 'bg-neutral-800 text-white/75 ring-1 ring-white/10 hover:text-white/80'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function SizeWidget({
  widthField, heightField, widthValue, heightValue, defaultW, defaultH, onChange,
}: {
  widthField: WorkflowFieldMapping | null
  heightField: WorkflowFieldMapping | null
  widthValue: string; heightValue: string
  defaultW: string; defaultH: string
  onChange: (w: string, h: string) => void
}) {
  const w = widthValue !== '' ? widthValue : defaultW
  const h = heightValue !== '' ? heightValue : defaultH

  function set(newW: string, newH: string) {
    onChange(newW === defaultW ? '' : newW, newH === defaultH ? '' : newH)
  }

  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <span className="text-xs text-white/75">Size</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={w}
          onChange={(e) => set(e.target.value, h)}
          className="w-20 rounded bg-neutral-800 px-2 py-1 text-xs text-white outline-none ring-1 ring-white/10 focus:ring-brand [appearance:textfield]"
        />
        <span className="text-xs text-white/60">×</span>
        <input
          type="number"
          value={h}
          onChange={(e) => set(w, e.target.value)}
          className="w-20 rounded bg-neutral-800 px-2 py-1 text-xs text-white outline-none ring-1 ring-white/10 focus:ring-brand [appearance:textfield]"
        />
        <div className="flex gap-1 ml-1 flex-wrap">
          {SIZE_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => set(p.w, p.h)}
              className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                w === p.w && h === p.h
                  ? 'bg-brand/20 text-brand ring-1 ring-brand/40'
                  : 'bg-neutral-800 text-white/70 ring-1 ring-white/10 hover:text-white/70'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {(widthField?.minimum_value || widthField?.maximum_value) && (
        <p className="text-[10px] text-white/45">
          {widthField.minimum_value}–{widthField.maximum_value}px per side
        </p>
      )}
    </div>
  )
}

function SizeTextWidget({ value, defaultValue, onChange }: { value: string; defaultValue: string; onChange: (v: string) => void }) {
  const cur = value !== '' ? value : defaultValue
  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <span className="text-xs text-white/75">Size (W×H)</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={cur}
          onChange={(e) => onChange(e.target.value === defaultValue ? '' : e.target.value)}
          placeholder="e.g. 1024x1024"
          className="w-32 rounded bg-neutral-800 px-2 py-1 text-xs text-white placeholder-white/20 outline-none ring-1 ring-white/10 focus:ring-brand font-mono"
        />
        <div className="flex gap-1 flex-wrap">
          {SIZE_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => onChange(`${p.w}x${p.h}` === defaultValue ? '' : `${p.w}x${p.h}`)}
              className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                cur === `${p.w}x${p.h}`
                  ? 'bg-brand/20 text-brand ring-1 ring-brand/40'
                  : 'bg-neutral-800 text-white/70 ring-1 ring-white/10 hover:text-white/70'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function NumberWidget({ label, value, defaultValue, onChange, unit }: {
  label: string; value: string; defaultValue: string; onChange: (v: string) => void; unit?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-white/75">{label}{unit ? ` (${unit})` : ''}</span>
      <input
        type="number"
        value={value !== '' ? value : defaultValue}
        onChange={(e) => onChange(e.target.value === defaultValue ? '' : e.target.value)}
        className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-white outline-none ring-1 ring-white/10 focus:ring-brand [appearance:textfield]"
      />
    </div>
  )
}

function GenericWidget({ label, value, defaultValue, onChange }: {
  label: string; value: string; defaultValue: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-white/75 truncate" title={label}>{label}</span>
      <input
        type="text"
        value={value !== '' ? value : defaultValue}
        onChange={(e) => onChange(e.target.value === defaultValue ? '' : e.target.value)}
        placeholder={defaultValue || '—'}
        className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-white placeholder-white/20 outline-none ring-1 ring-white/10 focus:ring-brand"
      />
    </div>
  )
}

// ── Field dispatcher ──────────────────────────────────────────────────────────

function FieldWidget({
  field, value, workflow, onChange,
}: {
  field: WorkflowFieldMapping
  value: string
  workflow: Workflow
  onChange: (v: string) => void
}) {
  const name = field.local_field.toLowerCase()
  const defaultStr = field.default_value !== null && field.default_value !== undefined ? String(field.default_value) : ''
  const constraints = getParamConstraints(workflow.slug, name)

  if (name === 'guidance') {
    const min = field.minimum_value ?? constraints.min ?? 1
    const max = field.maximum_value ?? constraints.max ?? 20
    return <SliderWidget label="Guidance" min={min} max={max} step={0.5} value={value} defaultValue={defaultStr} onChange={onChange} />
  }
  if (name === 'steps') {
    const min = field.minimum_value ?? 1
    const max = field.maximum_value ?? 100
    return <SliderWidget label="Steps" min={min} max={max} step={1} value={value} defaultValue={defaultStr} onChange={onChange} />
  }
  if (name === 'strength') {
    return <SliderWidget label="Strength" min={0} max={1} step={0.05} value={value} defaultValue={defaultStr} onChange={onChange} />
  }
  if (name === 'fps') {
    const min = field.minimum_value ?? 8
    const max = field.maximum_value ?? 60
    return <SliderWidget label="FPS" min={min} max={max} step={1} value={value} defaultValue={defaultStr} onChange={onChange} />
  }
  if (name === 'seed') {
    return <SeedWidget value={value} onChange={onChange} />
  }
  if (name === 'num_images' || name === 'images') {
    return <ImagesWidget value={value} defaultValue={defaultStr} onChange={onChange} />
  }
  if (name === 'length') {
    return <NumberWidget label="Length" value={value} defaultValue={defaultStr} onChange={onChange} unit="frames" />
  }
  if (name === 'size') {
    return <SizeTextWidget value={value} defaultValue={defaultStr} onChange={onChange} />
  }

  return <GenericWidget label={field.help_text || field.local_field} value={value} defaultValue={defaultStr} onChange={onChange} />
}

// ── Main component ────────────────────────────────────────────────────────────

interface ParameterBarProps {
  onToggleRaw: () => void
  showRaw: boolean
}

export default function ParameterBar({ onToggleRaw, showRaw }: ParameterBarProps): React.ReactElement | null {
  const { selectedWorkflow } = useWorkflowStore()
  const { parameters, setParameter, removeParameter } = usePromptStore()
  const [showMore, setShowMore] = useState(false)

  if (!selectedWorkflow) return null

  const fields = (selectedWorkflow.field_mapping ?? []).filter(
    (f) => !SKIP_PARAMS.has(f.local_field)
  )

  const hasWidth  = fields.some((f) => f.local_field === 'width')
  const hasHeight = fields.some((f) => f.local_field === 'height')
  const sizeFields = new Set(hasWidth && hasHeight ? ['width', 'height'] : [])

  const otherFields = fields.filter((f) => !sizeFields.has(f.local_field))
  const primaryOther   = otherFields.filter((f) => PRIMARY_PARAMS.has(f.local_field.toLowerCase()))
  const secondaryOther = otherFields.filter((f) => !PRIMARY_PARAMS.has(f.local_field.toLowerCase()))
  const visibleOther   = showMore ? otherFields : primaryOther

  const widthField  = fields.find((f) => f.local_field === 'width')  ?? null
  const heightField = fields.find((f) => f.local_field === 'height') ?? null
  const defaultW = widthField?.default_value  !== null && widthField?.default_value  !== undefined ? String(widthField.default_value)  : '1024'
  const defaultH = heightField?.default_value !== null && heightField?.default_value !== undefined ? String(heightField.default_value) : '1024'

  const tips = getWorkflowTips(selectedWorkflow.slug)
  const hint = tips.knownIssues[0] ?? tips.tips[0] ?? null

  function getValue(fieldName: string): string {
    return parameters[fieldName] ?? ''
  }

  function handleChange(fieldName: string, value: string, defaultValue: string | number | null) {
    const defaultStr = defaultValue !== null && defaultValue !== undefined ? String(defaultValue) : ''
    if (value === '' || value === defaultStr) {
      removeParameter(fieldName)
    } else {
      setParameter(fieldName, value)
    }
  }

  return (
    <div className="border-b border-white/10 bg-neutral-900">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="themed-heading text-[10px] font-semibold uppercase tracking-widest text-white/70">
          Parameters
        </span>
        <button
          onClick={onToggleRaw}
          className={`text-xs transition-colors ${showRaw ? 'text-brand' : 'text-white/60 hover:text-white/82'}`}
        >
          {showRaw ? '↙ Hide Raw' : 'Raw Prompt ↗'}
        </button>
      </div>

      {/* No params case */}
      {fields.length === 0 && (
        <p className="px-4 pb-3 text-xs text-white/60">
          No configurable parameters for this workflow.
        </p>
      )}

      {/* Parameter grid */}
      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 pb-3">
          {/* Size widget (combines width + height) */}
          {hasWidth && hasHeight && (
            <SizeWidget
              widthField={widthField}
              heightField={heightField}
              widthValue={getValue('width')}
              heightValue={getValue('height')}
              defaultW={defaultW}
              defaultH={defaultH}
              onChange={(w, h) => {
                if (w === '') removeParameter('width'); else setParameter('width', w)
                if (h === '') removeParameter('height'); else setParameter('height', h)
              }}
            />
          )}

          {/* Other visible fields */}
          {visibleOther.map((f) => (
            <FieldWidget
              key={f.local_field}
              field={f}
              value={getValue(f.local_field)}
              workflow={selectedWorkflow}
              onChange={(v) => handleChange(f.local_field, v, f.default_value)}
            />
          ))}
        </div>
      )}

      {/* Show more / less */}
      {secondaryOther.length > 0 && fields.length > 0 && (
        <div className="px-4 pb-2.5">
          <button
            onClick={() => setShowMore(!showMore)}
            className="text-xs text-white/60 hover:text-white/82 transition-colors"
          >
            {showMore
              ? '− Hide extra parameters'
              : `+ Show ${secondaryOther.length} more parameter${secondaryOther.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Subtle knowledge-base hint */}
      {hint && (
        <div className="px-4 pb-2.5">
          <p className="text-xs text-brand/40 leading-snug">💡 {hint}</p>
        </div>
      )}
    </div>
  )
}
