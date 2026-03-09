import { create } from 'zustand'

export type ThemeName = 'default' | 'discord' | 'pirate'

export const THEMES: { name: ThemeName; label: string }[] = [
  { name: 'default',  label: 'Industrial (Default)' },
  { name: 'discord',  label: 'Discord (Purple)' },
  { name: 'pirate',   label: 'Pirate (Aetherpunk)' },
]

const STORAGE_KEY = 'fj-theme'

function applyTheme(theme: ThemeName): void {
  const root = document.documentElement
  if (theme === 'default') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }
}

interface ThemeStore {
  theme: ThemeName
  setTheme: (theme: ThemeName) => void
  initTheme: () => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: 'default',

  setTheme: (theme) => {
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme)
    if (window.electron) {
      window.electron.reportTheme(theme)
    }
    set({ theme })
  },

  initTheme: () => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeName | null
    const valid: ThemeName[] = ['default', 'discord', 'pirate']
    const resolved: ThemeName = stored && valid.includes(stored) ? stored : 'default'
    applyTheme(resolved)
    if (window.electron) {
      window.electron.reportTheme(resolved)
    }
    set({ theme: resolved })
  },
}))
