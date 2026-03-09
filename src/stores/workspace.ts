import { create } from 'zustand'

interface WorkspaceState {
  projectName: string
  activeView: 'prompt' | 'library' | 'timeline' | 'renders' | 'settings'
  setProjectName: (name: string) => void
  setActiveView: (view: WorkspaceState['activeView']) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  projectName: 'Untitled Project',
  activeView: 'prompt',
  setProjectName: (name) => set({ projectName: name }),
  setActiveView: (view) => set({ activeView: view })
}))
