import React, { useState } from 'react'
import { useInspirationStore, type InspirationItem } from '@/stores/telegram'
import { useChainGraphStore } from '@/stores/chainGraph'
import { useWorkflowStore } from '@/stores/workflows'

// ── Chain copy modal ───────────────────────────────────────────────────────────

function ChainCopyModal({
  item,
  onClose,
}: {
  item: InspirationItem
  onClose: () => void
}): React.ReactElement {
  const { addNode } = useChainGraphStore()
  const { workflows } = useWorkflowStore()
  const [selectedSlug, setSelectedSlug] = useState(workflows[0]?.slug ?? '')
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (!selectedSlug) return
    const wf = workflows.find(w => w.slug === selectedSlug)
    if (!wf) return
    const id = addNode(wf.slug, wf.name, { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 })
    useChainGraphStore.getState().updateNode(id, { prompt: item.prompt })
    setCopied(true)
    setTimeout(onClose, 900)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-80 rounded-xl bg-neutral-900 border border-white/10 shadow-2xl p-4 flex flex-col gap-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white/70">Copy to Chain Builder</span>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 text-xs">✕</button>
        </div>

        {item.prompt && (
          <div className="rounded-lg bg-white/5 p-2 max-h-24 overflow-y-auto">
            <p className="text-[10px] text-white/60 leading-relaxed font-mono whitespace-pre-wrap">
              {item.prompt}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-white/40">Workflow</label>
          <select
            value={selectedSlug}
            onChange={e => setSelectedSlug(e.target.value)}
            className="w-full rounded bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white outline-none focus:border-brand/50"
          >
            {workflows.map(w => (
              <option key={w.slug} value={w.slug}>{w.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleCopy}
          disabled={!selectedSlug || copied}
          className="rounded bg-brand/80 hover:bg-brand py-2 text-xs text-white font-medium transition-colors disabled:opacity-50"
        >
          {copied ? '✓ Added to Chain' : '⛓ Add to Chain'}
        </button>
      </div>
    </div>
  )
}

// ── Tile ───────────────────────────────────────────────────────────────────────

function InspirationTile({
  item,
  onCopyChain,
  onRemove,
}: {
  item: InspirationItem
  onCopyChain: (item: InspirationItem) => void
  onRemove: (id: string) => void
}): React.ReactElement {
  return (
    <div className="relative aspect-square rounded-lg overflow-hidden group ring-1 ring-white/10 hover:ring-white/30 transition-all">
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
          <span className="text-white/20 text-2xl">{item.mediaType === 'video' ? '▶' : '🖼'}</span>
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent
        opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col justify-end p-1.5 gap-1">
        {item.prompt && (
          <p className="text-white/85 text-[9px] leading-tight line-clamp-3 font-mono">
            {item.prompt}
          </p>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCopyChain(item)}
            className="flex-1 rounded bg-brand/80 hover:bg-brand px-1.5 py-0.5 text-[9px] text-white font-medium transition-colors text-center"
          >
            ⛓ Chain
          </button>
          <button
            onClick={() => onRemove(item.id)}
            className="rounded bg-white/10 hover:bg-red-900/40 hover:text-red-400 px-1.5 py-0.5 text-[9px] text-white/40 transition-colors"
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function InspirationFeed({ onClose }: { onClose: () => void }): React.ReactElement {
  const { items, importItems, removeItem, clearAll } = useInspirationStore()
  const [chainTarget, setChainTarget] = useState<InspirationItem | null>(null)
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? items.filter(i => i.prompt.toLowerCase().includes(search.trim().toLowerCase()))
    : items

  return (
    <>
      {chainTarget && (
        <ChainCopyModal item={chainTarget} onClose={() => setChainTarget(null)} />
      )}

      <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
        <div
          className="w-full max-w-4xl h-[70vh] rounded-t-2xl bg-neutral-950 border-t border-white/10 flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
            <span className="text-sm font-semibold text-white/80">Inspiration</span>
            {items.length > 0 && (
              <span className="text-[10px] text-white/30">{items.length} items</span>
            )}
            <div className="flex-1" />
            {items.length > 0 && (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter by prompt…"
                  className="rounded bg-white/5 px-2 py-1 text-[11px] text-white placeholder-white/20 outline-none focus:bg-white/8 w-44 transition-colors"
                />
                <button
                  onClick={clearAll}
                  className="text-[10px] text-white/25 hover:text-red-400/70 transition-colors"
                >
                  Clear all
                </button>
              </>
            )}
            <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors ml-1">
              ✕
            </button>
          </div>

          {/* Body */}
          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
              <p className="text-white/25 text-sm select-none">No inspiration imported yet</p>
              <p className="text-white/15 text-[11px] leading-relaxed max-w-xs select-none">
                Export your Telegram group history, filter out the media and prompts, then import a JSON file here.
              </p>
              <ImportButton onImport={importItems} />
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-2">
                {filtered.length === 0 && (
                  <p className="text-[11px] text-white/25 text-center py-8">No items match "{search}"</p>
                )}
                <div className="grid grid-cols-5 gap-1.5">
                  {filtered.map(item => (
                    <InspirationTile
                      key={item.id}
                      item={item}
                      onCopyChain={setChainTarget}
                      onRemove={removeItem}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-3 py-2 border-t border-white/8 flex-shrink-0">
                <ImportButton onImport={importItems} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Import button — accepts a JSON file in InspirationItem[] format ────────────

function ImportButton({ onImport }: { onImport: (items: InspirationItem[]) => void }): React.ReactElement {
  const [error, setError] = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        const items: InspirationItem[] = Array.isArray(data) ? data : data.items ?? []
        if (!Array.isArray(items)) throw new Error('Expected an array')
        // Minimal validation
        const valid = items.filter(i => typeof i.id === 'string' && typeof i.prompt === 'string')
        if (valid.length === 0) throw new Error('No valid items found')
        onImport(valid)
        e.target.value = ''
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid file')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[10px] text-red-400">{error}</span>}
      <label className="cursor-pointer rounded bg-white/8 hover:bg-white/12 px-3 py-1.5 text-[11px] text-white/60 transition-colors">
        Import JSON
        <input type="file" accept=".json" className="hidden" onChange={handleFile} />
      </label>
    </div>
  )
}
