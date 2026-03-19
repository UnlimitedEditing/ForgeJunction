import React, { useState } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

interface SettingsProps {
  onClose: () => void
}

export default function Settings({ onClose }: SettingsProps): React.ReactElement {
  const { apiKey, logout, login } = useAuthStore()
  const { hideNsfw, setHideNsfw } = useSettingsStore()

  const [showChangeDialog, setShowChangeDialog] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [showNewKey, setShowNewKey] = useState(false)
  const [changeStatus, setChangeStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle')
  const [changeError, setChangeError] = useState<string | null>(null)

  const maskedKey = apiKey
    ? `${apiKey.slice(0, 6)}${'•'.repeat(Math.max(0, apiKey.length - 6))}`
    : null

  async function handleDisconnect() {
    await logout()
    onClose()
  }

  async function handleChangeKey() {
    if (!newKey.trim()) return
    setChangeStatus('validating')
    setChangeError(null)
    const ok = await login(newKey.trim())
    if (ok) {
      setChangeStatus('success')
      setTimeout(() => {
        setShowChangeDialog(false)
        setNewKey('')
        setChangeStatus('idle')
      }, 1000)
    } else {
      setChangeStatus('error')
      setChangeError(useAuthStore.getState().error)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-neutral-900 p-5 shadow-[0_40px_80px_rgba(0,0,0,0.6)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Settings</h2>
        <button onClick={onClose} className="text-neutral-400 hover:text-white">✕</button>
      </div>

      <div className="flex flex-col gap-3">

        {/* ── API Key ── */}
        <div className="rounded border border-white/10 bg-neutral-800 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
            API Key
          </p>

          <div className="flex items-center gap-2 text-sm mb-2">
            <span className="text-green-400">✓</span>
            <span className="text-neutral-300">Connected</span>
          </div>

          {maskedKey && (
            <p className="mb-4 font-mono text-xs text-neutral-400 truncate" title={maskedKey}>
              Key: {maskedKey}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShowChangeDialog((v) => !v)}
              className="w-full rounded bg-neutral-700 px-3 py-2 text-xs text-white hover:bg-neutral-600 text-left"
            >
              Change Key
            </button>
            <button
              onClick={handleDisconnect}
              className="w-full rounded px-3 py-2 text-xs text-red-400 hover:bg-red-950/40 text-left"
            >
              Disconnect
            </button>
          </div>

          {showChangeDialog && (
            <div className="mt-4 border-t border-white/10 pt-4 flex flex-col gap-2">
              <p className="text-xs text-neutral-300">Enter new API key:</p>
              <div className="relative">
                <input
                  type={showNewKey ? 'text' : 'password'}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleChangeKey()}
                  placeholder="paste new key..."
                  disabled={changeStatus === 'validating' || changeStatus === 'success'}
                  className="w-full rounded border border-white/10 bg-neutral-700 px-3 py-2 pr-10 text-sm text-white placeholder-neutral-500 focus:border-brand focus:outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowNewKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                  tabIndex={-1}
                >
                  {showNewKey ? '🙈' : '👁'}
                </button>
              </div>
              <button
                onClick={handleChangeKey}
                disabled={!newKey.trim() || changeStatus === 'validating' || changeStatus === 'success'}
                className="w-full rounded bg-brand px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                {changeStatus === 'validating' ? 'Validating...' : 'Save Key'}
              </button>
              {changeStatus === 'success' && (
                <p className="text-xs text-green-400">✓ Key updated!</p>
              )}
              {changeStatus === 'error' && changeError && (
                <p className="text-xs text-red-400">✗ {changeError}</p>
              )}
            </div>
          )}

          <p className="mt-4 text-xs text-neutral-500">
            🔒 Key is encrypted and stored securely on this machine
          </p>
        </div>

        {/* ── Content ── */}
        <div className="rounded border border-white/10 bg-neutral-800 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
            Content
          </p>

          <div className="flex flex-col gap-3">
            {/* NSFW toggle row */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-neutral-300 font-medium">Hide NSFW media</p>
                <button
                  role="switch"
                  aria-checked={hideNsfw}
                  onClick={() => setHideNsfw(!hideNsfw)}
                  className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${
                    hideNsfw ? 'bg-brand' : 'bg-neutral-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                      hideNsfw ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-neutral-500">
                Filter and blur renders tagged as NSFW in the media library and output history
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs text-neutral-500">
            Tag renders with 🔞 via the media library or output history panel.
          </p>
        </div>

      </div>
    </div>
  )
}
