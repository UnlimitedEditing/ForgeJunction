import { create } from 'zustand'

export interface VideoClip {
  id: string
  url: string
  prompt: string
  label: string
  duration: number      // seconds, 0 until probed
  trimIn: number
  trimOut: number
  transition: 'cut' | 'crossfade' | 'fade_black'
  transitionDuration: number
}

export interface AudioTrack {
  id: string
  url: string
  label: string
  volume: number    // 0.0-1.0
}

interface VideoEditorState {
  clips: VideoClip[]
  audioTracks: AudioTrack[]
  exportName: string
  isExporting: boolean
  exportProgress: number
  exportLog: string[]
  previewClipId: string | null

  addClip: (url: string, prompt: string, label: string) => string
  removeClip: (id: string) => void
  moveClip: (id: string, direction: 'left' | 'right') => void
  updateClip: (id: string, patch: Partial<VideoClip>) => void
  setClipDuration: (id: string, duration: number) => void
  addAudioTrack: (url: string, label: string) => void
  removeAudioTrack: (id: string) => void
  updateAudioTrack: (id: string, patch: Partial<AudioTrack>) => void
  setExportName: (name: string) => void
  setPreviewClip: (id: string | null) => void
  appendLog: (msg: string) => void
  setExporting: (isExporting: boolean, progress?: number) => void
  clearEditor: () => void
}

function makeId(): string {
  return Date.now().toString() + Math.random().toString(36).slice(2)
}

export const useVideoEditorStore = create<VideoEditorState>((set, get) => ({
  clips: [],
  audioTracks: [],
  exportName: 'composite',
  isExporting: false,
  exportProgress: 0,
  exportLog: [],
  previewClipId: null,

  addClip: (url, prompt, label) => {
    const id = makeId()
    const clip: VideoClip = {
      id,
      url,
      prompt,
      label,
      duration: 0,
      trimIn: 0,
      trimOut: 0,
      transition: 'cut',
      transitionDuration: 0.5,
    }
    set((s) => ({ clips: [...s.clips, clip] }))
    return id
  },

  removeClip: (id) => {
    set((s) => {
      const clips = s.clips.filter((c) => c.id !== id)
      return {
        clips,
        previewClipId: s.previewClipId === id ? (clips[0]?.id ?? null) : s.previewClipId,
      }
    })
  },

  moveClip: (id, direction) => {
    set((s) => {
      const idx = s.clips.findIndex((c) => c.id === id)
      if (idx === -1) return {}
      if (direction === 'left' && idx === 0) return {}
      if (direction === 'right' && idx === s.clips.length - 1) return {}
      const clips = [...s.clips]
      const swapIdx = direction === 'left' ? idx - 1 : idx + 1
      ;[clips[idx], clips[swapIdx]] = [clips[swapIdx], clips[idx]]
      return { clips }
    })
  },

  updateClip: (id, patch) => {
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
  },

  setClipDuration: (id, duration) => {
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, duration } : c)),
    }))
  },

  addAudioTrack: (url, label) => {
    const id = makeId()
    set((s) => ({
      audioTracks: [...s.audioTracks, { id, url, label, volume: 1.0 }],
    }))
  },

  removeAudioTrack: (id) => {
    set((s) => ({
      audioTracks: s.audioTracks.filter((t) => t.id !== id),
    }))
  },

  updateAudioTrack: (id, patch) => {
    set((s) => ({
      audioTracks: s.audioTracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }))
  },

  setExportName: (name) => set({ exportName: name }),

  setPreviewClip: (id) => set({ previewClipId: id }),

  appendLog: (msg) => {
    set((s) => ({ exportLog: [...s.exportLog, msg] }))
  },

  setExporting: (isExporting, progress) => {
    set((s) => ({
      isExporting,
      exportProgress: progress !== undefined ? progress : s.exportProgress,
    }))
  },

  clearEditor: () => {
    set({
      clips: [],
      audioTracks: [],
      exportName: 'composite',
      isExporting: false,
      exportProgress: 0,
      exportLog: [],
      previewClipId: null,
    })
  },

  // Expose get for internal use
  ...({} as { _get: typeof get }),
}))
