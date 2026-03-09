import React, { useRef, useState } from 'react'
import { useSourceMediaStore } from '@/stores/sourceMedia'
import type { MediaInputSlot } from '@/utils/workflowInputs'
import type { Workflow } from '@/api/graydient'

// ── Backward-compat export ────────────────────────────────────────────────────

export function workflowNeedsInput(workflow: Workflow): boolean {
  return (
    workflow.supports_img2img ||
    workflow.supports_img2vid ||
    workflow.supports_vid2vid ||
    workflow.supports_vid2img ||
    workflow.supports_vid2wav ||
    !!(workflow.field_mapping?.some(
      (f) => f.local_field === 'init_image_filename' || /^image\d+$/.test(f.local_field)
    ))
  )
}

// ── Accept metadata ───────────────────────────────────────────────────────────

const ACCEPT_INFO: Record<string, { exts: string; mime: string }> = {
  image: { exts: '.png .jpg .jpeg .webp .gif', mime: 'image/*' },
  video: { exts: '.mp4 .webm .mov', mime: 'video/*' },
  audio: { exts: '.mp3 .wav .ogg', mime: 'audio/*' },
  any:   { exts: '.png .jpg .mp4 .webm .mp3 .wav', mime: 'image/*,video/*,audio/*' },
}

// ── Single slot drop zone ─────────────────────────────────────────────────────

function SlotDropZone({ slot }: { slot: MediaInputSlot }): React.ReactElement {
  const { getSlot, setFromUrl, setFromUpload, clearSlot } = useSourceMediaStore()
  const [isDragging, setIsDragging] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [changing, setChanging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const media = getSlot(slot.fieldName)
  const { exts, mime } = ACCEPT_INFO[slot.acceptsMediaType] ?? ACCEPT_INFO.image

  function handleDragEnter(e: React.DragEvent) { e.preventDefault(); setIsDragging(true) }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); setIsDragging(false) }
  function handleDragOver(e: React.DragEvent) { e.preventDefault() }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const acceptType = slot.acceptsMediaType === 'any' ? null : slot.acceptsMediaType
    if (acceptType && !file.type.startsWith(acceptType + '/')) {
      setDropError(`This slot requires ${acceptType} input`)
      setTimeout(() => setDropError(null), 3000)
      return
    }
    setFromUpload(file, slot.fieldName)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setFromUpload(file, slot.fieldName)
  }

  function handlePasteUrl() {
    const url = urlInput.trim()
    if (!url) return
    setFromUrl(url, slot.fieldName)
    setUrlInput('')
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Slot label + required badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/60 font-medium">{slot.label}</span>
        {slot.required && (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20">
            Required
          </span>
        )}
      </div>

      {/* Help text if distinct from label */}
      {slot.helpText && slot.helpText !== slot.label && (
        <p className="text-xs text-white/30 leading-snug">💡 {slot.helpText}</p>
      )}

      {/* Media loaded state */}
      {media && !changing ? (
        <div className="rounded border border-white/10 bg-neutral-800/50 p-3 flex items-start gap-3">
          <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-black/30 flex items-center justify-center">
            {media.thumbnailUrl && media.mediaType === 'image' ? (
              <img src={media.thumbnailUrl} alt="Source" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xl">
                {media.mediaType === 'video' ? '🎬' : media.mediaType === 'audio' ? '🎵' : '📁'}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <p className="text-xs text-white font-medium truncate">{media.fileName}</p>
            <p className="text-xs text-white/40 capitalize">{media.mediaType} · from {media.source}</p>
            <p className="text-xs text-brand/60 truncate" title={media.url}>
              {media.url.startsWith('data:') ? '[local file — no public URL]' : media.url}
            </p>
            {media.source === 'upload' && (
              <p className="text-xs text-yellow-400/80 mt-0.5">
                ⚠ Local file upload requires a public URL. Paste a URL or use a previous render.
              </p>
            )}
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setChanging(true)}
                className="rounded bg-neutral-700 px-2 py-0.5 text-xs text-white/70 hover:bg-neutral-600 hover:text-white transition-colors"
              >
                Change
              </button>
              <button
                onClick={() => { clearSlot(slot.fieldName); setChanging(false) }}
                className="rounded bg-neutral-700 px-2 py-0.5 text-xs text-white/70 hover:bg-red-900/40 hover:text-red-400 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty / changing state */
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded border-2 border-dashed p-4 flex flex-col items-center gap-2.5 cursor-pointer transition-colors ${
            isDragging
              ? 'border-brand bg-brand/10'
              : 'border-white/10 bg-neutral-800/50 hover:border-white/20'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={mime}
            className="hidden"
            onChange={handleFileChange}
            onClick={(e) => e.stopPropagation()}
          />
          <p className="text-xs text-white/50">📁 Drag & drop or click to browse</p>
          <p className="text-[10px] text-white/25">Accepts: {exts}</p>
          {dropError && <p className="text-xs text-red-400">{dropError}</p>}

          {/* URL paste row */}
          <div className="flex w-full gap-2" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              placeholder="https://…"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePasteUrl() }}
              className="flex-1 rounded bg-neutral-700 px-2.5 py-1 text-xs text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-brand"
            />
            <button
              onClick={handlePasteUrl}
              className="rounded bg-neutral-700 px-2.5 py-1 text-xs text-white/70 hover:bg-neutral-600 hover:text-white transition-colors"
            >
              Use URL
            </button>
          </div>

          {changing && (
            <button
              onClick={(e) => { e.stopPropagation(); setChanging(false) }}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MediaDropZone({ slots }: { slots: MediaInputSlot[] }): React.ReactElement | null {
  if (slots.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {slots.map((slot) => (
        <SlotDropZone key={slot.fieldName} slot={slot} />
      ))}
    </div>
  )
}
