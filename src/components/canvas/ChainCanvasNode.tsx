import React, { useRef, useEffect } from 'react'
import { useCanvasStore, type CanvasNode } from '@/stores/canvasStore'
import { useChainTemplateStore } from '@/stores/chainTemplate'

interface Props {
  node: CanvasNode
  isSelected: boolean
  animationClass?: string
  onContextMenu: (e: React.MouseEvent) => void
}

export default function ChainCanvasNode({ node, isSelected, animationClass = '', onContextMenu }: Props): React.ReactElement {
  const { updateChainFormValue, runChainNode, removeNode, setSelectedNode, moveNodes, updateNode } = useCanvasStore()
  const template = useChainTemplateStore(s => s.templates.find(t => t.id === node.templateId) ?? null)
  const dragState = useRef<{ sx: number; sy: number; startPos: Record<string, { x: number; y: number }>; ids: string[] } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Keep height synced so canvas can lay out edges
  useEffect(() => {
    if (!bodyRef.current) return
    const h = bodyRef.current.offsetHeight
    if (h !== node.size.h) updateNode(node.id, { size: { ...node.size, h } })
  })

  function onHeaderMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    const store = useCanvasStore.getState()
    const inSel = store.selectedNodeIds.includes(node.id)
    if (!inSel) setSelectedNode(node.id)
    const ids = inSel ? store.selectedNodeIds : [node.id]
    const startPos: Record<string, { x: number; y: number }> = {}
    for (const id of ids) {
      const n = store.nodes.find(n2 => n2.id === id)
      if (n) startPos[id] = { ...n.position }
    }
    dragState.current = { sx: e.clientX, sy: e.clientY, startPos, ids }
    function onMove(ev: MouseEvent) {
      if (!dragState.current) return
      const zoom = useCanvasStore.getState().viewport.zoom
      const dx = (ev.clientX - dragState.current.sx) / zoom
      const dy = (ev.clientY - dragState.current.sy) / zoom
      const positions: Record<string, { x: number; y: number }> = {}
      for (const id of dragState.current.ids) {
        const s = dragState.current.startPos[id]
        if (s) positions[id] = { x: s.x + dx, y: s.y + dy }
      }
      moveNodes(positions)
    }
    function onUp() {
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const status = node.chainStatus ?? 'idle'
  const results = node.chainResultUrls ?? []
  const formValues = node.formValues ?? {}

  const statusColor =
    status === 'running' ? 'text-yellow-400' :
    status === 'done'    ? 'text-green-400' :
    status === 'error'   ? 'text-red-400' :
    'text-neutral-500'

  const statusLabel =
    status === 'running' ? 'Running…' :
    status === 'done'    ? 'Done' :
    status === 'error'   ? 'Error' :
    'Idle'

  return (
    <div
      ref={bodyRef}
      data-node
      className={`absolute rounded-xl border shadow-lg select-none flex flex-col overflow-hidden transition-[border-color,box-shadow] ${animationClass} ${
        isSelected
          ? 'border-brand/60 shadow-brand/20'
          : 'border-purple-500/20 shadow-black/40'
      } bg-neutral-900`}
      style={{ left: node.position.x, top: node.position.y, width: node.size.w }}
      onContextMenu={onContextMenu}
      onMouseDown={e => { if (!e.defaultPrevented) setSelectedNode(node.id) }}
    >
      {/* Header / drag handle */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-purple-900/30 border-b border-purple-500/15 cursor-grab active:cursor-grabbing"
        onMouseDown={onHeaderMouseDown}
      >
        <span className="text-xs text-purple-400 select-none">⛓</span>
        <span className="flex-1 text-xs font-semibold text-white/80 truncate">
          {template?.name ?? 'Chain Node'}
        </span>
        <span className={`text-[10px] font-mono flex-shrink-0 ${statusColor}`}>{statusLabel}</span>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); removeNode(node.id) }}
          className="text-neutral-500 hover:text-red-400 transition-colors text-xs leading-none flex-shrink-0"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2 px-3 py-2.5" onMouseDown={e => e.stopPropagation()}>
        {!template ? (
          <p className="text-xs text-red-400">Template not found</p>
        ) : (
          <>
            {/* Form fields */}
            {template.forms.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {template.forms.map(field => (
                  <div key={field.id}>
                    <label className="block text-[10px] text-neutral-500 mb-0.5">{field.label}</label>
                    <input
                      type="text"
                      value={formValues[field.id] ?? ''}
                      onChange={e => updateChainFormValue(node.id, field.id, e.target.value)}
                      placeholder={`{{${field.id}}}`}
                      disabled={status === 'running'}
                      className="w-full rounded bg-neutral-800 border border-white/8 px-2 py-1 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-brand/50 disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-neutral-600 italic">No form fields</p>
            )}

            {/* Chain info */}
            <p className="text-[10px] text-neutral-600">
              {template.nodes.length} step{template.nodes.length !== 1 ? 's' : ''}
              {template.edges.length > 0 ? ` · ${template.edges.length} connection${template.edges.length !== 1 ? 's' : ''}` : ''}
            </p>

            {/* Run button */}
            <button
              onClick={() => runChainNode(node.id)}
              disabled={status === 'running'}
              className="w-full rounded bg-purple-700/70 hover:bg-purple-600 text-white text-xs py-1.5 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'running' ? '⏳ Running…' : '▶ Run Chain'}
            </button>

            {/* Error */}
            {status === 'error' && node.chainError && (
              <p className="text-[10px] text-red-400 break-words" title={node.chainError}>✗ {node.chainError}</p>
            )}

            {/* Results thumbnails */}
            {results.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1 border-t border-white/8">
                <p className="text-[10px] text-neutral-500">{results.length} result{results.length !== 1 ? 's' : ''}</p>
                <div className="flex flex-wrap gap-1">
                  {results.map((r, i) =>
                    r.mediaType?.includes('video') ? (
                      <video
                        key={i}
                        src={r.url}
                        className="w-20 h-20 object-cover rounded border border-white/10 cursor-pointer hover:border-brand/40 transition-colors"
                        muted
                        onClick={() => window.open(r.url, '_blank')}
                      />
                    ) : (
                      <img
                        key={i}
                        src={r.url}
                        alt=""
                        className="w-20 h-20 object-cover rounded border border-white/10 cursor-pointer hover:border-brand/40 transition-colors"
                        onClick={() => window.open(r.url, '_blank')}
                      />
                    )
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
