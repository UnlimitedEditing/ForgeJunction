import { create } from 'zustand'

interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  apiKey: string | null
  error: string | null

  checkExistingKey: () => Promise<void>
  login: (key: string) => Promise<boolean>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  apiKey: null,
  error: null,

  checkExistingKey: async () => {
    set({ isLoading: true, error: null })
    try {
      const hasKey = await window.electron.auth.hasKey()
      if (!hasKey) {
        set({ isAuthenticated: false, isLoading: false, apiKey: null })
        return
      }

      const key = await window.electron.auth.getKey()
      if (!key) {
        set({ isAuthenticated: false, isLoading: false, apiKey: null })
        return
      }

      const result = await window.electron.auth.validateKey(key)

      if (result.timedOut) {
        // Network timeout on startup — assume still valid, show warning via error
        set({
          isAuthenticated: true,
          isLoading: false,
          apiKey: key,
          error: 'Could not verify API key (network timeout). Proceeding with cached key.'
        })
        return
      }

      if (result.valid) {
        set({ isAuthenticated: true, isLoading: false, apiKey: key, error: null })
      } else {
        // Key exists but fails validation (401) — show onboarding with option to retry
        set({
          isAuthenticated: false,
          isLoading: false,
          apiKey: null,
          error: 'Your API key is no longer valid. Please enter a new one.'
        })
      }
    } catch {
      set({ isAuthenticated: false, isLoading: false, apiKey: null })
    }
  },

  login: async (key: string) => {
    set({ error: null })
    const result = await window.electron.auth.validateKey(key)
    if (result.valid || result.timedOut) {
      await window.electron.auth.setKey(key)
      set({ isAuthenticated: true, apiKey: key, error: null })
      return true
    } else {
      set({ error: result.error })
      return false
    }
  },

  logout: async () => {
    await window.electron.auth.deleteKey()
    set({ isAuthenticated: false, apiKey: null, error: null })
  },
}))
