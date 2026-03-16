/**
 * HighlightedPromptInput — textarea with inline syntax highlighting overlay.
 *
 * Rules:
 *   /command or /command:value  → orange
 *   [negative text]             → red
 *   {{template_field}}          → brand/purple
 *   everything else             → green (positive prompt)
 */

import React, { useRef } from 'react'

// ── Parser ─────────────────────────────────────────────────────────────────────

type SegType = 'command' | 'negative' | 'field' | 'positive'
interface Seg { text: string; type: SegType }

// Matches /cmd or /cmd:value, [negative], or {{field}}
const TOKEN = /(\/[\w.-]+(?::[^\s[\]{}]*)?|\[[^\]]*\]|\{\{[^}]*\}\})/g

export function parsePromptSegments(text: string): Seg[] {
  const segs: Seg[] = []
  let last = 0
  let m: RegExpExecArray | null
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) segs.push({ text: text.slice(last, m.index), type: 'positive' })
    const tok = m[0]
    if (tok.startsWith('/')) segs.push({ text: tok, type: 'command' })
    else if (tok.startsWith('[')) segs.push({ text: tok, type: 'negative' })
    else segs.push({ text: tok, type: 'field' })
    last = TOKEN.lastIndex
  }
  if (last < text.length) segs.push({ text: text.slice(last), type: 'positive' })
  return segs
}

function segColor(type: SegType): string {
  if (type === 'command')  return 'text-orange-400'
  if (type === 'negative') return 'text-red-400'
  if (type === 'field')    return 'text-brand'
  return 'text-emerald-300/80'
}

function renderSegments(segs: Seg[]): React.ReactNode {
  return segs.map((s, i) => (
    <span key={i} className={segColor(s.type)}>
      {s.text}
    </span>
  ))
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  // Outer wrapper classes (background, border, ring, rounded, flex, etc.)
  wrapperClassName?: string
  // Shared text style classes (font size, line-height, padding)
  textClassName?: string
  style?: React.CSSProperties
  textareaRef?: React.RefObject<HTMLTextAreaElement>
  // Event handlers
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste?:   (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  onMouseUp?: (e: React.MouseEvent<HTMLTextAreaElement>) => void
  onKeyUp?:   (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onBlur?:    (e: React.FocusEvent<HTMLTextAreaElement>) => void
  onClick?:   (e: React.MouseEvent<HTMLTextAreaElement>) => void
  onMouseDown?: (e: React.MouseEvent<HTMLTextAreaElement>) => void
}

export default function HighlightedPromptInput({
  value, onChange, placeholder, rows,
  wrapperClassName = '', textClassName = '',
  style, textareaRef: externalRef,
  onKeyDown, onPaste, onMouseUp, onKeyUp, onBlur, onClick, onMouseDown,
}: Props): React.ReactElement {
  const internalRef = useRef<HTMLTextAreaElement>(null)
  const ref = externalRef ?? internalRef
  const mirrorRef = useRef<HTMLDivElement>(null)

  const segs = parsePromptSegments(value)

  function handleScroll() {
    if (mirrorRef.current && ref.current) {
      mirrorRef.current.scrollTop  = ref.current.scrollTop
      mirrorRef.current.scrollLeft = ref.current.scrollLeft
    }
  }

  return (
    <div
      className={`relative overflow-hidden ${wrapperClassName}`}
      style={style}
    >
      {/* Highlight mirror — pointer-events-none, absolutely overlaid */}
      <div
        ref={mirrorRef}
        aria-hidden
        className={`absolute inset-0 overflow-hidden pointer-events-none select-none whitespace-pre-wrap break-words ${textClassName}`}
      >
        {renderSegments(segs)}
        {/* zero-width space keeps the div the same height as the textarea */}
        &#8203;
      </div>

      {/* Actual textarea — transparent text, visible caret */}
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        onChange={e => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onMouseUp={onMouseUp}
        onKeyUp={onKeyUp}
        onBlur={onBlur}
        onClick={onClick}
        onMouseDown={onMouseDown}
        className={`relative w-full resize-none bg-transparent outline-none placeholder-white/25 ${textClassName}`}
        style={{ color: 'transparent', caretColor: 'white' }}
      />
    </div>
  )
}
