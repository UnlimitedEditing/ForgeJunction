import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useRenderQueueStore } from '@/stores/renderQueue'
import { useProjectsStore } from '@/stores/projects'
import { useSettingsStore } from '@/stores/settings'

// In dev, use VITE_TOOSCUT_URL or the pnpm dev server.
// In production, the Electron main process starts the bundled Nitro server on a
// random free port and exposes it via IPC.
const DEV_URL = (import.meta.env.VITE_TOOSCUT_URL as string | undefined) ?? 'http://localhost:4200'

// ── Types ────────────────────────────────────────────────────────────────────

interface FjAsset {
  id: string
  url: string
  name: string
  type: 'video' | 'image' | 'audio'
  thumbnailUrl?: string | null
  prompt?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function inferType(mediaType: string | null | undefined): 'video' | 'image' | 'audio' {
  if (mediaType?.startsWith('video')) return 'video'
  if (mediaType?.startsWith('audio')) return 'audio'
  return 'image'
}

// ── BinItem ───────────────────────────────────────────────────────────────────

function BinItem({
  item,
  iframeRef,
  visible,
}: {
  item: FjAsset
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  visible: boolean
}) {
  if (!visible) return null

  const isVideo = item.type === 'video'
  const isAudio = item.type === 'audio'

  const handleDragStart = (e: React.DragEvent) => {
    // Set the asset ID so Tooscut's timeline drop handler can look it up in its store
    e.dataTransfer.setData('application/x-asset-id', item.id)
    e.dataTransfer.setData(`application/x-asset-type-${item.type}`, '')
    // Full asset payload so Tooscut can inject on-drop if not already in store
    e.dataTransfer.setData('application/x-fj-asset', JSON.stringify(item))
    const duration = item.type === 'image' ? 10 : 0
    e.dataTransfer.setData(`application/x-asset-duration-${duration}`, '')
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleAdd = () => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'fj:add-asset', asset: item },
      '*',
    )
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="group flex items-center gap-2 rounded px-1.5 py-1.5 hover:bg-white/5 cursor-grab active:cursor-grabbing select-none"
    >
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded overflow-hidden bg-neutral-800 flex-shrink-0 flex items-center justify-center text-white/20 text-xs">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span>{isVideo ? '▶' : isAudio ? '♪' : '□'}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-white/70 group-hover:text-white/95 truncate leading-tight transition-colors">
          {item.prompt || item.name}
        </p>
        <p className="text-[9px] text-white/25 font-mono truncate leading-tight">{item.name}</p>
      </div>

      {/* Add button */}
      <button
        onClick={handleAdd}
        className="text-white/20 hover:text-brand text-xs flex-shrink-0 transition-colors px-1"
        title="Add to Tooscut asset bin"
      >
        +
      </button>
    </div>
  )
}

// ── TooscutEditor ─────────────────────────────────────────────────────────────

