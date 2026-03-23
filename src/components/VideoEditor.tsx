import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useRenderQueueStore } from '@/stores/renderQueue'
import { useProjectsStore } from '@/stores/projects'
import { useSettingsStore } from '@/stores/settings'
import { useTagsStore } from '@/stores/tags'
import { useVideoEditorStore } from '@/stores/videoEditor'

// In dev, use VITE_EDITOR_URL or run `npx http-server x -p 3000` in alt-editor/omniclip-main.
// In production, the Electron main process starts the bundled static server on a
// random free port and exposes it via IPC.
const DEV_URL = (import.meta.env.VITE_EDITOR_URL as string | undefined) ?? 'http://localhost:3000'

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
    e.dataTransfer.setData('application/x-asset-id', item.id)
    e.dataTransfer.setData(`application/x-asset-type-${item.type}`, '')
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
      <div className="w-10 h-10 rounded overflow-hidden bg-neutral-800 flex-shrink-0 flex items-center justify-center text-white/45 text-xs">
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
        <p className="text-[9px] text-white/50 font-mono truncate leading-tight">{item.name}</p>
      </div>

      {/* Add button */}
      <button
        onClick={handleAdd}
        className="text-white/45 hover:text-brand text-xs flex-shrink-0 transition-colors px-1"
        title="Add to editor timeline"
      >
        +
      </button>
    </div>
  )
}

// ── VideoEditor ───────────────────────────────────────────────────────────────

export default function VideoEditor({ onClose, onReady }: { onClose: () => void; onReady?: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [search, setSearch] = useState('')
  const [iframeReady, setIframeReady] = useState(false)
  const binItemsRef = useRef<FjAsset[]>([])
  const [editorUrl, setEditorUrl] = useState(DEV_URL)

  // In production, request the URL from the Electron main process (which started
  // the bundled Nitro server on a random free port).
  useEffect(() => {
    const api = (window as unknown as { electron?: { editor?: { getUrl?: () => Promise<string> } } }).electron
    if (api?.editor?.getUrl) {
      api.editor.getUrl().then((url) => { if (url) setEditorUrl(url) }).catch(() => {})
    }
  }, [])

  const queue = useRenderQueueStore(s => s.queue)
  const activeProject = useProjectsStore(s => s.getActiveProject())
  const hideNsfw = useSettingsStore(s => s.hideNsfw)
  const tags = useTagsStore(s => s.tags)
  const getTagItems = useTagsStore(s => s.getTagItems)

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

  // Build and post tag data to the editor's Project panel
  const syncTags = useCallback((items: FjAsset[]) => {
    const tagAssets: Record<string, FjAsset[]> = {}
    for (const tag of tags) {
      const assignments = getTagItems(tag.id)
      tagAssets[tag.id] = assignments
        .map(a => items.find(b => b.id === a.tileId))
        .filter((b): b is FjAsset => !!b)
    }
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'fj:sync-tags', tags, tagAssets },
      '*',
    )
  }, [tags, getTagItems, iframeRef])

  // Post all current bin items to the editor iframe
  const syncLibrary = useCallback((items: FjAsset[]) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'fj:sync-library', assets: items },
      '*',
    )
  }, [])

  // When iframe finishes loading, push the full library + tags and signal ready.
  // We call onReady here (not just on fj:bridge-ready) because when the iframe
  // is preloaded in a hidden div, Chromium may suppress the coi-serviceworker
  // reload and the postMessage never arrives while the frame is display:none.
  const handleIframeLoad = useCallback(() => {
    setIframeReady(true)
    syncLibrary(binItemsRef.current)
    syncTags(binItemsRef.current)
    onReady?.()
  }, [syncLibrary, syncTags, onReady])

  // Listen for fj:bridge-ready — fires when Omniclip's bridge mounts
  // (which happens after the iframe onLoad event, so we re-sync here)
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.source === iframeRef.current?.contentWindow && e.data?.type === 'fj:bridge-ready') {
        syncLibrary(binItemsRef.current)
        syncTags(binItemsRef.current)
        onReady?.()
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [syncLibrary, syncTags, onReady])

  // Re-sync whenever the library changes (new renders complete or project changes)
  useEffect(() => {
    if (iframeReady) syncLibrary(binItems)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeReady, binItems.length])

  // When assets are queued for editor, open a new project with them on the timeline
  const pendingEditorAssets = useVideoEditorStore(s => s.pendingEditorAssets)
  const clearPendingEditorAssets = useVideoEditorStore(s => s.clearPendingEditorAssets)
  useEffect(() => {
    if (!pendingEditorAssets || pendingEditorAssets.length === 0 || !iframeReady) return
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'fj:open-project-with-assets', assets: pendingEditorAssets },
      '*',
    )
    clearPendingEditorAssets()
  }, [pendingEditorAssets, iframeReady, clearPendingEditorAssets])

  // Re-sync tags whenever tags or bin changes
  useEffect(() => {
    if (iframeReady) syncTags(binItems)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeReady, tags, binItems.length])

  return (
    <div className="flex flex-col flex-1 bg-neutral-900 text-white min-w-0">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-neutral-950 flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-white/75 hover:text-white transition-colors text-xs font-medium"
          title="Return to main view"
        >
          <span className="text-base leading-none">⌂</span>
          <span>Home</span>
        </button>
        <span className="text-white/30 text-xs">·</span>
        <span className="text-white/82 text-sm font-semibold">✂ Video Editor</span>
        {activeProject && (
          <span className="text-[10px] text-emerald-400/60 font-mono">{activeProject.name}</span>
        )}
        <div className="flex-1" />
        <span className="text-[10px] text-white/45 select-none">Omniclip</span>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {/* FJ Media Bin */}
        <aside className="w-52 flex-shrink-0 flex flex-col border-r border-white/10 bg-neutral-950/60 min-h-0">
          {/* Bin header + search */}
          <div className="px-2 pt-2 pb-1.5 border-b border-white/8 flex-shrink-0">
            <p className="text-[9px] uppercase tracking-widest text-white/50 font-semibold mb-1.5">
              FJ Media Bin
              {activeProject && (
                <span className="text-emerald-400/40 normal-case ml-1">· {activeProject.name}</span>
              )}
            </p>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/45 text-[11px] pointer-events-none select-none">⌕</span>
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
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/75 text-[10px]"
                >✕</button>
              )}
            </div>
          </div>

          {/* Bin items */}
          <div className="flex-1 overflow-y-auto min-h-0 p-1.5">
            {binItems.length === 0 ? (
              <p className="text-[10px] text-white/45 text-center px-2 py-4 leading-relaxed">
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
            <p className="text-[9px] text-white/30 text-center px-2 py-2 mt-1">
              Drag into timeline · + to add to bin
            </p>
          </div>
        </aside>

        {/* Omniclip iframe */}
        <div className="flex-1 min-w-0 min-h-0 bg-black">
          <iframe
            ref={iframeRef}
            src={editorUrl}
            onLoad={handleIframeLoad}
            className="w-full h-full border-0"
            title="Omniclip Video Editor"
          />
        </div>
      </div>
    </div>
  )
}
