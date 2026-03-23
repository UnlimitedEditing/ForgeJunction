import React, { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { ViewPlugin, Decoration, type DecorationSet } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

// ── Custom highlight plugin ────────────────────────────────────────────────────

const commandMark = Decoration.mark({ class: 'cm-fj-command' })
const variableMark = Decoration.mark({ class: 'cm-fj-variable' })

const fjHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view)
    }

    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view)
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      const doc = view.state.doc
      const text = doc.toString()

      // Collect all matches with their positions
      type Match = { from: number; to: number; mark: Decoration }
      const matches: Match[] = []

      // Command tokens: /wf, /run:word, /size:WxH, /steps:N, /strength:N, /lora:xxx
      const commandRe = /\/(?:wf|run:\S+|size:\d+x\d+|steps:\d+|strength[\d.]*|lora:\S+)\b/g
      let m: RegExpExecArray | null
      while ((m = commandRe.exec(text)) !== null) {
        matches.push({ from: m.index, to: m.index + m[0].length, mark: commandMark })
      }

      // Variable tokens: {VARIABLE_NAME}
      const variableRe = /\{[A-Z][A-Z0-9_]*\}/g
      while ((m = variableRe.exec(text)) !== null) {
        matches.push({ from: m.index, to: m.index + m[0].length, mark: variableMark })
      }

      // Sort by position to satisfy RangeSetBuilder ordering requirement
      matches.sort((a, b) => a.from - b.from || a.to - b.to)

      for (const { from, to, mark } of matches) {
        builder.add(from, to, mark)
      }

      return builder.finish()
    }
  },
  { decorations: v => v.decorations }
)

const customTheme = EditorView.theme({
  '&': {
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  },
  '.cm-content': {
    padding: '8px 4px',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
  },
  '.cm-fj-command': {
    color: '#ff9554',
    fontWeight: 'bold',
  },
  '.cm-fj-variable': {
    color: '#4ae3ff',
    fontWeight: 'bold',
  },
})

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  minHeight?: string
}

export default function CodeMirrorEditor({ value, onChange, readOnly, minHeight = '120px' }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        oneDark,
        customTheme,
        fjHighlightPlugin,
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            const newVal = update.state.doc.toString()
            valueRef.current = newVal
            onChange?.(newVal)
          }
        }),
        EditorState.readOnly.of(!!readOnly),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes without resetting cursor
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      style={{ minHeight, border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', overflow: 'hidden' }}
    />
  )
}
