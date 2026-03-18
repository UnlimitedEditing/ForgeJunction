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
import InfiniteCanvas from '@/components/canvas/InfiniteCanvas'
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
  const [showCanvas, setShowCanvas] = useState(false)
  const [chainPaneView, setChainPaneView] = useState<'workflows' | 'chain'>('workflows')
  const { activeProjectId, getActiveProject, setActiveProject } = useProjectsStore()
  const activeProject = getActiveProject()

  // Chain ↔ PromptEditor bidirectional sync
  const { selectedNodeId, nodes, updateNode: updateChainNode } = useChainGraphStore()
  const { descriptiveText, setDescriptiveText } = usePromptStore()
  const { selectedWorkflow, selectWorkflow } = useWorkflowStore()

  // Track whether a change originated from the node selection to avoid loops
  const syncingFromNodeRef = useRef(false)

  // Node selected → push prompt + workflow into editor (workflow nodes only)
  useEffect(() => {
    if (!selectedNodeId) return
    const node = nodes.find(n => n.id === selectedNodeId)
    if (!node || node.nodeType === 'media' || node.nodeType === 'annotation') return
    syncingFromNodeRef.current = true
    setDescriptiveText(node.prompt)
    selectWorkflow(node.workflowSlug)
    // Reset flag after microtask so the editor change effects don't fire
    Promise.resolve().then(() => { syncingFromNodeRef.current = false })
  }, [selectedNodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Editor prompt changed → push back into selected workflow node
  useEffect(() => {
    if (syncingFromNodeRef.current || !selectedNodeId) return
    const node = nodes.find(n => n.id === selectedNodeId)
    if (!node || node.nodeType === 'media' || node.nodeType === 'annotation') return
    updateChainNode(selectedNodeId, { prompt: descriptiveText ?? '' })
  }, [descriptiveText]) // eslint-disable-line react-hooks/exhaustive-deps

  // Editor workflow changed → push back into selected workflow node
  useEffect(() => {
    if (syncingFromNodeRef.current || !selectedNodeId || !selectedWorkflow) return
    const node = nodes.find(n => n.id === selectedNodeId)
    if (!node || node.nodeType === 'media' || node.nodeType === 'annotation') return
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

  const [mediaLibCols, setMediaLibCols] = useState(2)
  const [mediaLibSearch, setMediaLibSearch] = useState('')
  const mediaLibSearchTerm = mediaLibSearch.trim().toLowerCase()
  const showMediaLib = !showVideoEditor && !showStorage && !showProjects && !showChain

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-white">

      {/* ── Unified top bar (home view only) ── */}
      {!showVideoEditor && (
        <div className="flex items-stretch h-10 border-b border-white/10 bg-neutral-950 flex-shrink-0">

          {/* Left section — Home label + shortcut icons */}
          <div className="flex items-center gap-0.5 px-3 w-[220px] flex-shrink-0 border-r border-white/8">
            <span className="text-[11px] font-semibold text-white/40 tracking-wide mr-2 select-none">Home</span>
            <div className="w-px h-3.5 bg-white/10 mr-1" />
            {showChain && (
              <button
                onClick={() => setChainPaneView(v => v === 'chain' ? 'workflows' : 'chain')}
                className={`w-6 h-6 flex items-center justify-center rounded text-sm transition-colors ${
                  chainPaneView === 'chain' ? 'text-brand bg-brand/10' : 'text-white/35 hover:text-white hover:bg-white/8'
                }`}
                title={chainPaneView === 'chain' ? 'Switch to Workflows' : 'Switch to Chain Templates'}
              >
                {chainPaneView === 'chain' ? '◫' : '⛓'}
              </button>
            )}
            <button
              onClick={() => setShowStorage(v => !v)}
              className={`w-6 h-6 flex items-center justify-center rounded text-sm transition-colors ${showStorage ? 'text-brand bg-brand/10' : 'text-white/35 hover:text-white hover:bg-white/8'}`}
              title="Storage Manager"
            >📁</button>
            <button
              onClick={() => setShowVideoEditor(v => !v)}
              className="w-6 h-6 flex items-center justify-center rounded text-sm text-white/35 hover:text-white hover:bg-white/8 transition-colors"
              title="Video Editor"
            >✂</button>
            <button
              onClick={() => setShowChain(v => !v)}
              className={`w-6 h-6 flex items-center justify-center rounded text-sm transition-colors ${showChain ? 'text-brand bg-brand/10' : 'text-white/35 hover:text-white hover:bg-white/8'}`}
              title="Chain Builder"
            >⛓</button>
            <button
              onClick={() => setShowProjects(v => !v)}
              className={`w-6 h-6 flex items-center justify-center rounded text-sm transition-colors ${showProjects ? 'text-emerald-400 bg-emerald-900/20' : 'text-white/35 hover:text-white hover:bg-white/8'}`}
              title="Projects"
            >◫</button>
            <button
              onClick={() => setShowSettings(v => !v)}
              className={`w-6 h-6 flex items-center justify-center rounded text-sm transition-colors ${showSettings ? 'text-white/80 bg-white/8' : 'text-white/35 hover:text-white hover:bg-white/8'}`}
              title="Settings"
            >⚙</button>
            <div className="w-px h-3.5 bg-white/10 mx-0.5" />
            <button
              onClick={() => setShowCanvas(v => !v)}
              className={`w-6 h-6 flex items-center justify-center rounded text-sm transition-colors ${showCanvas ? 'text-brand bg-brand/10' : 'text-white/35 hover:text-white hover:bg-white/8'}`}
              title="Canvas Workspace"
            >⬡</button>
          </div>

          {/* Center section — resize + search (media library) or view label */}
          <div className="flex-1 flex items-center gap-2 px-3 border-r border-white/8 min-w-0">
            {showMediaLib ? (
              <>
                {/* Resize icon */}
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 text-white/25" aria-hidden>
                  <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                  <rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1" fill="currentColor" opacity="0.55"/>
                </svg>
                {/* Slider */}
                <input
                  type="range" min={2} max={5} step={1}
                  value={mediaLibCols}
                  onChange={e => setMediaLibCols(parseInt(e.target.value))}
                  className="w-14 flex-shrink-0 accent-brand cursor-pointer"
                  title={`${mediaLibCols} columns`}
                />
                {/* Search */}
                <div className="relative flex-1 min-w-0">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/20 text-[11px] pointer-events-none select-none">⌕</span>
                  <input
                    type="text"
                    value={mediaLibSearch}
                    onChange={e => setMediaLibSearch(e.target.value)}
                    placeholder="Search prompts…"
                    className="w-full rounded-md bg-white/5 pl-5.5 pr-5 py-1 text-[11px] text-white placeholder-white/20 outline-none focus:bg-white/8 transition-colors"
                    style={{ paddingLeft: '1.4rem' }}
                  />
                  {mediaLibSearch && (
                    <button
                      onClick={() => setMediaLibSearch('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55 text-[10px] transition-colors"
                      title="Clear"
                    >✕</button>
                  )}
                </div>
                {mediaLibSearchTerm && (
                  <span className="text-[10px] text-white/25 flex-shrink-0 tabular-nums select-none">
                    {/* count rendered inside grid, just show indicator */}
                    ↳
                  </span>
                )}
              </>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25 select-none">
                {showStorage ? 'Storage' : showProjects ? 'Projects' : showChain ? 'Chain Builder' : ''}
              </span>
            )}
          </div>

          {/* Right section — Output label */}
          <div className="w-96 flex-shrink-0 flex items-center px-4">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30 select-none">
              Output History
            </span>
            {activeProject && (
              <div className="flex items-center gap-1.5 ml-auto">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-[10px] text-emerald-400/60 truncate max-w-[100px]" title={activeProject.name}>
                  {activeProject.name}
                </span>
                <button
                  onClick={() => setActiveProject(null)}
                  className="text-[9px] text-emerald-400/25 hover:text-emerald-400/60 transition-colors"
                  title="Deactivate project"
                >✕</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Canvas workspace */}
      {showCanvas && (
        <div className="flex-1 min-h-0">
          <InfiniteCanvas onOpenSettings={() => setShowSettings(true)} />
        </div>
      )}

      <div className={`flex flex-1 min-h-0 pb-7 ${showCanvas ? 'hidden' : ''}`}>
        {/* Left — workflow selector (hidden when video editor is open) */}
        {!showVideoEditor && (
          <aside className="flex w-[220px] flex-shrink-0 flex-col border-r border-white/10 bg-panel">
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

        {/* Video editor — full width when open */}
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
                    : <MediaLibraryGrid cols={mediaLibCols} search={mediaLibSearch} />
              }
              {!showStorage && (
                <div className="absolute bottom-0 left-0 right-0 z-10">
                  <PromptEditor />
                </div>
              )}
            </main>

            {/* Right — Render Viewer */}
            <aside className="flex w-96 flex-shrink-0 flex-col bg-neutral-900">
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
