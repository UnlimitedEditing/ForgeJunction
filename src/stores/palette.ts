import { create } from 'zustand'

export type PaletteTool = 'pen' | 'rect' | 'ellipse' | 'line' | 'text' | 'select' | 'skin'

interface PaletteState {
  isOpen: boolean
  activeTool: PaletteTool
  color: string
  strokeWidth: number
  fillEnabled: boolean
  fontSize: number
  fontFamily: string
  open: () => void; close: () => void; toggle: () => void
  setTool: (t: PaletteTool) => void
  setColor: (c: string) => void
  setStrokeWidth: (w: number) => void
  toggleFill: () => void
  setFontSize: (s: number) => void
  setFontFamily: (f: string) => void
}

export const usePaletteStore = create<PaletteState>()((set) => ({
  isOpen: false,
  activeTool: 'pen',
  color: '#ff6b2b',
  strokeWidth: 2,
  fillEnabled: false,
  fontSize: 16,
  fontFamily: 'sans-serif',
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set(s => ({ isOpen: !s.isOpen })),
  setTool: (activeTool) => set({ activeTool }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  toggleFill: () => set(s => ({ fillEnabled: !s.fillEnabled })),
  setFontSize: (fontSize) => set({ fontSize }),
  setFontFamily: (fontFamily) => set({ fontFamily }),
}))
