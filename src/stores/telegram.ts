import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface InspirationItem {
  id: string
  prompt: string
  thumbnailUrl?: string   // file:// or data: URL
  mediaType: 'image' | 'video'
  source?: string         // channel/group name
  date?: number           // unix timestamp
}

interface InspirationState {
  items: InspirationItem[]
  importItems: (incoming: InspirationItem[]) => void
  removeItem: (id: string) => void
  clearAll: () => void
}

export const useInspirationStore = create<InspirationState>()(
  persist(
    (set) => ({
      items: [],
      importItems: (incoming) =>
        set(state => {
          const existingIds = new Set(state.items.map(i => i.id))
          const fresh = incoming.filter(i => !existingIds.has(i.id))
          return { items: [...state.items, ...fresh] }
        }),
      removeItem: (id) => set(state => ({ items: state.items.filter(i => i.id !== id) })),
      clearAll: () => set({ items: [] }),
    }),
    { name: 'fj-inspiration' }
  )
)
