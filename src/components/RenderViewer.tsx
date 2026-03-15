import React, { useRef, useEffect, useState } from 'react'
import { useRenderQueueStore, type QueuedRender } from '@/stores/renderQueue'
import { useSourceMediaStore, type MediaSlotValue } from '@/stores/sourceMedia'
import { useWorkflowStore } from '@/stores/workflows'
import { getWorkflowInputSlots } from '@/utils/workflowInputs'
import { getErrorHelp } from '@/utils/workflowKnowledge'

function normalizeMediaType(type: string): 'image' | 'video' | 'audio' {
  if (type === 'video') return 'video'
  if (type === 'audio') return 'audio'
  return 'image'
}

function CancelButton(): React.ReactElement {
  const { cancelActive } = useRenderQueueStore()
  return (
    <button
      onClick={cancelActive}
      className="rounded px-2.5 py-1 text-xs text-white/50 hover:bg-red-900/40 hover:text-red-400 transition-colors"
      title="Cancel this render"
    >
      ✕ Cancel
    </button>
  )
}

function detectMediaKind(url: string, hint: string | null): 'image' | 'video' | 'audio' {
  if (hint === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video'
  if (hint === 'audio' || /\.(mp3|wav|ogg|flac)(\?|$)/i.test(url)) return 'audio'
  return 'image'
}

function formatTime(ms: number): string {
  return ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 60000).toFixed(1)}m`
}

function formatTs(ts: number, startedAt: number): string {
  return `+${((ts - startedAt) / 1000).toFixed(1)}s`
}

function MediaPreview({
  url,
  mediaTypeHint,
  thumbnailUrl,
}: {
  url: string
  mediaTypeHint: string | null
  thumbnailUrl: string | null
}): React.ReactElement {
  const kind = detectMediaKind(url, mediaTypeHint)

  if (kind === 'video') {
    return (
      <div className="flex flex-col gap-2">
        <video src={url} controls autoPlay loop className="w-full max-w-full rounded" />
        {thumbnailUrl && (
          <img src={thumbnailUrl} alt="Thumbnail" className="w-24 rounded opacity-60" />
        )}
      </div>
    )
  }

  if (kind === 'audio') {
    return (
      <div className="flex flex-col gap-2">
        <audio src={url} controls className="w-full" />
        {thumbnailUrl && (
          <img src={thumbnailUrl} alt="Thumbnail" className="w-full max-w-full rounded" />
        )}
      </div>
    )
  }

  return <img src={url} alt="Render output" className="w-full max-w-full rounded" />
}

function UseAsSourceButton({ url, mediaType }: { url: string; mediaType: string | null }): React.ReactElement {
  const { setFromRender, setPendingSource } = useSourceMediaStore()
  const { selectedWorkflow } = useWorkflowStore()
  const [confirmed, setConfirmed] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  const inputSlots = selectedWorkflow ? getWorkflowInputSlots(selectedWorkflow) : []
  const primarySlot = inputSlots.find((s) => s.type === 'primary') ?? null
  const secondarySlots = inputSlots.filter((s) => s.type === 'secondary')

  function confirmSet() {
    setConfirmed(true)
    setTimeout(() => setConfirmed(false), 2000)
  }

  function handleClick() {
    if (!selectedWorkflow) {
      // No workflow — store as pending source
      const mt = normalizeMediaType(mediaType ?? 'image')
      const fileName = url.split('/').pop()?.split('?')[0] ?? 'render-output'
      const pending: MediaSlotValue = {
        url, fileName, mediaType: mt,
        thumbnailUrl: mt === 'image' ? url : null,
        source: 'render',
      }
      setPendingSource(pending)
      confirmSet()
      return
    }
    if (secondarySlots.length > 0) {
      setShowPicker(true)
      return
    }
    // Single-slot workflow — set primary directly
    setFromRender(url, mediaType ?? 'image')
    confirmSet()
  }

  function pickSlot(fieldName: string) {
    setFromRender(url, mediaType ?? 'image', fieldName)
    setShowPicker(false)
    confirmSet()
  }

  if (showPicker) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-white/40">Set as:</p>
        <div className="flex gap-2 flex-wrap">
          {primarySlot && (
            <button
              onClick={() => pickSlot(primarySlot.fieldName)}
              className="rounded bg-neutral-700 px-3 py-1.5 text-xs text-white/70 hover:bg-neutral-600 hover:text-white transition-colors"
            >
              {primarySlot.label}
            </button>
          )}
          {secondarySlots.map((slot) => (
            <button
              key={slot.fieldName}
              onClick={() => pickSlot(slot.fieldName)}
              className="rounded bg-neutral-700 px-3 py-1.5 text-xs text-white/70 hover:bg-neutral-600 hover:text-white transition-colors"
            >
              {slot.label}
            </button>
          ))}
          <button
            onClick={() => setShowPicker(false)}
            className="rounded px-2 py-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={handleClick}
      className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
        confirmed
          ? 'bg-green-700/30 text-green-400'
          : 'bg-neutral-700 text-white/60 hover:bg-neutral-600 hover:text-white'
      }`}
    >
      {confirmed
        ? (selectedWorkflow ? '✓ Set as source' : '✓ Stored — select workflow')
        : '📌 Use as Render Source'}
    </button>
  )
}

