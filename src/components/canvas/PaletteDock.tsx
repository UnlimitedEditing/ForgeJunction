import React, { useRef, useState } from 'react'
import { usePaletteStore, type PaletteTool } from '@/stores/palette'

const TOOLS: { id: PaletteTool; label: string; icon: string }[] = [
  { id: 'pen',     label: 'Pen',     icon: '✏' },
  { id: 'rect',    label: 'Rect',    icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', icon: '◯' },
  { id: 'line',    label: 'Line',    icon: '╱' },
  { id: 'text',    label: 'Text',    icon: 'T' },
  { id: 'select',  label: 'Select',  icon: '⊹' },
  { id: 'skin',    label: 'Skin',    icon: '✦' },
]

const SWATCHES = ['#ffffff', '#000000', '#ef4444', '#ff6b2b', '#facc15', '#22c55e', '#4ae3ff', '#a855f7']

export default function PaletteDock(): React.ReactElement {
  const { activeTool, color, strokeWidth, fillEnabled, fontSize, setTool, setColor, setStrokeWidth, toggleFill, setFontSize, close } = usePaletteStore()
  const [pos, setPos] = useState({ x: window.innerWidth / 2 - 200, y: window.innerHeight - 180 })
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)

  function onHeaderMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return
      setPos({ x: dragRef.current.ox + ev.clientX - dragRef.current.sx, y: dragRef.current.oy + ev.clientY - dragRef.current.sy })
    }
    function onUp() { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  const showFill = activeTool === 'rect' || activeTool === 'ellipse'
  const showFontSize = activeTool === 'text'

  return (
    <div
      className="fixed z-[200] select-none"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="bg-[#0d1014]/96 border border-white/15 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden" style={{ minWidth: 320 }}>
        {/* Drag handle header */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b border-white/8 cursor-grab active:cursor-grabbing"
          onMouseDown={onHeaderMouseDown}
        >
          <span className="text-[10px] uppercase tracking-widest text-white/40 font-semibold select-none">Palette</span>
          <button
            className="w-5 h-5 flex items-center justify-center rounded text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors text-[11px]"
            onClick={close}
            onMouseDown={e => e.stopPropagation()}
          >×</button>
        </div>

        <div className="p-3 space-y-3">
          {/* Tools */}
          <div className="flex items-center gap-1 flex-wrap">
            {TOOLS.map(t => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                title={t.label}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all ${
                  activeTool === t.id
                    ? 'bg-[#ff6b2b]/20 border border-[#ff6b2b]/50 text-[#ff9554]'
                    : 'border border-white/10 text-white/55 hover:text-white/80 hover:bg-white/6'
                }`}
              >{t.icon}</button>
            ))}
          </div>

          {/* Skin hint */}
          {activeTool === 'skin' && (
            <p className="text-[9px] text-[#ff6b2b]/70 bg-[#ff6b2b]/8 rounded-lg px-2 py-1.5 border border-[#ff6b2b]/15">
              Click an orphan image node to strip its frame
            </p>
          )}

          {/* Color swatches */}
          <div className="space-y-1.5">
            <p className="text-[9px] text-white/35 uppercase tracking-wider">Color</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {SWATCHES.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-all hover:scale-110 ${
                    color === c ? 'border-white/80 scale-110' : 'border-transparent hover:border-white/40'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-5 h-5 rounded-full border-0 bg-transparent cursor-pointer overflow-hidden"
                title="Custom color"
                style={{ padding: 0 }}
              />
            </div>
          </div>

          {/* Stroke width */}
          {activeTool !== 'skin' && activeTool !== 'select' && activeTool !== 'text' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[9px] text-white/35 uppercase tracking-wider">Size</p>
                <span className="text-[9px] text-white/55 font-mono">{strokeWidth}px</span>
              </div>
              <input
                type="range" min={1} max={24} step={0.5}
                value={strokeWidth}
                onChange={e => setStrokeWidth(Number(e.target.value))}
                className="w-full accent-[#ff6b2b] h-1"
              />
            </div>
          )}

          {/* Fill toggle */}
          {showFill && (
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/35 uppercase tracking-wider">Fill</span>
              <button
                onClick={toggleFill}
                className={`w-8 h-4 rounded-full transition-colors relative ${fillEnabled ? 'bg-[#ff6b2b]/60' : 'bg-white/15'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${fillEnabled ? 'right-0.5' : 'left-0.5'}`} />
              </button>
            </div>
          )}

          {/* Font size */}
          {showFontSize && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-white/35 uppercase tracking-wider">Font size</span>
              <input
                type="number" min={8} max={120} step={2}
                value={fontSize}
                onChange={e => setFontSize(Number(e.target.value))}
                className="w-16 bg-white/6 border border-white/10 rounded px-2 py-0.5 text-[11px] text-white text-right outline-none focus:border-[#ff6b2b]/40"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
