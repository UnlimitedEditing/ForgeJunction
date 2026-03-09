import React, { useEffect, useState } from 'react'
import { useRenderQueueStore } from '@/stores/renderQueue'

export default function StatusBar(): React.ReactElement {
  const { queue, totalRendersThisSession, cancelActive } = useRenderQueueStore()

  const activeRender = queue.find((r) => r.status === 'active' || r.status === 'streaming') ?? null
  const queuedCount = queue.filter((r) => r.status === 'queued').length
  const lastFinished = [...queue].reverse().find((r) => r.status === 'done' || r.status === 'error') ?? null
  const lastFailed = lastFinished?.status === 'error'

  const [elapsedSec, setElapsedSec] = useState(0)

  useEffect(() => {
    if (!activeRender?.startedAt) {
      setElapsedSec(0)
      return
    }
    const start = activeRender.startedAt
    setElapsedSec(Math.floor((Date.now() - start) / 1000))
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [activeRender?.id, activeRender?.startedAt])

  const isConnected = !lastFailed || !!activeRender

  return (
    <div className="fixed bottom-0 left-0 right-0 h-7 bg-neutral-900 border-t border-neutral-800 flex items-center px-3 font-mono text-xs z-50 gap-4 select-none">
      {/* Left */}
      <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
        {queuedCount > 0 ? (
          <span className="shrink-0 text-white/60">🔄 {queuedCount} in queue</span>
        ) : (
          <span className="shrink-0 text-white/30">✓ Ready</span>
        )}
        {activeRender && (
          <span className="text-white/60 truncate">
            Rendering:{' '}
            <span className="text-white/80 font-mono">{activeRender.workflowSlug}</span>
            {' '}— {elapsedSec}s elapsed
            {activeRender.eta ? ` (ETA ~${activeRender.eta}s)` : ''}
          </span>
        )}
      </div>

      {/* Center — progress bar */}
      <div className="w-40 flex-shrink-0">
        {activeRender ? (
          <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="fill-progress h-full rounded-full bg-brand transition-all duration-300"
              style={{ width: `${activeRender.progress}%` }}
            />
          </div>
        ) : null}
      </div>

      {/* Cancel active render */}
      {activeRender && (
        <button
          onClick={cancelActive}
          className="flex-shrink-0 rounded px-2 py-0.5 text-xs text-white/50 hover:bg-red-900/40 hover:text-red-400 transition-colors"
          title="Cancel current render"
        >
          ✕ Cancel
        </button>
      )}

      {/* Right */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {totalRendersThisSession > 0 && (
          <span className="text-white/30">
            {totalRendersThisSession} render{totalRendersThisSession !== 1 ? 's' : ''}
          </span>
        )}
        {lastFailed && !activeRender && (
          <span className="text-amber-400">⚠ Last render failed</span>
        )}
        <span
          className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
        />
      </div>
    </div>
  )
}
