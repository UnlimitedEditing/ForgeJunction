import React, { useEffect, useRef, useState } from 'react'
import WorkflowSelector from '@/components/WorkflowSelector'
import PromptEditor from '@/components/PromptEditor'
import MediaLibraryGrid from '@/components/MediaLibraryGrid'
import RenderViewer from '@/components/RenderViewer'
import StatusBar from '@/components/StatusBar'
import DebugProtocol from '@/components/DebugProtocol'
import DebugReportDialog from '@/components/DebugReportDialog'
import UpdateManager from '@/components/UpdateManager'
import Onboarding from '@/components/Onboarding'
import Settings from '@/components/Settings'
import ChainGraphEditor from '@/components/ChainGraphEditor'
import ChainTemplatePane from '@/components/ChainTemplatePane'
import VideoEditor from '@/components/VideoEditor'
import StorageManager from '@/components/StorageManager'
import ProjectManager from '@/components/ProjectManager'
import { useProjectsStore } from '@/stores/projects'
import SagePane from '@/components/SagePane'
import { useDebugProtocolStore } from '@/stores/debugProtocol'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { useChainGraphStore } from '@/stores/chainGraph'
import { usePromptStore } from '@/stores/prompt'
import { useWorkflowStore } from '@/stores/workflows'
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
  const [showChain, setShowChain] = useState(false)
  const [showVideoEditor, setShowVideoEditor] = useState(false)
  const [showStorage, setShowStorage] = useState(false)
  const [showProjects, setShowProjects] = useState(false)
  const [chainPaneView, setChainPaneView] = useState<'workflows' | 'chain'>('workflows')
  const { activeProjectId, getActiveProject, setActiveProject } = useProjectsStore()
  const activeProject = getActiveProject()

  // Chain ↔ PromptEditor bidirectional sync
  const { selectedNodeId, nodes, updateNode: updateChainNode } = useChainGraphStore()
  const { descriptiveText, setDescriptiveText } = usePromptStore()
  const { selectedWorkflow, selectWorkflow } = useWorkflowStore()

  // Track whether a change originated from the node selection to avoid loops
  const syncingFromNodeRef = useRef(false)

  // Node selected → push prompt + workflow into editor
  useEffect(() => {
    if (!selectedNodeId) return
    const node = nodes.find(n => n.id === selectedNodeId)
    if (!node) return
    syncingFromNodeRef.current = true
    setDescriptiveText(node.prompt)
    selectWorkflow(node.workflowSlug)
    // Reset flag after microtask so the editor change effects don't fire
    Promise.resolve().then(() => { syncingFromNodeRef.current = false })
  }, [selectedNodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Editor prompt changed → push back into selected node
  useEffect(() => {
    if (syncingFromNodeRef.current || !selectedNodeId) return
    updateChainNode(selectedNodeId, { prompt: descriptiveText ?? '' })
  }, [descriptiveText]) // eslint-disable-line react-hooks/exhaustive-deps

  // Editor workflow changed → push back into selected node
  useEffect(() => {
    if (syncingFromNodeRef.current || !selectedNodeId || !selectedWorkflow) return
    updateChainNode(selectedNodeId, { workflowSlug: selectedWorkflow.slug, workflowName: selectedWorkflow.name })
  }, [selectedWorkflow?.slug]) // eslint-disable-line react-hooks/exhaustive-deps

  // showChain toggles → sync chainPaneView
  useEffect(() => {
    if (showChain) setChainPaneView('chain')
    else setChainPaneView('workflows')
  }, [showChain])

  // When a node is selected in chain mode, switch sidebar to workflows (prompt editor)
  useEffect(() => {
    if (showChain && selectedNodeId) setChainPaneView('workflows')
  }, [showChain, selectedNodeId])

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
        {/* Left — workflow selector (hidden when video editor is open) */}
        {!showVideoEditor && (
          <aside className="flex w-[220px] flex-shrink-0 flex-col border-r border-white/10 bg-panel">
            <div className="flex items-center justify-end border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-1">
                {showChain && (
                  <button
                    onClick={() => setChainPaneView(v => v === 'chain' ? 'workflows' : 'chain')}
                    className={`text-xs rounded px-1.5 py-0.5 transition-colors ${
                      chainPaneView === 'chain'
                        ? 'text-brand bg-brand/10'
                        : 'text-neutral-500 hover:text-white'
                    }`}
                    title={chainPaneView === 'chain' ? 'Switch to Workflows' : 'Switch to Chain Templates'}
                  >
                    {chainPaneView === 'chain' ? '◫' : '⛓'}
                  </button>
                )}
                <button
                  onClick={() => setShowStorage(v => !v)}
                  className={`text-neutral-500 hover:text-white transition-colors ${showStorage ? 'text-brand' : ''}`}
                  title={showStorage ? 'Close Storage' : 'Storage Manager'}
                >
                  📁
                </button>
                <button
                  onClick={() => setShowVideoEditor(v => !v)}
                  className="text-neutral-500 hover:text-white transition-colors"
                  title="Video Editor"
                >
                  ✂
                </button>
                <button
                  onClick={() => setShowChain(v => !v)}
                  className={`text-neutral-500 hover:text-white transition-colors ${showChain ? 'text-brand' : ''}`}
                  title={showChain ? 'Close Chain Builder' : 'Chain Builder'}
                >
                  ⛓
                </button>
                <button
                  onClick={() => setShowProjects(v => !v)}
                  className={`text-neutral-500 hover:text-white transition-colors ${showProjects ? 'text-emerald-400' : ''}`}
                  title={showProjects ? 'Close Projects' : 'Projects'}
                >
                  ◫
                </button>
                <button
                  onClick={() => setShowSettings((v) => !v)}
                  className="text-neutral-500 hover:text-white"
                  title="Settings"
                >
                  ⚙
                </button>
              </div>
            </div>
            {activeProject && (
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/8 bg-emerald-950/20 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-[10px] text-emerald-400/70 truncate flex-1" title={activeProject.name}>
                  {activeProject.name}
                </span>
                <button
                  onClick={() => setActiveProject(null)}
                  className="text-[9px] text-emerald-400/30 hover:text-emerald-400/70 transition-colors shrink-0"
                  title="Deactivate project (new renders won't be added)"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="flex-1 overflow-hidden min-h-0">
              {showSettings
                ? <div className="p-3"><Settings onClose={() => setShowSettings(false)} /></div>
                : showChain && chainPaneView === 'chain'
                  ? <ChainTemplatePane />
                  : <WorkflowSelector />
              }
            </div>
          </aside>
        )}

        {/* Video editor — full width when open, passing home callback */}
        {showVideoEditor ? (
          <div className="flex flex-1 min-w-0 min-h-0">
            <VideoEditor onClose={() => setShowVideoEditor(false)} />
          </div>
        ) : (
          <>
            {/* Center — Media Library / Chain Builder / Storage Manager + floating Prompt Editor */}
            <main className="flex flex-1 flex-col border-r border-white/10 bg-neutral-900 min-h-0 overflow-hidden relative">
              {showStorage
                ? <StorageManager onClose={() => setShowStorage(false)} />
                : showProjects
                  ? <ProjectManager onClose={() => setShowProjects(false)} />
                  : showChain
                    ? <ChainGraphEditor onClose={() => setShowChain(false)} />
                    : <MediaLibraryGrid />
              }
              {!showStorage && (
                <div className="absolute bottom-0 left-0 right-0 z-10">
                  <PromptEditor />
                </div>
              )}
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
          </>
        )}
      </div>

      <StatusBar />
      <SagePane />
      <DebugProtocol />
      <DebugReportDialog open={showDebugReport} onClose={() => setShowDebugReport(false)} />
      <UpdateManager />
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
