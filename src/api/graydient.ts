import { useAuthStore } from '../stores/auth'

const BASE_URL = (import.meta.env.VITE_GRAYDIENT_API_URL ?? 'https://app.graydient.ai/api/v3/') as string

function getApiKey(): string {
  return useAuthStore.getState().apiKey || ''
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface WorkflowFieldMapping {
  local_field: string
  default_value: string | number | null
  help_text: string
  minimum_value: number | null
  maximum_value: number | null
  node_id?: string | null
}

export interface Workflow {
  id: string
  slug: string
  name: string
  description: string
  thumbnail_url?: string | null
  image_url?: string | null
  avg_elapsed?: number | null
  platform?: string | null
  is_public?: boolean
  field_mapping: WorkflowFieldMapping[]
  concept_mapping: Record<string, string>
  supports_dynamic_concepts: boolean
  supports_txt2img: boolean
  supports_img2img: boolean
  supports_txt2vid: boolean
  supports_img2vid: boolean
  supports_vid2vid: boolean
  supports_vid2img: boolean
  supports_txt2wav: boolean
  supports_vid2wav: boolean
  supports_wav2txt: boolean
}

export interface Lora {
  id: string
  name: string
  slug: string
  description?: string
  thumbnail_url?: string | null
  compatible_workflows?: string[]
  trigger_words?: string[]
}

export interface Concept {
  concept_hash: string
  name: string
  description?: string
  example_url?: string | null
  info_url?: string | null
  is_nsfw?: boolean
  model_family?: string
  tags?: string[]
  token: string
}

export interface ParsedPrompt {
  prompt: string
  negative: string
  workflowSlug: string
  optionsDict: Record<string, string>
  optionsText: string
  initImage: string | null
}

// Commands that act as implicit workflow aliases (no /run:slug needed)
const COMMAND_WORKFLOW_ALIASES: Record<string, string> = {
  render: 'sdxl',
}

export function parseTelegramPrompt(rawInput: string, fallbackWorkflowSlug?: string): ParsedPrompt {
  let input = rawInput.trim()

  // Strip leading /wf
  input = input.replace(/^\/wf\s*/i, '')

  // Detect leading command alias e.g. /render → resolves to a workflow slug
  let workflowSlug = fallbackWorkflowSlug ?? ''
  const aliasMatch = input.match(/^\/(\w+)\b/)
  if (aliasMatch) {
    const alias = aliasMatch[1].toLowerCase()
    if (COMMAND_WORKFLOW_ALIASES[alias]) {
      workflowSlug = COMMAND_WORKFLOW_ALIASES[alias]
      input = input.slice(aliasMatch[0].length).trim()
    }
  }

  // Extract /run:<slug> (overrides alias if both present)
  const runMatch = input.match(/\/run:(\S+)/)
  if (runMatch) {
    workflowSlug = runMatch[1]
    input = input.replace(runMatch[0], '').trim()
  }

  // Extract [negative prompt]
  let negative = ''
  const negMatch = input.match(/\[([^\]]*)\]/)
  if (negMatch) {
    negative = negMatch[1].trim()
    input = input.replace(negMatch[0], '').trim()
  }

  // Extract /key:value pairs into dict
  const optionsDict: Record<string, string> = {}
  const kvRegex = /\/(\w+):(\S+)/g
  let kvMatch
  while ((kvMatch = kvRegex.exec(input)) !== null) {
    optionsDict[kvMatch[1]] = kvMatch[2]
  }
  input = input.replace(/\/\w+:\S+/g, '').trim()

  // Extract /init_image: from options so it goes into the body field, not the options string
  const initImage = optionsDict.init_image ?? null
  delete optionsDict.init_image

  // Extract concepts <name:weight> or <name> into options_text, remove from prompt
  const conceptMatches = input.match(/<[^>]+>/g) ?? []
  const optionsText = conceptMatches.join(' ')
  input = input.replace(/<[^>]+>/g, '').trim()

  const prompt = input.replace(/\s+/g, ' ').trim()

  return { prompt, negative, workflowSlug, optionsDict, optionsText, initImage }
}

export type SSEEvent =
  | { rendering_progress: { percent: number } }
  | { rendering_done: { render_hash: string } }
  | { rendering_error: { message: string } }

