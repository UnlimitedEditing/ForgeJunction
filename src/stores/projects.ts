import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ProjectRender {
  id: string
  workflowSlug: string
  prompt: string
  resultUrl: string
  thumbnailUrl: string | null
  mediaType: string
  completedAt: number
  nodeId?: string   // set when render came from a chain graph node
}

export interface ProjectDimensions {
  width: number
  height: number
}

export const DIMENSION_PRESETS: { label: string; value: ProjectDimensions | null; group: string }[] = [
  { label: 'No constraint', value: null, group: '' },
  // Landscape
  { label: '1920 × 1080  (1080p)', value: { width: 1920, height: 1080 }, group: 'Landscape' },
  { label: '1280 × 720   (720p)',  value: { width: 1280, height: 720  }, group: 'Landscape' },
  { label: '3840 × 2160  (4K)',    value: { width: 3840, height: 2160 }, group: 'Landscape' },
  // Portrait
  { label: '1080 × 1920  (9:16)', value: { width: 1080, height: 1920 }, group: 'Portrait' },
  { label: '720 × 1280   (9:16)', value: { width: 720,  height: 1280 }, group: 'Portrait' },
  { label: '2160 × 3840  (4K)',   value: { width: 2160, height: 3840 }, group: 'Portrait' },
  // Square
  { label: '1080 × 1080  (1:1)', value: { width: 1080, height: 1080 }, group: 'Square' },
  { label: '720 × 720    (1:1)', value: { width: 720,  height: 720  }, group: 'Square' },
]

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  dimensions: ProjectDimensions | null
  renders: ProjectRender[]
}

interface ProjectsState {
  projects: Project[]
  activeProjectId: string | null

  createProject: (name: string, dimensions?: ProjectDimensions | null) => string
  deleteProject: (id: string) => void
  renameProject: (id: string, name: string) => void
  setActiveProject: (id: string | null) => void
  setProjectDimensions: (id: string, dimensions: ProjectDimensions | null) => void
  addRenderToProject: (projectId: string, render: ProjectRender) => void
  removeRenderFromProject: (projectId: string, renderId: string) => void
  reorderRender: (projectId: string, fromIdx: number, toIdx: number) => void
  /** Called by renderQueue and chainGraph when a render completes. Adds to the active project if one is set. Deduplicates by id. */
  notifyRenderComplete: (render: ProjectRender) => void
  getActiveProject: () => Project | null
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useProjectsStore = create<ProjectsState>()(persist(
  (set, get) => ({
    projects: [],
    activeProjectId: null,

    createProject: (name, dimensions = null) => {
      const id = makeId()
      const now = Date.now()
      set(s => ({ projects: [...s.projects, { id, name, dimensions, createdAt: now, updatedAt: now, renders: [] }] }))
      return id
    },

    setProjectDimensions: (id, dimensions) => {
      set(s => ({
        projects: s.projects.map(p => p.id === id ? { ...p, dimensions, updatedAt: Date.now() } : p),
      }))
    },

    deleteProject: (id) => {
      set(s => ({
        projects: s.projects.filter(p => p.id !== id),
        activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
      }))
    },

    renameProject: (id, name) => {
      set(s => ({
        projects: s.projects.map(p => p.id === id ? { ...p, name, updatedAt: Date.now() } : p),
      }))
    },

    setActiveProject: (id) => set({ activeProjectId: id }),

    addRenderToProject: (projectId, render) => {
      set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, renders: [...p.renders, render], updatedAt: Date.now() }
            : p
        ),
      }))
    },

    removeRenderFromProject: (projectId, renderId) => {
      set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, renders: p.renders.filter(r => r.id !== renderId), updatedAt: Date.now() }
            : p
        ),
      }))
    },

    reorderRender: (projectId, fromIdx, toIdx) => {
      set(s => ({
        projects: s.projects.map(p => {
          if (p.id !== projectId) return p
          const renders = [...p.renders]
          const [item] = renders.splice(fromIdx, 1)
          renders.splice(toIdx, 0, item)
          return { ...p, renders, updatedAt: Date.now() }
        }),
      }))
    },

    notifyRenderComplete: (render) => {
      const { activeProjectId, projects } = get()
      if (!activeProjectId || !render.resultUrl) return
      const active = projects.find(p => p.id === activeProjectId)
      if (!active || active.renders.some(r => r.id === render.id)) return
      get().addRenderToProject(activeProjectId, render)
    },

    getActiveProject: () => {
      const { projects, activeProjectId } = get()
      return projects.find(p => p.id === activeProjectId) ?? null
    },
  }),
  { name: 'fj-projects' }
))
