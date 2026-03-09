import { create } from 'zustand'

// ── Pure helpers ──────────────────────────────────────────────────────────────

interface PromptComponents {
  workflowSlug: string
  parameters: Record<string, string>
  concepts: string
  descriptiveText: string
  negativePrompt: string
}

/** Build a raw Telegram-compatible prompt string from its parts. */
function assemble(c: PromptComponents): string {
  const parts: string[] = []
  if (c.workflowSlug) parts.push(`/run:${c.workflowSlug}`)
  for (const [k, v] of Object.entries(c.parameters)) {
    if (v !== '' && v !== null && v !== undefined) parts.push(`/${k}:${v}`)
  }
  if (c.concepts) parts.push(c.concepts)
  if (c.descriptiveText.trim()) parts.push(c.descriptiveText.trim())
  if (c.negativePrompt.trim()) parts.push(`[${c.negativePrompt.trim()}]`)
  return parts.join(' ')
}

/** Parse a raw prompt string into its component parts. */
function parseRaw(raw: string): PromptComponents {
  let input = raw.trim()

  // Strip leading /wf
  input = input.replace(/^\/wf\s*/i, '')

  // Extract /run:<slug>
  let workflowSlug = ''
  const runMatch = input.match(/\/run:(\S+)/)
  if (runMatch) {
    workflowSlug = runMatch[1]
    input = input.replace(runMatch[0], '').trim()
  }

  // Extract [negative prompt]
  let negativePrompt = ''
  const negMatch = input.match(/\[([^\]]*)\]/)
  if (negMatch) {
    negativePrompt = negMatch[1].trim()
    input = input.replace(negMatch[0], '').trim()
  }

  // Extract /key:value pairs
  const parameters: Record<string, string> = {}
  const kvRegex = /\/(\w+):(\S+)/g
  let m
  while ((m = kvRegex.exec(input)) !== null) {
    parameters[m[1]] = m[2]
  }
  input = input.replace(/\/\w+:\S+/g, '').trim()

  // Extract concepts <name:weight>
  const conceptMatches = input.match(/<[^>]+>/g) ?? []
  const concepts = conceptMatches.join(' ')
  input = input.replace(/<[^>]+>/g, '').trim()

  const descriptiveText = input.replace(/\s+/g, ' ').trim()

  return { workflowSlug, parameters, concepts, descriptiveText, negativePrompt }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface PromptState {
  // Source of truth
  rawPrompt: string

  // Parsed components (always in sync with rawPrompt)
  workflowSlug: string
  descriptiveText: string
  negativePrompt: string
  parameters: Record<string, string>
  concepts: string

  // Legacy alias — rawPrompt under the old name
  text: string

  // Actions
  setRawPrompt: (text: string) => void
  setDescriptiveText: (text: string) => void
  setNegativePrompt: (text: string) => void
  setParameter: (key: string, value: string) => void
  removeParameter: (key: string) => void
  setWorkflowSlug: (slug: string) => void
  buildRawPrompt: () => string
  copyToClipboard: () => void
  clear: () => void

  // Legacy aliases
  setText: (text: string) => void
  getCleanPrompt: () => string
}

export const usePromptStore = create<PromptState>((set, get) => ({
  rawPrompt: '',
  workflowSlug: '',
  descriptiveText: '',
  negativePrompt: '',
  parameters: {},
  concepts: '',
  text: '',

  setRawPrompt: (text) => {
    const parsed = parseRaw(text)
    set({ rawPrompt: text, text, ...parsed })
  },

  setDescriptiveText: (descriptiveText) => {
    set((s) => {
      const raw = assemble({ ...s, descriptiveText })
      return { descriptiveText, rawPrompt: raw, text: raw }
    })
  },

  setNegativePrompt: (negativePrompt) => {
    set((s) => {
      const raw = assemble({ ...s, negativePrompt })
      return { negativePrompt, rawPrompt: raw, text: raw }
    })
  },

  setParameter: (key, value) => {
    set((s) => {
      const parameters = { ...s.parameters, [key]: value }
      const raw = assemble({ ...s, parameters })
      return { parameters, rawPrompt: raw, text: raw }
    })
  },

  removeParameter: (key) => {
    set((s) => {
      const parameters = { ...s.parameters }
      delete parameters[key]
      const raw = assemble({ ...s, parameters })
      return { parameters, rawPrompt: raw, text: raw }
    })
  },

  // Switching workflows clears old parameters since field names differ per workflow
  setWorkflowSlug: (slug) => {
    set((s) => {
      const parameters: Record<string, string> = {}
      const raw = assemble({ ...s, workflowSlug: slug, parameters })
      return { workflowSlug: slug, parameters, rawPrompt: raw, text: raw }
    })
  },

  buildRawPrompt: () => assemble(get()),

  copyToClipboard: () => {
    const raw = assemble(get())
    const telegram = raw.startsWith('/wf') ? raw : `/wf ${raw}`.trimEnd()
    navigator.clipboard.writeText(telegram)
  },

  clear: () => {
    set({
      rawPrompt: '', text: '', workflowSlug: '',
      descriptiveText: '', negativePrompt: '', parameters: {}, concepts: '',
    })
  },

  setText: (text) => get().setRawPrompt(text),
  getCleanPrompt: () => get().descriptiveText,
}))
