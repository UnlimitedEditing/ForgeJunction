import { create } from 'zustand'
import { fetchSkills, type Skill } from '@/api/graydient'

interface SkillsState {
  skills: Skill[]
  loading: boolean
  error: string | null
  loadSkills: () => Promise<void>
  refreshSkills: () => Promise<void>
}

export const useSkillsStore = create<SkillsState>()((set, get) => ({
  skills: [],
  loading: false,
  error: null,

  loadSkills: async () => {
    if (get().loading || get().skills.length > 0) return
    set({ loading: true, error: null })
    try {
      const skills = await fetchSkills()
      set({ skills, loading: false })
    } catch (e) {
      set({ loading: false, error: String(e) })
    }
  },

  refreshSkills: async () => {
    if (get().loading) return
    set({ loading: true, error: null })
    try {
      const skills = await fetchSkills()
      set({ skills, loading: false })
    } catch (e) {
      set({ loading: false, error: String(e) })
    }
  },
}))
