import { app } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const TRACKER_ENDPOINT = process.env.FJ_TRACKER_URL || 'https://fj-tracker.jacobcombrink.workers.dev/ping'

let _instanceId: string | null = null

export async function initInstanceTracker(): Promise<void> {
  const idFile = join(app.getPath('userData'), 'instance-id')
  if (existsSync(idFile)) {
    _instanceId = readFileSync(idFile, 'utf-8').trim()
  } else {
    _instanceId = randomUUID()
    writeFileSync(idFile, _instanceId, 'utf-8')
  }
}

export async function pingTracker(event: string, version?: string): Promise<void> {
  if (!_instanceId) return
  if (!app.isPackaged) return
  try {
    await fetch(TRACKER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instanceId: _instanceId,
        event,
        version: version ?? app.getVersion(),
        platform: process.platform,
        arch: process.arch,
      }),
    })
  } catch {
    // silently ignore network errors
  }
}
