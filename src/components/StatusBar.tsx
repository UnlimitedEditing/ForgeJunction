import React, { useEffect, useRef, useState } from 'react'
import SkillStar from '@/components/icons/SkillStar'
import { useRenderQueueStore } from '@/stores/renderQueue'
import { useChainGraphStore, findComponents } from '@/stores/chainGraph'
import WorkflowGalleryPopup from '@/components/WorkflowGalleryPopup'
import InspirationFeed from '@/components/InspirationFeed'

export default function StatusBar(): React.ReactElement {
  const { queue, maxConcurrent, totalRendersThisSession, cancelById } = useRenderQueueStore()
  const { nodes: chainNodes, edges: chainEdges, isRunning: chainRunning, runStartTime } = useChainGraphStore()

  const chainCount = React.useMemo(() => {
    if (chainNodes.length === 0) return 0
    return findComponents(chainNodes, chainEdges).length
  }, [chainNodes, chainEdges])
  const chainDone  = chainNodes.filter(n => n.status === 'done' || n.status === 'error').length
  const chainTotal = chainNodes.length

  const activeRenders = queue.filter((r) => r.status === 'active' || r.status === 'streaming')
  const activeCount = activeRenders.length
  const firstActive = activeRenders[0] ?? null
  const queuedCount = queue.filter((r) => r.status === 'queued').length
  const lastFinished = [...queue].reverse().find((r) => r.status === 'done' || r.status === 'error') ?? null
  const lastFailed = lastFinished?.status === 'error'

  const [elapsedSec, setElapsedSec] = useState(0)
  const [popupOpen, setPopupOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [inspirationOpen, setInspirationOpen] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!firstActive?.startedAt) {
      setElapsedSec(0)
      return
    }
    const start = firstActive.startedAt
    setElapsedSec(Math.floor((Date.now() - start) / 1000))
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [firstActive?.id, firstActive?.startedAt])

  // Close popup when all renders finish
  useEffect(() => {
    if (activeCount === 0) setPopupOpen(false)
  }, [activeCount])

  // Close popup on outside click
  useEffect(() => {
    if (!popupOpen) return
    function onDown(e: MouseEvent) {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setPopupOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [popupOpen])

  const isConnected = !lastFailed || activeCount > 0

  return (
    <>
      <WorkflowGalleryPopup open={galleryOpen} onClose={() => setGalleryOpen(false)} />
      {inspirationOpen && <InspirationFeed onClose={() => setInspirationOpen(false)} />}

    <div className="fixed bottom-0 left-0 right-0 h-7 bg-neutral-900 border-t border-neutral-800 flex items-center px-3 font-mono text-xs z-50 gap-4 select-none">
      {/* Left — inspiration + gallery toggles + render status */}
      <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
        <button
          onClick={() => setInspirationOpen((v) => !v)}
          className={`flex-shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
            inspirationOpen
              ? 'text-brand bg-brand/10'
              : 'text-white/70 hover:text-white/70 hover:bg-white/5'
          }`}
          title="Inspiration feed"
        >
          <SkillStar size={11} className="inline-block align-middle mr-0.5" /> Inspiration
        </button>
        <button
          onClick={() => setGalleryOpen((v) => !v)}
          className={`flex-shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
            galleryOpen
              ? 'text-brand bg-brand/10'
              : 'text-white/70 hover:text-white/70 hover:bg-white/5'
          }`}
          title="Workflow gallery"
        >
          ◫ Find More Workflows
        </button>
        {chainRunning && (
          <span className="shrink-0 text-brand/70">
            ⛓ Chain {chainDone}/{chainTotal} · {chainCount} chain{chainCount !== 1 ? 's' : ''}
          </span>
        )}
        {activeCount === 0 && queuedCount === 0 && !chainRunning ? (
          <span className="shrink-0 text-white/60">✓ Ready</span>
        ) : !chainRunning && (
          <>
            {activeCount > 0 && (
              <span className="shrink-0 text-white/82">
                🔄 {activeCount} rendering
              </span>
            )}
            {queuedCount > 0 && (
              <span className="shrink-0 text-white/70">
                {queuedCount} queued
              </span>
            )}
          </>
        )}
        {chainRunning && activeCount === 0 && queuedCount === 0 && (
          <span className="shrink-0 text-white/60">chain rendering…</span>
        )}
        {firstActive && (
          <span className="text-white/75 truncate">
            <span className="text-white/70 font-mono">{firstActive.workflowSlug}</span>
            {activeCount > 1 && <span className="text-white/60"> +{activeCount - 1} more</span>}
            {' '}— {elapsedSec}s
            {firstActive.eta ? ` (ETA ~${firstActive.eta}s)` : ''}
          </span>
        )}
      </div>

      {/* Center — progress bar of first active render */}
      <div className="w-40 flex-shrink-0">
        {firstActive ? (
          <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="fill-progress h-full rounded-full bg-brand transition-all duration-300"
              style={{ width: `${firstActive.progress}%` }}
            />
          </div>
        ) : null}
      </div>

      {/* Cancel popup trigger */}
      {activeCount > 0 && (
        <div className="relative flex-shrink-0">
          <button
            ref={buttonRef}
            onClick={() => setPopupOpen((v) => !v)}
            className="rounded px-2 py-0.5 text-xs text-white/75 hover:bg-red-900/40 hover:text-red-400 transition-colors"
          >
            ✕ Cancel
          </button>

          {popupOpen && (
            <div
              ref={popupRef}
              className="absolute bottom-8 right-0 w-72 bg-neutral-800 border border-neutral-700 rounded-md shadow-xl overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-neutral-700 text-white/70 text-xs uppercase tracking-wider">
                Active Renders
              </div>
              <ul>
                {activeRenders.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-700/50 border-b border-neutral-700/50 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-white/80 truncate">{r.workflowSlug}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="h-1 w-24 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand transition-all duration-300"
                            style={{ width: `${r.progress}%` }}
                          />
                        </div>
                        <span className="text-white/60">{r.progress}%</span>
                      </div>
                    </div>
                    <button
                      onClick={() => cancelById(r.id)}
                      className="flex-shrink-0 rounded p-1 text-white/60 hover:bg-red-900/40 hover:text-red-400 transition-colors"
                      title={`Cancel ${r.workflowSlug}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Right */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {activeCount > 0 && (
          <span className="text-white/75">
            {activeCount}/{maxConcurrent} in flight
          </span>
        )}
        {totalRendersThisSession > 0 && (
          <span className="text-white/60">
            {totalRendersThisSession} total
          </span>
        )}
        {lastFailed && activeCount === 0 && (
          <span className="text-amber-400">⚠ Last render failed</span>
        )}
        <span
          className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
        />
      </div>
    </div>
    </>
  )
}
