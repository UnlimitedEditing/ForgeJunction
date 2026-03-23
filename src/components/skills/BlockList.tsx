import React from 'react'
import type { Block } from '@/stores/skillEditor'
import BlockWrapper from './blocks/BlockWrapper'
import PurposeBlock from './blocks/PurposeBlock'
import WorkflowBlock from './blocks/WorkflowBlock'
import RuleBlock from './blocks/RuleBlock'
import CommandTemplateBlock from './blocks/CommandTemplateBlock'
import ExampleBlock from './blocks/ExampleBlock'
import WarningBlock from './blocks/WarningBlock'
import NoteBlock from './blocks/NoteBlock'
import RawBlock from './blocks/RawBlock'

interface Props {
  skillId: string
  blocks: Block[]
  readOnly?: boolean
}

function renderBlockContent(block: Block, skillId: string, readOnly?: boolean): React.ReactElement | null {
  switch (block.type) {
    case 'purpose':
      return <PurposeBlock block={block} skillId={skillId} readOnly={readOnly} />
    case 'workflow':
      return <WorkflowBlock block={block} skillId={skillId} readOnly={readOnly} />
    case 'rule':
      return <RuleBlock block={block} skillId={skillId} readOnly={readOnly} />
    case 'command_template':
      return <CommandTemplateBlock block={block} skillId={skillId} readOnly={readOnly} />
    case 'example':
      return <ExampleBlock block={block} skillId={skillId} readOnly={readOnly} />
    case 'warning':
      return <WarningBlock block={block} skillId={skillId} readOnly={readOnly} />
    case 'note':
      return <NoteBlock block={block} skillId={skillId} readOnly={readOnly} />
    case 'raw':
      return <RawBlock block={block} skillId={skillId} readOnly={readOnly} />
    default:
      return null
  }
}

export default function BlockList({ skillId, blocks, readOnly }: Props): React.ReactElement {
  const sorted = [...blocks].sort((a, b) => a.order - b.order)

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-white/30 select-none">
        <span className="text-2xl mb-2">◻</span>
        <p className="text-sm">No blocks yet</p>
        <p className="text-xs mt-1">Use the toolbar above to add your first block</p>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {sorted.map((block, idx) => {
        const content = renderBlockContent(block, skillId, readOnly)
        if (!content) return null
        return (
          <BlockWrapper
            key={block.id}
            block={block}
            skillId={skillId}
            isFirst={idx === 0}
            isLast={idx === sorted.length - 1}
            readOnly={readOnly}
          >
            {content}
          </BlockWrapper>
        )
      })}
    </div>
  )
}
