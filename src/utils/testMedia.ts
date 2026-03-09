// Generates a simple 512x512 red circle on white background as a data URL
export function generateTestImageDataUrl(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, 512, 512)
  ctx.fillStyle = 'red'
  ctx.beginPath()
  ctx.arc(256, 256, 128, 0, Math.PI * 2)
  ctx.fill()
  return canvas.toDataURL('image/png')
}

// Stable public test media URLs.
// For image-input workflows: run a txt2img first (e.g. /run:zimage), then use that
// result URL via "Use as Render Source" — this avoids CORS issues with external URLs.
export const TEST_MEDIA = {
  image:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/300px-PNG_transparency_demonstration_1.png',
  video: null as string | null,  // TODO: find a stable public test video URL
  audio: null as string | null,  // TODO: find a stable public test audio URL
}

// Returns a cached render URL of the given type if one has been stored this session,
// otherwise falls back to the public test URLs above.
const _sessionCache: Record<string, string> = {}

export function cacheTestMediaUrl(type: 'image' | 'video' | 'audio', url: string): void {
  _sessionCache[type] = url
  console.log(`TEST MEDIA cached (${type}):`, url)
}

export function getTestMediaUrl(type: 'image' | 'video' | 'audio'): string | null {
  return _sessionCache[type] ?? TEST_MEDIA[type] ?? null
}
