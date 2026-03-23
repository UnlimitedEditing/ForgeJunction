import React from 'react'
import type { BlockType, Block } from '@/stores/skillEditor'
import { useSkillEditorStore } from '@/stores/skillEditor'

interface Props {
  skillId: string
  blocks: Block[]
}

interface BlockDef {
  type: BlockType
  label: string
  color: string
  onlyOne?: boolean
}

const BLOCK_DEFS: BlockDef[] = [
  { type: 'purpose', label: 'Purpose', color: 'text-purple-300 hover:bg-purple-900/30 border-purple-500/30', onlyOne: true },
  { type: 'rule', label: 'Rule', color: 'text-green-300 hover:bg-green-900/30 border-green-500/30' },
  { type: 'example', label: 'Example', color: 'text-cyan-300 hover:bg-cyan-900/30 border-cyan-500/30' },
  { type: 'warning', label: 'Warning', color: 'text-red-300 hover:bg-red-900/30 border-red-500/30' },
  { type: 'note', label: 'Note', color: 'text-neutral-300 hover:bg-neutral-700/30 border-neutral-500/30' },
  { type: 'command_template', label: 'Command', color: 'text-orange-300 hover:bg-orange-900/30 border-orange-500/30', onlyOne: true },
  { type: 'workflow', label: 'Workflow', color: 'text-blue-300 hover:bg-blue-900/30 border-blue-500/30', onlyOne: true },
  { type: 'raw', label: 'Raw', color: 'text-neutral-400 hover:bg-neutral-800/40 border-neutral-600/30' },
]

export default function BlockToolbar({ skillId, blocks }: Props): React.ReactElement {
  const { addBlock } = useSkillEditorStore()

  return (
    <div className="flex items-center gap-1 flex-wrap px-1 py-1.5 border-b border-white/8 flex-shrink-0">
      <span className="text-[10px] text-white/30 mr-1 select-none">+ Add:</span>
      {BLOCK_DEFS.map(def => {
        const alreadyExists = def.onlyOne && blocks.some(b => b.type === def.type)
        return (
          <button
            key={def.type}
            onClick={() => !alreadyExists && addBlock(skillId, def.type)}
            disabled={alreadyExists}
            title={alreadyExists ? `Only one ${def.label} block allowed` : `Add ${def.label} block`}
            className={`px-2 py-0.5 rounded border text-[10px] font-medium transition-colors ${
              alreadyExists
                ? 'opacity-30 cursor-not-allowed text-white/30 border-white/10'
                : `cursor-pointer ${def.color} border`
            }`}
          >
            {def.label}
          </button>
        )
      })}
    </div>
  )
}
