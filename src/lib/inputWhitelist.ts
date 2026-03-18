/**
 * Commands that indicate a workflow accepts image input (init_image / img2img).
 * Populate this list from whitelist.txt when provided.
 * If a prompt contains ANY of these strings, the standard input port is shown.
 */
export const IMG_INPUT_WHITELIST: string[] = [
  '/run:edit',
  '/run:animate',
  '/run:extend',
  '/run:extract',
  '/run:restyle',
  '/run:convert',
  '/run:wanimate',
  '/run:video-upscale',
  '/run:mmaudio',
]

/**
 * Returns true if the prompt indicates this node accepts an image input.
 * Falls back to true when the whitelist hasn't been populated yet.
 */
export function promptAcceptsImageInput(prompt: string): boolean {
  if (IMG_INPUT_WHITELIST.length === 0) return false
  return IMG_INPUT_WHITELIST.some(cmd => prompt.includes(cmd))
}

/**
 * Returns which /imageN: slot keys are present in the prompt.
 * e.g. "/image1: /image2:" → ['image1', 'image2']
 * These require the slug-port mechanism rather than the standard input port.
 */
export function getImageSlotKeys(prompt: string): string[] {
  const matches = prompt.match(/\/image(\d+):/g) ?? []
  return [...new Set(matches.map(m => m.replace('/', '').replace(':', '')))]
}
