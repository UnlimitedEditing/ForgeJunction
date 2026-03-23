import React, { useRef, useState, useEffect } from 'react'
import SkillsIcon from '@/components/icons/SkillsIcon'
import { useCanvasStore, type CanvasNode } from '@/stores/canvasStore'
import { useSkillsStore } from '@/stores/skills'
import type { Skill } from '@/api/graydient'

interface Props {
  node: CanvasNode
  isSelected: boolean
  animationClass?: string
  onContextMenu: (e: React.MouseEvent) => void
}

export default function SkillsBrowserNode({ node, isSelected, animationClass = '', onContextMenu }: Props): React.ReactElement {
  const { updateNode, setSelectedNode, moveNodes, addSkillNode, removeNode } = useCanvasStore()
  const { skills, loading, loadSkills } = useSkillsStore()
  const dragState = useRef<{ sx: number; sy: number; startX: number; startY: number } | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => { loadSkills() }, [loadSkills])

  function onHeaderMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    dragState.current = { sx: e.clientX, sy: e.clientY, startX: node.position.x, startY: node.position.y }
    function onMove(ev: MouseEvent) {
      if (!dragState.current) return
      const zoom = useCanvasStore.getState().viewport.zoom
      const dx = (ev.clientX - dragState.current.sx) / zoom
      const dy = (ev.clientY - dragState.current.sy) / zoom
      moveNodes({ [node.id]: { x: dragState.current.startX + dx, y: dragState.current.startY + dy } })
    }
    function onUp() { dragState.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handlePickSkill(skill: Skill) {
    const viewport = useCanvasStore.getState().viewport
    addSkillNode(
      { x: node.position.x + node.size.w + 40, y: node.position.y },
      '',
      skill.slug,
      skill.name,
    )
  }

  const filtered = skills.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div
      data-node={node.id}
      className={`absolute rounded-xl border overflow-hidden ${
        isSelected
          ? 'border-brand/60 shadow-[0_0_0_1px_rgba(108,71,255,0.25),0_4px_32px_rgba(0,0,0,0.6)]'
          : 'border-white/10 shadow-[0_2px_16px_rgba(0,0,0,0.5)]'
      } bg-[#141414] flex flex-col ${animationClass}`}
      style={{ left: node.position.x, top: node.position.y, width: node.size.w, height: node.size.h }}
      onClick={(e) => { e.stopPropagation(); setSelectedNode(node.id) }}
      onContextMenu={onContextMenu}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border-b border-white/8 cursor-grab active:cursor-grabbing flex-shrink-0"
        onMouseDown={onHeaderMouseDown}
      >
        <SkillsIcon size={14} className="text-brand/70 flex-shrink-0" />
        <span className="text-[11px] text-white/70 font-medium select-none tracking-wide flex-1">Skills Browser</span>
        <button
          className="w-5 h-5 flex items-center justify-center rounded text-white/45 hover:text-white/82 text-xs transition-colors"
          onMouseDown={e => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); removeNode(node.id) }}
          title="Close"
        >✕</button>
      </div>

      {/* Search */}
      <div className="flex-shrink-0 px-2 py-2 border-b border-white/5">
        <input
          type="text"
          placeholder="Search skills…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          className="w-full rounded bg-neutral-800 px-2.5 py-1.5 text-xs text-white placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-brand"
        />
      </div>

      {/* Skills list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-20">
            <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-brand animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-4 text-xs text-white/50 text-center">
            {skills.length === 0 ? 'No skills available' : 'No matching skills'}
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5 p-2">
            {filtered.map(skill => (
              <li key={skill.id}>
                <button
                  className="w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors bg-neutral-800/50 hover:bg-brand/10 hover:border-brand/30 border border-transparent group"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); handlePickSkill(skill) }}
                  title={skill.description}
                >
                  <div className="flex items-center gap-2">
                    <SkillsIcon size={10} className="text-brand/60 flex-shrink-0" />
                    <span className="text-white/70 group-hover:text-white font-medium transition-colors truncate">
                      {skill.name}
                    </span>
                  </div>
                  {skill.description && (
                    <p className="text-white/60 text-[10px] leading-snug mt-0.5 line-clamp-2 pl-4">
                      {skill.description}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer hint */}
      <div className="flex-shrink-0 px-3 py-1.5 border-t border-white/5 text-[10px] text-white/30 select-none">
        Click a skill to create a pinned node
      </div>
    </div>
  )
}