function RenderCard({ render }: { render: QueuedRender }): React.ReactElement {
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [render.serverLog.length])

  const elapsedMs =
    render.completedAt && render.startedAt
      ? render.completedAt - render.startedAt
      : render.startedAt
        ? Date.now() - render.startedAt
        : null

  const help = render.error ? getErrorHelp(render.error) : null

  return (
    <div className="flex flex-col gap-3">
      {/* Progress bar for active/streaming */}
      {(render.status === 'active' || render.status === 'streaming') && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm text-white/60">
            <span>Rendering <span className="text-white/40 font-mono text-xs">{render.workflowSlug}</span></span>
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">{render.progress}%</span>
              <CancelButton />
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="fill-progress h-full rounded-full bg-brand transition-all duration-300"
              style={{ width: `${render.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {render.status === 'error' && (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-4 flex flex-col gap-2">
          <p className="text-sm text-red-400">{render.error ?? 'An unknown error occurred.'}</p>
          {help && (
            <div className="border-t border-red-500/20 pt-2 flex flex-col gap-1">
              <p className="text-xs text-white/50">
                <span className="text-white/30">Cause:</span> {help.cause}
              </p>
              <p className="text-xs text-white/50">
                <span className="text-white/30">Fix:</span> {help.fix}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Media result */}
      {render.status === 'done' && render.resultUrl && (
        <div className="flex flex-col gap-2">
          <MediaPreview
            url={render.resultUrl}
            mediaTypeHint={render.mediaType}
            thumbnailUrl={render.thumbnailUrl}
          />
          <a
            href={render.resultUrl}
            target="_blank"
            rel="noreferrer"
            className="truncate text-xs text-brand hover:underline"
          >
            {render.resultUrl}
          </a>
          <UseAsSourceButton url={render.resultUrl} mediaType={render.mediaType} />
        </div>
      )}

      {render.status === 'done' && !render.resultUrl && (
        <div className="rounded border border-white/10 p-4">
          <p className="text-sm text-white/50">Render complete — no media URL returned.</p>
        </div>
      )}

      {/* Metadata */}
      {(render.renderHash || elapsedMs !== null) && (
        <div className="flex flex-col gap-1 rounded bg-white/5 px-3 py-2 text-xs text-white/50">
          {render.renderHash && (
            <div className="flex gap-2">
              <span className="text-white/30">Hash</span>
              <span className="font-mono">{render.renderHash}</span>
            </div>
          )}
          {elapsedMs !== null && (
            <div className="flex gap-2">
              <span className="text-white/30">Time</span>
              <span>{formatTime(elapsedMs)}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="text-white/30">Workflow</span>
            <span className="font-mono">{render.workflowSlug}</span>
          </div>
        </div>
      )}

      {/* Server log */}
      {render.serverLog.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="themed-heading text-xs font-semibold uppercase tracking-widest text-white/30">
            Server Log
          </p>
          <div className="max-h-40 overflow-y-auto rounded bg-black/40 p-2 font-mono text-xs">
            {render.serverLog.map((entry, i) => (
              <div key={i} className="flex gap-2 leading-5">
                <span className="shrink-0 text-white/20">
                  {render.startedAt ? formatTs(entry.timestamp, render.startedAt) : ''}
                </span>
                <span
                  className={
                    entry.type === 'done'
                      ? 'text-green-400'
                      : entry.type === 'error'
                        ? 'text-red-400'
                        : 'text-white/70'
                  }
                >
                  {entry.data}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  )
}

function statusBadge(render: QueuedRender): React.ReactElement {
  switch (render.status) {
    case 'queued':
      return <span className="text-white/30 text-xs">Queued</span>
    case 'active':
    case 'streaming':
      return <span className="text-brand text-xs font-medium">{render.progress}%</span>
    case 'done':
      return <span className="text-green-400 text-xs">Done</span>
    case 'error':
      return <span className="text-red-400 text-xs">Failed</span>
  }
}

function CollapsedCard({ render }: { render: QueuedRender }): React.ReactElement {
  const elapsedMs =
    render.completedAt && render.startedAt
      ? render.completedAt - render.startedAt
      : null

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {/* Thumbnail / placeholder */}
      {render.resultUrl && render.status === 'done' ? (
        <img
          src={render.thumbnailUrl ?? render.resultUrl}
          alt=""
          className="h-10 w-10 rounded object-cover shrink-0 bg-white/5"
        />
      ) : (
        <div className="h-10 w-10 rounded bg-white/5 shrink-0 flex items-center justify-center">
          {(render.status === 'active' || render.status === 'streaming') && (
            <div className="h-2 w-2 rounded-full bg-brand animate-pulse" />
          )}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white/70 text-xs font-mono truncate">{render.workflowSlug}</span>
          {statusBadge(render)}
        </div>
        {elapsedMs !== null && (
          <div className="text-white/30 text-xs mt-0.5">{formatTime(elapsedMs)}</div>
        )}
        {(render.status === 'active' || render.status === 'streaming') && (
          <div className="mt-1 h-0.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand transition-all duration-300"
              style={{ width: `${render.progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function RenderViewer(): React.ReactElement {
  const { queue, selectedRenderId, setSelectedRender, getSelectedRender } = useRenderQueueStore()
  const { setPendingSource, setFromRender } = useSourceMediaStore()
  const { workflows } = useWorkflowStore()

  const selectedRender = getSelectedRender()
  const autoSetPendingRef = useRef<string | null>(null)
  const [pendingNotice, setPendingNotice] = useState(false)

  // Newest first
  const allRenders = [...queue].reverse()

  // Pending source: set when in-progress render is selected; auto-resolve when it completes
  useEffect(() => {
    if (!selectedRender) {
      setPendingNotice(false)
      return
    }

    const { id, status, workflowSlug, resultUrl, mediaType } = selectedRender
    const isInProgress = status === 'queued' || status === 'active' || status === 'streaming'

    if (isInProgress && autoSetPendingRef.current !== id) {
      autoSetPendingRef.current = id
      const workflow = workflows.find((w) => w.slug === workflowSlug)
      const mt: 'image' | 'video' | 'audio' = workflow?.supports_txt2vid
        ? 'video'
        : workflow?.supports_txt2wav
          ? 'audio'
          : 'image'
      setPendingSource({ url: `pending:${id}`, fileName: 'pending-render', mediaType: mt, thumbnailUrl: null, source: 'render' })
      setPendingNotice(true)
      return
    }

    if (status === 'done' && resultUrl && autoSetPendingRef.current === id) {
      autoSetPendingRef.current = null
      setPendingNotice(false)
      setFromRender(resultUrl, mediaType ?? 'image')
      return
    }

    // Error or done with no URL — clear pending
    if ((status === 'error' || status === 'done') && autoSetPendingRef.current === id) {
      autoSetPendingRef.current = null
      setPendingNotice(false)
    }
  }, [selectedRender?.id, selectedRender?.status, selectedRender?.resultUrl])

  // Clear pending tracking on deselect
  useEffect(() => {
    if (!selectedRenderId) {
      autoSetPendingRef.current = null
      setPendingNotice(false)
    }
  }, [selectedRenderId])

  if (allRenders.length === 0) {
    return (
      <div className="flex min-h-[160px] items-center justify-center rounded border border-dashed border-white/10">
        <p className="text-sm text-white/30">Select a workflow and submit a prompt</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {allRenders.map((render) => {
        const isSelected = render.id === selectedRenderId
        return (
          <div
            key={render.id}
            className={`rounded-lg border transition-colors ${
              isSelected
                ? 'border-brand/50 ring-1 ring-brand/20'
                : 'border-white/10 hover:border-white/20'
            }`}
          >
            {/* Card header — always visible, click to toggle */}
            <div
              className="cursor-pointer"
              onClick={() => setSelectedRender(isSelected ? null : render.id)}
            >
              <CollapsedCard render={render} />
            </div>

            {/* Expanded body */}
            {isSelected && (
              <div
                className="border-t border-white/10 px-3 pb-3 pt-2 flex flex-col gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <RenderCard render={render} />
                {pendingNotice && (
                  <p className="text-xs text-white/40">⏳ Queued as source — workflow list filtered</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
