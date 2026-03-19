import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  hideNsfw: boolean
  setHideNsfw: (value: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(persist(
  (set) => ({
    hideNsfw: true,
    setHideNsfw: (value) => set({ hideNsfw: value }),
  }),
  { name: 'fj-settings' }
))
