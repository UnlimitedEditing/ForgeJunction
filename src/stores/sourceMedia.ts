import { create } from 'zustand'
import type { MediaInputSlot } from '@/utils/workflowInputs'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MediaSlotValue {
  url: string
  fileName: string
  mediaType: 'image' | 'video' | 'audio'
  source: 'render' | 'url' | 'upload'
  thumbnailUrl: string | null
}

// Backward-compat alias (old code used SourceMedia; localPath is always null now)
export type SourceMedia = MediaSlotValue

// ── Store ─────────────────────────────────────────────────────────────────────

interface SourceMediaState {
  // Keyed by fieldName: "init_image_filename", "image1", "image2", …
  slots: Record<string, MediaSlotValue | null>
  // Held when user clicks "Use as Render Source" before any workflow is selected
  pendingSource: MediaSlotValue | null
  uploadWarning: string | null

  // Slot actions
  setSlot: (fieldName: string, value: MediaSlotValue) => void
  clearSlot: (fieldName: string) => void
  clearAll: () => void
  /** Remove slots whose fieldName is not present in the given inputSlots list */
  clearIncompatibleSlots: (inputSlots: MediaInputSlot[]) => void
  setPendingSource: (value: MediaSlotValue | null) => void

  // Convenience setters (default slot = init_image_filename)
  setFromRender: (url: string, mediaType: string, fieldName?: string) => void
  setFromUrl: (url: string, fieldName?: string) => void
  setFromUpload: (file: File, fieldName?: string) => void

  // Getters / derived
  getSlot: (fieldName: string) => MediaSlotValue | null
  isReady: (inputSlots: MediaInputSlot[]) => boolean
  getMissingSlots: (inputSlots: MediaInputSlot[]) => MediaInputSlot[]
  buildRequestFields: () => {
    initImage: string | null
    placeholders: Record<string, string>
    optionPairs: string[]
  }

