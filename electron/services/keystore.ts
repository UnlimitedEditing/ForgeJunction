import { safeStorage, app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'

const KEY_FILE = join(app.getPath('userData'), 'config', 'credentials.enc')

export function isApiKeyStored(): boolean {
  return existsSync(KEY_FILE)
}

export function storeApiKey(key: string): void {
  const dir = join(app.getPath('userData'), 'config')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[keystore] safeStorage not available — using base64 obfuscation (not fully secure)')
    const obfuscated = Buffer.from(key).toString('base64')
    writeFileSync(KEY_FILE, obfuscated, 'utf-8')
    return
  }

  const encrypted = safeStorage.encryptString(key)
  writeFileSync(KEY_FILE, encrypted)
}

export function retrieveApiKey(): string | null {
  if (!existsSync(KEY_FILE)) return null

  try {
    const data = readFileSync(KEY_FILE)

    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(data)
    } else {
      return Buffer.from(data.toString('utf-8'), 'base64').toString('utf-8')
    }
  } catch {
    // Encrypted by a different machine/user — not portable
    return null
  }
}

export function deleteApiKey(): void {
  if (existsSync(KEY_FILE)) {
    unlinkSync(KEY_FILE)
  }
}
