import React from 'react'

interface SpyglassLensProps {
  children?: React.ReactNode
  title?: string
}

/**
 * Wraps content in an Aetherpunk optical lens effect.
 * Use around render previews, material thumbnails, or node graph views.
 */
export default function SpyglassLens({
  children,
  title = 'Aether-Lens Viewer',
}: SpyglassLensProps): React.ReactElement {
  return (
    <div className="relative w-full h-64 bg-neutral-950 border-2 border-neutral-800 rounded-2xl overflow-hidden flex items-center justify-center p-4 group">
      {/* 1. Content */}
      <div className="relative z-0 w-full h-full flex items-center justify-center text-white/40">
        {children ?? (
          <span className="themed-heading tracking-widest text-sm">
            Target Acquired...
          </span>
        )}
      </div>

      {/* 2. Radial edge blur */}
      <div
        className="absolute inset-0 z-10 pointer-events-none backdrop-blur-md"
        style={{
          WebkitMaskImage: 'radial-gradient(circle at center, transparent 30%, black 100%)',
          maskImage:       'radial-gradient(circle at center, transparent 30%, black 100%)',
        }}
      />

      {/* 3. Chromatic aberration + glass dome */}
      <div className="absolute inset-0 z-20 pointer-events-none mix-blend-screen opacity-80 shadow-[inset_3px_0_8px_rgba(255,0,0,0.3),inset_-3px_0_8px_rgba(0,255,255,0.3),inset_0_20px_40px_rgba(255,255,255,0.05),inset_0_-20px_40px_rgba(0,0,0,0.8)]" />

      {/* 4. Brass reticle ring */}
      <div className="absolute inset-0 z-30 pointer-events-none border border-brand/20 rounded-2xl m-2 flex flex-col justify-between p-2">
        <div className="w-full flex justify-center text-[10px] uppercase tracking-[0.3em] text-brand/50 themed-heading">
          {title}
        </div>
        {/* Crosshairs */}
        <div className="absolute top-1/2 left-0 w-3 h-px bg-brand/40" />
        <div className="absolute top-1/2 right-0 w-3 h-px bg-brand/40" />
        <div className="absolute top-0 left-1/2 w-px h-3 bg-brand/40" />
        <div className="absolute bottom-0 left-1/2 w-px h-3 bg-brand/40" />
      </div>
    </div>
  )
}
