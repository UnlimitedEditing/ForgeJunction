import React, { useEffect, useState } from 'react'
import WorkflowSelector from '@/components/WorkflowSelector'
import PromptEditor from '@/components/PromptEditor'
import RenderViewer from '@/components/RenderViewer'
import StatusBar from '@/components/StatusBar'
import DebugProtocol from '@/components/DebugProtocol'
import DebugReportDialog from '@/components/DebugReportDialog'
import Onboarding from '@/components/Onboarding'
import Settings from '@/components/Settings'
import { useDebugProtocolStore } from '@/stores/debugProtocol'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import type { ThemeName } from '@/stores/theme'

function LoadingScreen(): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center bg-neutral-950 text-white">
      <div className="text-center">
        <p className="mb-2 text-sm text-neutral-400">Checking credentials...</p>
        <div className="mx-auto h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    </div>
  )
}

function MainLayout(): React.ReactElement {
  const { open: openDebug } = useDebugProtocolStore()
  const { setTheme } = useThemeStore()
  const [showSettings, setShowSettings] = useState(false)
  const [showDebugReport, setShowDebugReport] = useState(false)

  useEffect(() => {
    if (!window.electron) return
    const cleanupDebug = window.electron.onOpenDebugProtocol(() => openDebug())
    const cleanupLog = window.electron.onOpenDebugLog(() => openDebug())
    const cleanupTheme = window.electron.onThemeChange((t) => setTheme(t as ThemeName))
    const cleanupReport = window.electron.onOpenDebugReport(() => setShowDebugReport(true))
    return () => {
      cleanupDebug()
      cleanupLog()
      cleanupTheme()
      cleanupReport()
    }
  }, [openDebug, setTheme])

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-white">
      <div className="flex flex-1 min-h-0 pb-7">
        {/* Left — Workflow Selector */}
        <aside className="flex w-[220px] flex-shrink-0 flex-col border-r border-white/10 bg-panel">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="themed-heading text-xs font-semibold uppercase tracking-widest text-white/40">
              Workflows
            </span>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="text-neutral-500 hover:text-white"
              title="Settings"
            >
              ⚙
            </button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            {showSettings
              ? <div className="p-3"><Settings onClose={() => setShowSettings(false)} /></div>
              : <WorkflowSelector />
            }
          </div>
        </aside>

        {/* Center — Prompt Editor (manages its own header + scroll) */}
        <main className="flex flex-1 flex-col border-r border-white/10 bg-neutral-900 min-h-0 overflow-hidden">
          <PromptEditor />
        </main>

        {/* Right — Render Viewer */}
        <aside className="flex w-96 flex-shrink-0 flex-col bg-neutral-900">
          <div className="border-b border-white/10 px-4 py-3">
            <span className="themed-heading text-xs font-semibold uppercase tracking-widest text-white/40">
              Output
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <RenderViewer />
          </div>
        </aside>
      </div>

      <StatusBar />
      <DebugProtocol />
      <DebugReportDialog open={showDebugReport} onClose={() => setShowDebugReport(false)} />
    </div>
  )
}

export default function App(): React.ReactElement {
  const { isAuthenticated, isLoading, checkExistingKey } = useAuthStore()
  const { initTheme } = useThemeStore()

  useEffect(() => {
    initTheme()
    checkExistingKey()
  }, [initTheme, checkExistingKey])

  if (isLoading) return <LoadingScreen />
  if (!isAuthenticated) return <Onboarding />
  return <MainLayout />
}
