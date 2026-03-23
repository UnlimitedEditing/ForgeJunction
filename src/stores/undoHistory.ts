import { create } from 'zustand'

type UndoFn = () => void

const MAX = 80

interface UndoHistoryState {
  stack: UndoFn[]
  push: (fn: UndoFn) => void
  undo: () => void
  clear: () => void
}

export const useUndoHistory = create<UndoHistoryState>()((set, get) => ({
  stack: [],

  push: (fn) => set(s => ({
    stack: s.stack.length >= MAX
      ? [...s.stack.slice(1), fn]
      : [...s.stack, fn],
  })),

  undo: () => {
    const { stack } = get()
    if (!stack.length) return
    const fn = stack[stack.length - 1]
    set({ stack: stack.slice(0, -1) })
    fn()
  },

  clear: () => set({ stack: [] }),
}))