export default function TooscutEditor({ onClose }: { onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [search, setSearch] = useState('')
  const [iframeReady, setIframeReady] = useState(false)
  const binItemsRef = useRef<FjAsset[]>([])
  const [tooscutUrl, setTooscutUrl] = useState(DEV_URL)

  // In production, request the URL from the Electron main process (which started
  // the bundled Nitro server on a random free port).
  useEffect(() => {
    const api = (window as unknown as { electron?: { tooscut?: { getUrl?: () => Promise<string> } } }).electron
    if (api?.tooscut?.getUrl) {
      api.tooscut.getUrl().then((url) => { if (url) setTooscutUrl(url) }).catch(() => {})
    }
  }, [])

  const queue = useRenderQueueStore(s => s.queue)
  const activeProject = useProjectsStore(s => s.getActiveProject())
  const hideNsfw = useSettingsStore(s => s.hideNsfw)

  const searchTerm = search.trim().toLowerCase()

  // Build the bin items from the active project's renders (if set) or all done queue renders.
  // Batch renders (resultUrls.length > 1) are expanded into individual items.
  // Use resultUrl as thumbnail fallback for image renders that don't have a separate thumbnail.
  const binItems: FjAsset[] = activeProject
    ? activeProject.renders
        .filter(r => r.resultUrl)
        .map(r => {
          const type = inferType(r.mediaType)
          return {
            id: r.id,
            url: r.resultUrl,
            name: r.workflowSlug || r.id,
            type,
            thumbnailUrl: r.thumbnailUrl ?? (type === 'image' ? r.resultUrl : null),
            prompt: r.prompt,
          }
        })
    : queue
        .filter(r => r.status === 'done' && r.resultUrl && !(hideNsfw && r.isNsfw))
        .flatMap(r => {
          // resultUrls may be absent on renders created before this field was added
          const urls = r.resultUrls?.length > 1 ? r.resultUrls : null
          if (urls) {
            return urls.map((item, i) => {
              const type = inferType(item.mediaType)
              return {
                id: i === 0 ? r.id : `${r.id}-${i}`,
                url: item.url,
                name: r.workflowSlug || r.id,
                type,
                thumbnailUrl: i === 0
                  ? (r.thumbnailUrl ?? (type === 'image' ? item.url : null))
                  : (type === 'image' ? item.url : null),
                prompt: r.prompt,
              }
            })
          }
          const type = inferType(r.mediaType)
          return [{
            id: r.id,
            url: r.resultUrl!,
            name: r.workflowSlug || r.id,
            type,
            thumbnailUrl: r.thumbnailUrl ?? (type === 'image' ? r.resultUrl! : null),
            prompt: r.prompt,
          }]
        })

  // Keep ref current so the message handler always sees the latest items
  binItemsRef.current = binItems

  // Post all current bin items to Tooscut's iframe
  const syncLibrary = useCallback((items: FjAsset[]) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'fj:sync-library', assets: items },
      '*',
    )
  }, [])

  // When iframe finishes loading, push the full library
  const handleIframeLoad = useCallback(() => {
    setIframeReady(true)
    syncLibrary(binItemsRef.current)
  }, [syncLibrary])

  // Listen for fj:bridge-ready — fires when Tooscut's React bridge mounts
  // (which happens after the iframe onLoad event, so we re-sync here)
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.source === iframeRef.current?.contentWindow && e.data?.type === 'fj:bridge-ready') {
        syncLibrary(binItemsRef.current)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [syncLibrary])

  // Re-sync whenever the library changes (new renders complete or project changes)
  useEffect(() => {
    if (iframeReady) syncLibrary(binItems)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeReady, binItems.length])

  return (
    <div className="flex flex-col flex-1 bg-neutral-900 text-white min-w-0">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-neutral-950 flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors text-xs font-medium"
          title="Return to main view"
        >
          <span className="text-base leading-none">⌂</span>
          <span>Home</span>
        </button>
        <span className="text-white/15 text-xs">·</span>
        <span className="text-white/60 text-sm font-semibold">✂ Video Editor</span>
        {activeProject && (
          <span className="text-[10px] text-emerald-400/60 font-mono">{activeProject.name}</span>
        )}
        <div className="flex-1" />
        <span className="text-[10px] text-white/20 select-none">Tooscut</span>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {/* FJ Media Bin */}
        <aside className="w-52 flex-shrink-0 flex flex-col border-r border-white/10 bg-neutral-950/60 min-h-0">
          {/* Bin header + search */}
          <div className="px-2 pt-2 pb-1.5 border-b border-white/8 flex-shrink-0">
            <p className="text-[9px] uppercase tracking-widest text-white/25 font-semibold mb-1.5">
              FJ Media Bin
              {activeProject && (
                <span className="text-emerald-400/40 normal-case ml-1">· {activeProject.name}</span>
              )}
            </p>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/20 text-[11px] pointer-events-none select-none">⌕</span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full rounded bg-white/5 py-1 text-[11px] text-white placeholder-white/20 outline-none focus:bg-white/8 transition-colors"
                style={{ paddingLeft: '1.4rem', paddingRight: '0.5rem' }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 text-[10px]"
                >✕</button>
              )}
            </div>
          </div>

          {/* Bin items */}
          <div className="flex-1 overflow-y-auto min-h-0 p-1.5">
            {binItems.length === 0 ? (
              <p className="text-[10px] text-white/20 text-center px-2 py-4 leading-relaxed">
                {activeProject ? 'No renders in project yet' : 'No completed renders yet'}
              </p>
            ) : (
              binItems.map(item => (
                <BinItem
                  key={item.id}
                  item={item}
                  iframeRef={iframeRef}
                  visible={
                    !searchTerm ||
                    item.name.toLowerCase().includes(searchTerm) ||
                    (item.prompt?.toLowerCase().includes(searchTerm) ?? false)
                  }
                />
              ))
            )}
            <p className="text-[9px] text-white/15 text-center px-2 py-2 mt-1">
              Drag into timeline · + to add to bin
            </p>
          </div>
        </aside>

        {/* Tooscut iframe */}
        <div className="flex-1 min-w-0 min-h-0 bg-black">
          <iframe
            ref={iframeRef}
            src={tooscutUrl}
            onLoad={handleIframeLoad}
            className="w-full h-full border-0"
            title="Tooscut Video Editor"
          />
        </div>
      </div>
    </div>
  )
}
