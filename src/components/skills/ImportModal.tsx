import React, { useState } from 'react'
import type { SkillDocument, Block, BlockType } from '@/stores/skillEditor'
import { parseSkillText, type ParsedBlock } from '@/utils/skillParser'

interface Props {
  onImport: (doc: Omit<SkillDocument, 'id' | 'createdAt' | 'updatedAt'>) => void
  onClose: () => void
}

const BLOCK_TYPES: BlockType[] = [
  'purpose', 'workflow', 'rule', 'command_template', 'example', 'warning', 'note', 'raw'
]

export default function ImportModal({ onImport, onClose }: Props): React.ReactElement {
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedBlock[] | null>(null)
  const [overrides, setOverrides] = useState<Record<string, BlockType>>({})
  const [parsedMeta, setParsedMeta] = useState<Partial<{ name: string; description: string }>>({})

  function handleParse() {
    const result = parseSkillText(text)
    setParsed(result.blocks)
    setParsedMeta(result.meta as Partial<{ name: string; description: string }>)
    setOverrides({})
  }

  function handleImport() {
    if (!parsed) return
    const blocks: Block[] = parsed.map((pb, i) => {
      const overriddenType = overrides[pb.block.id]
      if (overriddenType && overriddenType !== pb.block.type) {
        // Cast to raw with original content when type is changed
        return {
          id: pb.block.id,
          type: overriddenType,
          order: i,
          content: 'content' in pb.block ? (pb.block as { content: string }).content : '',
        } as Block
      }
      return { ...pb.block, order: i }
    })

    const doc: Omit<SkillDocument, 'id' | 'createdAt' | 'updatedAt'> = {
      meta: {
        name: parsedMeta.name ?? 'Imported Skill',
        slug: '',
        description: parsedMeta.description ?? '',
        targetWorkflow: '',
        commandType: 'txt2img',
        tags: [],
        status: 'draft',
      },
      blocks,
      version: 1,
      rating: null,
    }
    onImport(doc)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-neutral-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-shrink-0">
          <h2 className="text-sm font-semibold text-white">Import Skill from .txt</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-sm">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
          {/* Paste area */}
          <div>
            <label className="block text-[10px] text-white/45 uppercase tracking-wider mb-1.5">Paste skill text</label>
            <textarea
              value={text}
              onChange={e => { setText(e.target.value); setParsed(null) }}
              placeholder="Paste your .txt skill content here…"
              rows={8}
              className="w-full rounded bg-neutral-800 px-3 py-2 text-xs text-white font-mono placeholder-white/20 outline-none ring-1 ring-white/10 focus:ring-brand resize-none"
            />
          </div>

          <button
            onClick={handleParse}
            disabled={!text.trim()}
            className="px-4 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-xs text-white transition-colors disabled:opacity-40"
          >
            Parse
          </button>

          {/* Review panel */}
          {parsed && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/50 uppercase tracking-wider">Parsed blocks</span>
                {parsedMeta.name && (
                  <span className="text-[10px] text-white/70 font-medium">"{parsedMeta.name}"</span>
                )}
              </div>

              {parsed.length === 0 ? (
                <p className="text-xs text-white/40">No blocks could be parsed from this text.</p>
              ) : (
                parsed.map(pb => (
                  <div
                    key={pb.block.id}
                    className={`rounded-lg border p-2.5 flex items-start gap-2 ${
                      pb.confidence === 'high' ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-yellow-500/30 bg-yellow-950/20'
                    }`}
                  >
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${
                      pb.confidence === 'high' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-yellow-900/60 text-yellow-300'
                    }`}>
                      {pb.confidence.toUpperCase()}
                    </span>

                    <div className="flex-1 min-w-0">
                      <select
                        value={overrides[pb.block.id] ?? pb.block.type}
                        onChange={e => setOverrides(prev => ({ ...prev, [pb.block.id]: e.target.value as BlockType }))}
                        className="bg-neutral-800 text-[10px] text-white rounded px-1.5 py-0.5 outline-none ring-1 ring-white/10 mb-1"
                      >
                        {BLOCK_TYPES.map(bt => (
                          <option key={bt} value={bt}>{bt}</option>
                        ))}
                      </select>
                      <p className="text-[11px] text-white/60 truncate">
                        {'content' in pb.block ? (pb.block as { content: string }).content?.slice(0, 100) : JSON.stringify(pb.block).slice(0, 100)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/8 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs text-white/70 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!parsed || parsed.length === 0}
            className="flex-1 py-1.5 rounded bg-brand hover:bg-brand/80 text-xs text-white font-semibold transition-colors disabled:opacity-40"
          >
            Import ({parsed?.length ?? 0} blocks)
          </button>
        </div>
      </div>
    </div>
  )
}