export interface WSRenderEvent {
  event: string
  data: Record<string, unknown>
}

/**
 * Open a WebSocket to stream render events for a known render_hash.
 * Returns a cleanup function — call it to close the socket.
 */
export function connectRenderWebSocket(
  renderHash: string,
  onEvent: (e: WSRenderEvent) => void,
  signal?: AbortSignal
): () => void {
  const url = `wss://cached.graydient.ai/render-events/${renderHash}?token=${getApiKey()}`
  let ws: WebSocket | null = null
  try {
    ws = new WebSocket(url)
  } catch {
    return () => {}
  }

  ws.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data as string) as WSRenderEvent) } catch { /* ignore */ }
  }
  ws.onerror = () => { /* silent — fallback to SSE state */ }

  const pingTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ command: 'ping' }))
    }
  }, 25000)

  const cleanup = () => {
    clearInterval(pingTimer)
    try { ws?.close() } catch { /* ignore */ }
  }

  signal?.addEventListener('abort', cleanup)
  return cleanup
}

export interface RenderMedia {
  url: string
  media_type?: string
}

export interface RenderInfo {
  render_hash: string
  images: Array<{ url?: string; media?: RenderMedia[] }>
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/vnd.api+json',
    Accept: 'application/vnd.api+json',
    Authorization: `Bearer ${getApiKey()}`,
    ...extra
  }
}

// ── Cache ────────────────────────────────────────────────────────────────────

let workflowCache: Workflow[] | null = null

// ── Public API ───────────────────────────────────────────────────────────────

export async function fetchWorkflows(): Promise<Workflow[]> {
  if (workflowCache) return workflowCache

  const res = await fetch(`${BASE_URL}workflows/`, { headers: headers() })
  if (!res.ok) throw new Error(`fetchWorkflows failed: ${res.status}`)

  const json = await res.json()

  // JSON-API envelope: { data: [ { id, attributes: {...} } ] }
  const items: Workflow[] = (json.data ?? json).map((item: { id: string; attributes: Omit<Workflow, 'id'> }) => ({
    id: item.id,
    ...(item.attributes ?? item)
  }))

  workflowCache = items
  return items
}

export async function cancelRender(renderHash: string): Promise<void> {
  // Best-effort server-side cancel — errors are silently ignored since the
  // stream is already aborted client-side regardless of this response
  try {
    await fetch(`${BASE_URL}render/${renderHash}/cancel/`, {
      method: 'POST',
      headers: headers(),
    })
  } catch {
    // ignore
  }
}

export async function fetchConcepts(modelFamily?: string, search?: string): Promise<Concept[]> {
  const params = new URLSearchParams({ per_page: '1000' })
  if (modelFamily) params.set('model_family', modelFamily)
  if (search) params.set('search', search)
  try {
    const res = await fetch(`${BASE_URL}concepts/?${params}`, { headers: headers() })
    if (!res.ok) return []
    const json = await res.json()
    const items: unknown[] = json.data ?? json
    if (!Array.isArray(items)) return []
    return items.map((item: unknown) => {
      const raw = item as Record<string, unknown>
      const attrs = (raw.attributes ?? raw) as Record<string, unknown>
      return {
        concept_hash: (attrs.concept_hash ?? raw.id ?? '') as string,
        name: (attrs.name ?? '') as string,
        description: attrs.description as string | undefined,
        example_url: attrs.example_url as string | null | undefined,
        info_url: attrs.info_url as string | null | undefined,
        is_nsfw: attrs.is_nsfw as boolean | undefined,
        model_family: attrs.model_family as string | undefined,
        tags: attrs.tags as string[] | undefined,
        token: (attrs.token ?? '') as string,
      }
    })
  } catch {
    console.warn('fetchConcepts: request failed, returning empty list')
    return []
  }
}

