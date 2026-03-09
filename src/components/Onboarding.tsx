import React, { useState } from 'react'
import { useAuthStore } from '@/stores/auth'

export default function Onboarding(): React.ReactElement {
  const { login, error: storeError, checkExistingKey } = useAuthStore()
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [status, setStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle')
  const [localError, setLocalError] = useState<string | null>(null)

  const displayError = localError ?? storeError

  async function handleConnect() {
    if (!key.trim()) return
    setStatus('validating')
    setLocalError(null)
    const ok = await login(key.trim())
    if (ok) {
      setStatus('success')
      // App.tsx will re-render to main layout once isAuthenticated flips
    } else {
      setStatus('error')
      setLocalError(useAuthStore.getState().error)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleConnect()
  }

  function openLink(url: string) {
    window.electron.openExternal(url)
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-4 text-white overflow-hidden">
      {/* Radial glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgb(var(--brand) / 0.10), transparent)' }}
      />

      <div className="relative w-full max-w-[500px]">

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-1 font-bebas text-6xl uppercase tracking-wider text-white">Forge Junction</h1>
          <p className="font-mono text-xs text-muted">powered by Graydient.ai</p>
        </div>

        <div className="mb-6 border-t border-white/10" />

        <p className="mb-6 text-center text-sm text-neutral-300">
          Welcome! Connect your Graydient account to start creating.
        </p>

        {/* Key entry card */}
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <p className="mb-3 text-sm font-medium text-neutral-200">Enter your API key</p>

          {/* Show existing-key-invalid message if present */}
          {storeError && status === 'idle' && (
            <p className="mb-3 text-xs text-yellow-400">{storeError}</p>
          )}

          <div className="relative mb-4">
            <input
              type={showKey ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="paste your key here..."
              disabled={status === 'validating' || status === 'success'}
              className="w-full rounded border border-white/10 bg-neutral-800 px-3 py-2 pr-10 text-sm text-white placeholder-neutral-500 focus:border-brand focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
              tabIndex={-1}
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>

          <button
            onClick={handleConnect}
            disabled={!key.trim() || status === 'validating' || status === 'success'}
            className="mb-3 w-full rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {status === 'validating' ? 'Validating...' : 'Connect'}
          </button>

          {/* Status feedback */}
          {status === 'validating' && (
            <p className="text-xs text-neutral-400">⟳ Checking your key...</p>
          )}
          {status === 'success' && (
            <p className="text-xs text-green-400">✓ Connected! Loading...</p>
          )}
          {status === 'error' && displayError && (
            <p className="text-xs text-red-400">✗ {displayError}</p>
          )}
          {status === 'error' && storeError && (
            <button
              onClick={() => { setStatus('idle'); checkExistingKey() }}
              className="mt-2 text-xs text-neutral-400 underline hover:text-white"
            >
              Try again with existing key
            </button>
          )}
        </div>

        <div className="my-6 border-t border-white/10" />

        {/* How to get a key */}
        <div className="mb-6 text-sm text-neutral-400">
          <p className="mb-3 font-medium text-neutral-300">How to get your API key:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Open Telegram and message{' '}
              <button
                onClick={() => openLink('https://t.me/PirateDiffusion_bot')}
                className="text-brand underline hover:brightness-125"
              >
                @PirateDiffusion_bot
              </button>
            </li>
            <li>Send the command: <code className="rounded bg-neutral-800 px-1">/api</code></li>
            <li>The bot will reply with a link to your API key</li>
            <li>Copy the key and paste it above</li>
          </ol>
        </div>

        <div className="mb-6 border-t border-white/10" />

        {/* Register / support */}
        <div className="mb-6 space-y-1.5 text-sm text-neutral-400">
          <p className="font-medium text-neutral-300">Don't have an account yet?</p>
          <p>
            →{' '}
            <button
              onClick={() => openLink('https://graydient.ai')}
              className="text-brand underline hover:brightness-125"
            >
              Register at graydient.ai
            </button>
          </p>
          <p>
            → Need help? Message{' '}
            <button
              onClick={() => openLink('https://t.me/UnlimitedEditing')}
              className="text-brand underline hover:brightness-125"
            >
              @UnlimitedEditing
            </button>{' '}
            on Telegram
          </p>
        </div>

        <div className="mb-6 border-t border-white/10" />

        {/* Security notice */}
        <div
          className="rounded-lg p-4"
          style={{ background: 'rgb(var(--arc) / 0.05)', border: '1px solid rgb(var(--arc) / 0.12)' }}
        >
          <p className="font-mono text-xs leading-relaxed text-muted">
            🔒 Your API key is encrypted and stored securely on{' '}
            <span style={{ color: 'rgb(var(--arc))' }}>this machine only</span>. It cannot be
            accessed if someone copies this application to{' '}
            <span style={{ color: 'rgb(var(--arc))' }}>another computer</span>.
          </p>
        </div>
      </div>
    </div>
  )
}
