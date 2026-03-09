import { create } from 'zustand'
import { fetchWorkflows, type Workflow } from '@/api/graydient'

interface WorkflowState {
  workflows: Workflow[]
  selectedWorkflow: Workflow | null
  loading: boolean
  error: string | null
  loadWorkflows: () => Promise<void>
  selectWorkflow: (slug: string) => void
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  selectedWorkflow: null,
  loading: false,
  error: null,

  loadWorkflows: async () => {
    if (get().workflows.length > 0) return
    set({ loading: true, error: null })
    try {
      const workflows = await fetchWorkflows()
      set({ workflows, loading: false })
    } catch (e) {
      set({ loading: false, error: (e as Error).message })
    }
  },

  selectWorkflow: (slug) => {
    const found = get().workflows.find((w) => w.slug === slug) ?? null
    set({ selectedWorkflow: found })
  }
}))
