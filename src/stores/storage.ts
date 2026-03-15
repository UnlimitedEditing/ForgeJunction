import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface StorageState {
  watchedDirs: string[]
  addDir: (path: string) => void
  removeDir: (path: string) => void
  moveDir: (oldPath: string, newPath: string) => void
}

export const useStorageStore = create<StorageState>()(persist(
  (set) => ({
    watchedDirs: [],
    addDir: (path) => set(s => ({ watchedDirs: s.watchedDirs.includes(path) ? s.watchedDirs : [...s.watchedDirs, path] })),
    removeDir: (path) => set(s => ({ watchedDirs: s.watchedDirs.filter(d => d !== path) })),
    moveDir: (oldPath, newPath) => set(s => ({ watchedDirs: s.watchedDirs.map(d => d === oldPath ? newPath : d) })),
  }),
  { name: 'fj-storage' }
))
