import { create } from 'zustand'
import { useUndoHistory } from './undoHistory'

export interface StrokeAnnotation {
  id: string; type: 'stroke'
  points: number[]  // flat [x0,y0,x1,y1,...] world coords
  color: string; width: number; opacity: number
}
export interface ShapeAnnotation {
  id: string; type: 'shape'
  shapeType: 'rect' | 'ellipse' | 'line'
  x: number; y: number; w: number; h: number
  color: string; width: number; fill: string | null; opacity: number
}
export interface TextAnnotation {
  id: string; type: 'text'
  x: number; y: number; text: string
  color: string; fontSize: number; opacity: number
}
export type Annotation = StrokeAnnotation | ShapeAnnotation | TextAnnotation

interface AnnotationState {
  annotations: Annotation[]
  addStroke: (s: Omit<StrokeAnnotation, 'id'>) => string
  addShape: (s: Omit<ShapeAnnotation, 'id'>) => string
  addText: (s: Omit<TextAnnotation, 'id'>) => string
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void
  deleteAnnotation: (id: string) => void
  deleteByIds: (ids: string[]) => void
  clearAll: () => void
  getInBounds: (b: { x: number; y: number; w: number; h: number }) => Annotation[]
}

function makeId() { return `ann-${Date.now()}-${Math.random().toString(36).slice(2)}` }

export const useAnnotationStore = create<AnnotationState>()((set, get) => ({
  annotations: [],
  addStroke: (s) => {
    const id = makeId()
    set(st => ({ annotations: [...st.annotations, { ...s, id }] }))
    useUndoHistory.getState().push(() => get().deleteAnnotation(id))
    return id
  },
  addShape: (s) => {
    const id = makeId()
    set(st => ({ annotations: [...st.annotations, { ...s, id }] }))
    useUndoHistory.getState().push(() => get().deleteAnnotation(id))
    return id
  },
  addText: (s) => {
    const id = makeId()
    set(st => ({ annotations: [...st.annotations, { ...s, id }] }))
    useUndoHistory.getState().push(() => get().deleteAnnotation(id))
    return id
  },
  updateAnnotation: (id, patch) => set(st => ({
    annotations: st.annotations.map(a => a.id === id ? { ...a, ...patch } as Annotation : a),
  })),
  deleteAnnotation: (id) => set(st => ({ annotations: st.annotations.filter(a => a.id !== id) })),
  deleteByIds: (ids) => { const s = new Set(ids); set(st => ({ annotations: st.annotations.filter(a => !s.has(a.id)) })) },
  clearAll: () => set({ annotations: [] }),
  getInBounds: (b) => get().annotations.filter(a => {
    if (a.type === 'stroke') {
      for (let i = 0; i < a.points.length - 1; i += 2) {
        if (a.points[i] >= b.x && a.points[i] <= b.x + b.w && a.points[i+1] >= b.y && a.points[i+1] <= b.y + b.h) return true
      }
      return false
    }
    if (a.type === 'shape') return a.x + a.w > b.x && a.x < b.x + b.w && a.y + a.h > b.y && a.y < b.y + b.h
    if (a.type === 'text') return a.x >= b.x && a.x <= b.x + b.w && a.y >= b.y && a.y <= b.y + b.h
    return false
  }),
}))