export async function submitRender(
  rawInput: string,
  fallbackWorkflowSlug: string | undefined,
  onEvent: (event: SSEEvent) => void,
  sourceMedia?: {
    initImage?: string
    placeholders?: Record<string, string>
    optionPairs?: string[]
  },
  signal?: AbortSignal,
  onHash?: (hash: string) => void
): Promise<void> {
  const { prompt, negative, workflowSlug, optionsDict, optionsText, initImage: parsedInitImage } =
    parseTelegramPrompt(rawInput, fallbackWorkflowSlug)

  // Build options string: /run:<slug> /key:value ...
  const kvPairs = Object.entries(optionsDict)
    .map(([k, v]) => `/${k}:${v}`)
    .join(' ')
  let optionsStr = `/run:${workflowSlug}${kvPairs ? ' ' + kvPairs : ''}`.trim()

  // Append placeholder option pairs (/image1:URL0, /image2:URL1, etc.)
  if (sourceMedia?.optionPairs?.length) {
    optionsStr += ' ' + sourceMedia.optionPairs.join(' ')
  }

  // Combine prompt + negative the way the Python SDK does
  const fullPrompt = negative ? `${prompt} [${negative}]` : prompt

  // Primary source media: explicit > parsed from raw prompt
  const effectiveInitImage = sourceMedia?.initImage ?? parsedInitImage ?? undefined

  const bodyObj: Record<string, unknown> = {
    prompt: fullPrompt,
    task: 'workflow',
    progressive_return: true,
    options_text: optionsText,
    options: optionsStr.trim(),
    placeholders: sourceMedia?.placeholders ?? {},
    stream: true,
    client_request_id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }

  if (effectiveInitImage) {
    bodyObj.init_image = effectiveInitImage
  }

  console.log('RENDER REQUEST BODY:', JSON.stringify(bodyObj, null, 2))

  // Append a nonce to the URL to prevent Chromium / proxies from coalescing
  // two concurrent POST requests with similar bodies into one response stream.
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const res = await fetch(`${BASE_URL}render/?_r=${nonce}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
      Accept: 'text/event-stream'
    },
    body: JSON.stringify(bodyObj),
    signal,
  })

  console.log('RENDER RESPONSE STATUS:', res.status)
  if (!res.ok) { const errText = await res.text(); console.log('RENDER ERROR BODY:', errText); throw new Error(errText) }
  if (!res.body) throw new Error('No response body for SSE stream')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let hashReported = false

  // If the signal fires after the response started streaming, cancel the reader
  signal?.addEventListener('abort', () => { reader.cancel() })

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const raw = line.slice(5).trim()
      if (!raw || raw === '[DONE]') continue
      try {
        const parsed = JSON.parse(raw) as SSEEvent & Record<string, unknown>
        onEvent(parsed)
        // Notify caller as soon as we see a render_hash in any SSE event
        if (onHash && !hashReported) {
          const earlyHash =
            (parsed as Record<string, unknown>).render_hash as string | undefined
            ?? ((parsed as Record<string, unknown>).rendering_done as Record<string, unknown> | undefined)?.render_hash as string | undefined
          if (earlyHash) {
            hashReported = true
            onHash(earlyHash)
          }
        }
      } catch {
        // non-JSON data line — skip
      }
    }
  }
}

export async function fetchRenderInfo(renderHash: string): Promise<RenderInfo> {
  const res = await fetch(`${BASE_URL}render/${renderHash}/`, { headers: headers(), cache: 'no-store' })
  if (!res.ok) throw new Error(`fetchRenderInfo failed: ${res.status}`)
  const json = await res.json()
  const data = (json.data?.attributes ?? json) as RenderInfo
  console.log('RENDER INFO RESPONSE:', JSON.stringify(data))
  return data
}

export interface ResolvedMedia {
  url: string
  mediaType: string | null
  thumbnailUrl: string | null
}

export function resolveMediaUrl(info: RenderInfo): ResolvedMedia | null {
  const first = info.images?.[0]
  if (!first) return null

  const thumbnailUrl = first.url ?? null

  if (first.media && first.media.length > 0) {
    const m = first.media[0]
    console.log('RESOLVED MEDIA URL (from media):', m.url, 'type:', m.media_type)
    return { url: m.url, mediaType: m.media_type ?? null, thumbnailUrl }
  }

  const url = first.url ?? null
  console.log('RESOLVED MEDIA URL (fallback):', url)
  return url ? { url, mediaType: null, thumbnailUrl: null } : null
}