  // Backward compat — mirrors the init_image_filename slot
  media: MediaSlotValue | null
  clear: () => void
  getMediaType: () => 'image' | 'video' | 'audio' | null
  hasMedia: () => boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectTypeFromUrl(url: string): 'image' | 'video' | 'audio' {
  const lower = url.toLowerCase().split('?')[0]
  if (/\.(mp4|webm|mov|avi)$/.test(lower)) return 'video'
  if (/\.(mp3|wav|ogg|flac|aac)$/.test(lower)) return 'audio'
  return 'image'
}

function normalizeMediaType(type: string): 'image' | 'video' | 'audio' {
  if (type === 'video') return 'video'
  if (type === 'audio') return 'audio'
  return 'image'
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useSourceMediaStore = create<SourceMediaState>((set, get) => ({
  slots: {},
  pendingSource: null,
  uploadWarning: null,
  media: null,

  setSlot: (fieldName, value) => {
    console.log('SOURCE MEDIA setSlot:', fieldName, value.url.substring(0, 60), 'type:', value.mediaType)
    set((s) => {
      const slots = { ...s.slots, [fieldName]: value }
      const media = slots['init_image_filename'] ?? null
      const uploadWarning =
        value.source === 'upload'
          ? 'Local file upload requires a public URL. For now, paste a URL or use a previously rendered image.'
          : null
      return { slots, media, uploadWarning }
    })
  },

  clearSlot: (fieldName) => {
    console.log('SOURCE MEDIA clearSlot:', fieldName)
    set((s) => {
      const slots = { ...s.slots, [fieldName]: null }
      const media = slots['init_image_filename'] ?? null
      return { slots, media }
    })
  },

  clearAll: () => {
    console.log('SOURCE MEDIA clearAll')
    set({ slots: {}, media: null, pendingSource: null, uploadWarning: null })
  },

  clearIncompatibleSlots: (inputSlots) => {
    const validFieldNames = new Set(inputSlots.map((s) => s.fieldName))
    set((s) => {
      const slots: Record<string, MediaSlotValue | null> = {}
      for (const [k, v] of Object.entries(s.slots)) {
        if (validFieldNames.has(k)) slots[k] = v
      }
      const media = slots['init_image_filename'] ?? null
      console.log('SOURCE MEDIA clearIncompatibleSlots: kept', Object.keys(slots))
      return { slots, media }
    })
  },

  setPendingSource: (value) => {
    console.log('SOURCE MEDIA setPendingSource:', value?.url.substring(0, 60) ?? null)
    set({ pendingSource: value })
  },

  setFromRender: (url, mediaType, fieldName = 'init_image_filename') => {
    const mt = normalizeMediaType(mediaType)
    const fileName = url.split('/').pop()?.split('?')[0] ?? 'render-output'
    console.log('SOURCE MEDIA setFromRender:', url.substring(0, 60), 'type:', mt, 'slot:', fieldName)
    const value: MediaSlotValue = {
      url, fileName, mediaType: mt,
      thumbnailUrl: mt === 'image' ? url : null,
      source: 'render',
    }
    set((s) => {
      const slots = { ...s.slots, [fieldName]: value }
      const media = slots['init_image_filename'] ?? null
      return { slots, media, uploadWarning: null }
    })
  },

  setFromUrl: (url, fieldName = 'init_image_filename') => {
    const mt = detectTypeFromUrl(url)
    const fileName = url.split('/').pop()?.split('?')[0] ?? 'source-media'
    console.log('SOURCE MEDIA setFromUrl:', url.substring(0, 60), 'type:', mt, 'slot:', fieldName)
    const value: MediaSlotValue = {
      url, fileName, mediaType: mt,
      thumbnailUrl: mt === 'image' ? url : null,
      source: 'url',
    }
    set((s) => {
      const slots = { ...s.slots, [fieldName]: value }
      const media = slots['init_image_filename'] ?? null
      return { slots, media, uploadWarning: null }
    })
  },

  setFromUpload: (file, fieldName = 'init_image_filename') => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      const mt: 'image' | 'video' | 'audio' = file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'image'
      console.log('SOURCE MEDIA setFromUpload:', file.name, 'type:', mt, 'slot:', fieldName)
      const value: MediaSlotValue = {
        url: dataUrl,
        fileName: file.name,
        mediaType: mt,
        thumbnailUrl: mt === 'image' ? dataUrl : null,
        source: 'upload',
      }
      set((s) => {
        const slots = { ...s.slots, [fieldName]: value }
        const media = slots['init_image_filename'] ?? null
        return {
          slots, media,
          uploadWarning: 'Local file upload requires a public URL. For now, paste a URL or use a previously rendered image.',
        }
      })
    }
    reader.readAsDataURL(file)
  },

  getSlot: (fieldName) => get().slots[fieldName] ?? null,

  isReady: (inputSlots) => {
    const { slots } = get()
    return inputSlots.every((slot) => !slot.required || slots[slot.fieldName] != null)
  },

  getMissingSlots: (inputSlots) => {
    const { slots } = get()
    return inputSlots.filter((slot) => slot.required && !slots[slot.fieldName])
  },

  buildRequestFields: () => {
    const { slots } = get()
    let initImage: string | null = null
    const placeholders: Record<string, string> = {}
    const optionPairs: string[] = []
    let urlIndex = 0

    for (const [fieldName, value] of Object.entries(slots)) {
      if (!value) continue
      if (fieldName === 'init_image_filename') {
        initImage = value.url
      } else {
        const placeholder = `URL${urlIndex}`
        placeholders[placeholder] = value.url
        optionPairs.push(`/${fieldName}:${placeholder}`)
        urlIndex++
      }
    }

    console.log('BUILD REQUEST FIELDS:', {
      initImage: initImage ? initImage.substring(0, 50) : null,
      placeholders: Object.keys(placeholders),
      optionPairs,
    })
    return { initImage, placeholders, optionPairs }
  },

  // Backward compat
  clear: () => get().clearAll(),
  getMediaType: () => get().media?.mediaType ?? null,
  hasMedia: () => get().media !== null,
}))
