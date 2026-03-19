import React, { useEffect } from 'react'

interface Props {
  url: string
  mediaType: string
  onClose: () => void
}

export default function MediaLightbox({ url, mediaType, onClose }: Props): React.ReactElement {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.code === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isVideo = mediaType.includes('video')

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)', animation: 'lightbox-in 180ms ease-out both' }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors text-sm z-10"
        onClick={onClose}
        title="Close (Esc)"
      >✕</button>

      {/* Media — click inside doesn't close */}
      <div
        className="relative max-w-[92vw] max-h-[92vh] flex items-center justify-center"
        onClick={e => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            src={url}
            className="max-w-[92vw] max-h-[92vh] rounded-lg shadow-[0_0_80px_rgba(0,0,0,0.8)]"
            style={{ objectFit: 'contain' }}
            controls
            autoPlay
          />
        ) : (
          <img
            src={url}
            className="max-w-[92vw] max-h-[92vh] rounded-lg shadow-[0_0_80px_rgba(0,0,0,0.8)]"
            style={{ objectFit: 'contain' }}
            draggable={false}
          />
        )}
      </div>
    </div>
  )
}
