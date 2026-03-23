import React from 'react'
import type { Block, RuleBlock, WarningBlock } from '@/stores/skillEditor'
import { useSkillEditorStore } from '@/stores/skillEditor'

interface Props {
  block: Block
  skillId: string
  isFirst: boolean
  isLast: boolean
  children: React.ReactNode
  readOnly?: boolean
}

function blockTypeColor(block: Block): string {
  switch (block.type) {
    case 'purpose':
      return 'border-purple-500/60'
    case 'workflow':
      return 'border-blue-500/60'
    case 'rule': {
      const rb = block as RuleBlock
      if (rb.priority === 'required') return 'border-green-500/60'
      if (rb.priority === 'optional') return 'border-yellow-500/60'
      return 'border-red-500/60'
    }
    case 'command_template':
      return 'border-orange-500/60'
    case 'example':
      return 'border-cyan-500/60'
    case 'warning': {
      const wb = block as WarningBlock
      if (wb.severity === 'critical') return 'border-red-500/60'
      if (wb.severity === 'caution') return 'border-yellow-500/60'
      return 'border-blue-500/60'
    }
    case 'note':
      return 'border-neutral-500/60'
    case 'raw':
      return 'border-neutral-600/60'
    default:
      return 'border-white/20'
  }
}

function blockTypeBadge(block: Block): { label: string; color: string } {
  switch (block.type) {
    case 'purpose':
      return { label: 'PURPOSE', color: 'bg-purple-900/50 text-purple-300' }
    case 'workflow':
      return { label: 'WORKFLOW', color: 'bg-blue-900/50 text-blue-300' }
    case 'rule': {
      const rb = block as RuleBlock
      if (rb.priority === 'required') return { label: 'REQUIRED', color: 'bg-green-900/50 text-green-300' }
      if (rb.priority === 'optional') return { label: 'OPTIONAL', color: 'bg-yellow-900/50 text-yellow-300' }
      return { label: 'NEVER', color: 'bg-red-900/50 text-red-300' }
    }
    case 'command_template':
      return { label: 'COMMAND', color: 'bg-orange-900/50 text-orange-300' }
    case 'example':
      return { label: 'EXAMPLE', color: 'bg-cyan-900/50 text-cyan-300' }
    case 'warning': {
      const wb = block as WarningBlock
      if (wb.severity === 'critical') return { label: 'CRITICAL', color: 'bg-red-900/50 text-red-300' }
      if (wb.severity === 'caution') return { label: 'CAUTION', color: 'bg-yellow-900/50 text-yellow-300' }
      return { label: 'INFO', color: 'bg-blue-900/50 text-blue-300' }
    }
    case 'note':
      return { label: 'NOTE', color: 'bg-neutral-800 text-neutral-400' }
    case 'raw':
      return { label: 'RAW', color: 'bg-neutral-900 text-neutral-500' }
    default:
      return { label: 'BLOCK', color: 'bg-neutral-800 text-neutral-400' }
  }
}

function blockSummary(block: Block): string {
  switch (block.type) {
    case 'purpose':
      return block.content.slice(0, 80) || '(empty)'
    case 'workflow':
      return block.slug ? `/${block.slug} (${block.commandType})` : '(no slug set)'
    case 'rule':
      return block.content.slice(0, 80) || '(empty)'
    case 'command_template':
      return block.template.slice(0, 80) || '(empty template)'
    case 'example':
      return block.userInput.slice(0, 60) || '(empty)'
    case 'warning':
      return block.content.slice(0, 80) || '(empty)'
    case 'note':
      return block.content.slice(0, 80) || '(empty)'
    case 'raw':
      return block.content.slice(0, 80) || '(empty)'
    default:
      return ''
  }
}

function hasContent(block: Block): boolean {
  switch (block.type) {
    case 'purpose': return block.content.trim().length > 0
    case 'workflow': return block.slug.trim().length > 0
    case 'rule': return block.content.trim().length > 0
    case 'command_template': return block.template.trim().length > 0
    case 'example': return block.userInput.trim().length > 0 || block.command.trim().length > 0
    case 'warning': return block.content.trim().length > 0
    case 'note': return block.content.trim().length > 0
    case 'raw': return block.content.trim().length > 0
    default: return false
  }
}

export default function BlockWrapper({ block, skillId, isFirst, isLast, children, readOnly }: Props): React.ReactElement {
  const { moveBlock, deleteBlock, toggleBlockCollapse } = useSkillEditorStore()
  const badge = blockTypeBadge(block)
  const borderColor = blockTypeColor(block)
  const summary = blockSummary(block)

  function handleDelete() {
    if (hasContent(block)) {
      if (!confirm('Delete this block? Its content will be lost.')) return
    }
    deleteBlock(skillId, block.id)
  }

  return (
    <div className={`rounded-lg border-l-2 border border-white/8 bg-neutral-900/60 mb-2 ${borderColor}`}>
      {/* Header row */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/6 select-none">
        {/* Drag-like handle icon */}
        <span className="text-white/25 text-[11px] cursor-grab flex-shrink-0" title="Block">⣿</span>

        {/* Type badge */}
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 tracking-wider ${badge.color}`}>
          {badge.label}
        </span>

        {/* Collapse toggle */}
        <button
          onClick={() => toggleBlockCollapse(skillId, block.id)}
          className="text-[10px] text-white/40 hover:text-white/70 transition-colors flex-shrink-0"
          title={block.collapsed ? 'Expand' : 'Collapse'}
        >
          {block.collapsed ? '▸' : '▾'}
        </button>

        {/* Summary when collapsed */}
        {block.collapsed && (
          <span className="flex-1 min-w-0 text-[11px] text-white/50 truncate">
            {summary}
          </span>
        )}

        {!block.collapsed && <div className="flex-1" />}

        {!readOnly && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={() => moveBlock(skillId, block.id, 'up')}
              className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${
                isFirst ? 'opacity-30 cursor-not-allowed text-white/30' : 'text-white/50 hover:text-white hover:bg-white/8'
              }`}
              disabled={isFirst}
              title="Move up"
            >↑</button>
            <button
              onClick={() => moveBlock(skillId, block.id, 'down')}
              className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${
                isLast ? 'opacity-30 cursor-not-allowed text-white/30' : 'text-white/50 hover:text-white hover:bg-white/8'
              }`}
              disabled={isLast}
              title="Move down"
            >↓</button>
            <button
              onClick={handleDelete}
              className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-white/40 hover:text-red-400 hover:bg-red-950/30 transition-colors"
              title="Delete block"
            >✕</button>
          </div>
        )}
      </div>

      {/* Content */}
      {!block.collapsed && (
        <div className="px-3 py-2.5">
          {children}
        </div>
      )}
    </div>
  )
}
