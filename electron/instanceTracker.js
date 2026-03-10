const { app } = require('electron')
const { randomUUID } = require('crypto')
const { join } = require('path')
const { readFileSync, writeFileSync, existsSync } = require('fs')

const TRACKER_ENDPOINT = process.env.FJ_TRACKER_URL || 'https://fj-tracker.jacobcombrink.workers.dev/ping'

let _instanceId = null

async function initInstanceTracker() {
  const idFile = join(app.getPath('userData'), 'instance-id')
  if (existsSync(idFile)) {
    _instanceId = readFileSync(idFile, 'utf-8').trim()
  } else {
    _instanceId = randomUUID()
    writeFileSync(idFile, _instanceId, 'utf-8')
  }
}

async function pingTracker(event, version) {
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
        arch: process.arch
      })
    })
  } catch (_) {
    // silently ignore network errors
  }
}

module.exports = { initInstanceTracker, pingTracker }
