import React from 'react'
import type { SkillDocument } from '@/stores/skillEditor'
import { serializeSkill } from '@/utils/skillSerializer'

interface Props {
  doc: SkillDocument
  onClose: () => void
}

function highlightText(text: string): React.ReactElement[] {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    let el: React.ReactElement

    if (line.startsWith('# ') && !line.startsWith('## ')) {
      el = <span key={i} style={{ color: '#c084fc' }}>{line}</span>
    } else if (line.startsWith('## ')) {
      el = <span key={i} style={{ color: '#ff9554' }}>{line}</span>
    } else if (line.startsWith('### ')) {
      el = <span key={i} style={{ color: '#fbbf24' }}>{line}</span>
    } else if (line.startsWith('- [REQUIRED]')) {
      el = <span key={i} style={{ color: '#86efac' }}>{line}</span>
    } else if (line.startsWith('- [OPTIONAL]')) {
      el = <span key={i} style={{ color: '#fde68a' }}>{line}</span>
    } else if (line.startsWith('- [NEVER]')) {
      el = <span key={i} style={{ color: '#fca5a5' }}>{line}</span>
    } else if (line.startsWith('> ')) {
      el = <span key={i} style={{ color: '#93c5fd' }}>{line}</span>
    } else if (line.startsWith('User:')) {
      el = <span key={i} style={{ color: '#4ae3ff' }}>{line}</span>
    } else if (line.startsWith('Command:')) {
      el = <span key={i} style={{ color: '#ff9554' }}>{line}</span>
    } else if (line.startsWith('```') || line.startsWith('|')) {
      el = <span key={i} style={{ color: '#94a3b8' }}>{line}</span>
    } else {
      el = <span key={i} style={{ color: '#cbd5e1' }}>{line}</span>
    }

    return (
      <React.Fragment key={i}>
        {el}
        {'\n'}
      </React.Fragment>
    )
  })
}

export default function PreviewPane({ doc, onClose }: Props): React.ReactElement {
  const text = serializeSkill(doc)

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: '#080a0c' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/8 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Live Preview</span>
          <span className="text-[10px] text-white/25">{text.split('\n').length} lines</span>
        </div>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded text-[11px] text-white/40 hover:text-white hover:bg-white/8 transition-colors"
        >✕</button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <pre
          className="p-4 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words"
          style={{ background: 'transparent' }}
        >
          {highlightText(text)}
        </pre>
      </div>
    </div>
  )
}
