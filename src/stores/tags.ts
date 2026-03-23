import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Types ─────────────────────────────────────────────────────────────────────

const TAG_COLORS = [
  '#6c47ff', // brand purple
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#14b8a6', // teal
]

export { TAG_COLORS }

export interface Tag {
  id: string
  name: string
  color: string
}

/** One tile assigned to one tag, with an explicit ordering index (0-based). */
export interface TagAssignment {
  tileId: string   // FlatTile id — `${renderId}-${batchIndex}`
  tagId: string
  index: number    // ordering within the tag
}

interface TagsState {
  tags: Tag[]
  assignments: TagAssignment[]

  createTag: (name: string, color?: string) => Tag
  deleteTag: (tagId: string) => void
  renameTag: (tagId: string, name: string) => void
  setTagColor: (tagId: string, color: string) => void

  /** Add a tile to a tag (appended at the end). No-op if already assigned. */
  assignTag: (tileId: string, tagId: string) => void
  /** Remove a tile from a tag and close the index gap. */
  unassignTag: (tileId: string, tagId: string) => void

  /** Get all tags a tile belongs to. */
  getTileTags: (tileId: string) => Tag[]
  /** Get all assignments for a tag, sorted by index. */
  getTagItems: (tagId: string) => TagAssignment[]

  /** Move a tile to a different index within a tag (reorders the full list). */
  reorderTag: (tagId: string, tileId: string, newIndex: number) => void
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useTagsStore = create<TagsState>()(persist((set, get) => ({
  tags: [],
  assignments: [],

  createTag: (name, color) => {
    const existingColors = get().tags.map(t => t.color)
    const nextColor = color ?? (TAG_COLORS.find(c => !existingColors.includes(c)) ?? TAG_COLORS[get().tags.length % TAG_COLORS.length])
    const tag: Tag = {
      id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || 'Untitled',
      color: nextColor,
    }
    set(s => ({ tags: [...s.tags, tag] }))
    return tag
  },

  deleteTag: (tagId) => set(s => ({
    tags: s.tags.filter(t => t.id !== tagId),
    assignments: s.assignments.filter(a => a.tagId !== tagId),
  })),

  renameTag: (tagId, name) => set(s => ({
    tags: s.tags.map(t => t.id === tagId ? { ...t, name: name.trim() || t.name } : t),
  })),

  setTagColor: (tagId, color) => set(s => ({
    tags: s.tags.map(t => t.id === tagId ? { ...t, color } : t),
  })),

  assignTag: (tileId, tagId) => {
    const existing = get().assignments.find(a => a.tileId === tileId && a.tagId === tagId)
    if (existing) return
    const maxIndex = get().assignments
      .filter(a => a.tagId === tagId)
      .reduce((m, a) => Math.max(m, a.index), -1)
    set(s => ({
      assignments: [...s.assignments, { tileId, tagId, index: maxIndex + 1 }],
    }))
  },

  unassignTag: (tileId, tagId) => set(s => {
    const remaining = s.assignments
      .filter(a => !(a.tileId === tileId && a.tagId === tagId))
    // Re-compact indices for this tag
    const others = remaining.filter(a => a.tagId !== tagId)
    const reindexed = remaining
      .filter(a => a.tagId === tagId)
      .sort((a, b) => a.index - b.index)
      .map((a, i) => ({ ...a, index: i }))
    return { assignments: [...others, ...reindexed] }
  }),

  getTileTags: (tileId) => {
    const { tags, assignments } = get()
    return assignments
      .filter(a => a.tileId === tileId)
      .map(a => tags.find(t => t.id === a.tagId))
      .filter((t): t is Tag => !!t)
  },

  getTagItems: (tagId) =>
    get().assignments
      .filter(a => a.tagId === tagId)
      .sort((a, b) => a.index - b.index),

  reorderTag: (tagId, tileId, newIndex) => set(s => {
    const items = s.assignments
      .filter(a => a.tagId === tagId)
      .sort((a, b) => a.index - b.index)
    const from = items.findIndex(a => a.tileId === tileId)
    if (from === -1) return s
    const [moved] = items.splice(from, 1)
    items.splice(newIndex, 0, moved)
    const reindexed = items.map((a, i) => ({ ...a, index: i }))
    const others = s.assignments.filter(a => a.tagId !== tagId)
    return { assignments: [...others, ...reindexed] }
  }),
}), {
  name: 'fj-tags',
}))
