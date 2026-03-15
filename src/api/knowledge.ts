import { useAuthStore } from '@/stores/auth'

const KB_BASE = 'https://caPxkya125x.graydient.ai/api/v3'

/** The knowledge domain backing Sage chat. */
export const SAGE_DOMAIN = 'forgejunction'

function getKey(): string {
  return useAuthStore.getState().apiKey ?? ''
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KBChatSource {
  id: string
  document: string
  distance: number
}

export interface KBChatResponse {
  domain: string
  query: string
  response: string
  sources: KBChatSource[]
}

// ── API calls ─────────────────────────────────────────────────────────────────

/** Send a message to the knowledge base chatbot. */
export async function kbChat(domain: string, query: string): Promise<KBChatResponse> {
  const res = await fetch(`${KB_BASE}/knowledge/${domain}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getKey()}`,
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Knowledge chat failed (${res.status})${text ? ': ' + text : ''}`)
  }
  const json = await res.json()
  return json.data as KBChatResponse
}
