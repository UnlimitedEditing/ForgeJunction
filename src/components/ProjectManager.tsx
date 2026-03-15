import React, { useState } from 'react'
import { useProjectsStore, DIMENSION_PRESETS, type Project, type ProjectRender, type ProjectDimensions } from '@/stores/projects'
import { useVideoEditorStore } from '@/stores/videoEditor'

// Helper: find preset label for a given dimensions value
function dimLabel(dim: ProjectDimensions | null | undefined): string {
  if (!dim) return 'No constraint'
  const preset = DIMENSION_PRESETS.find(p => p.value?.width === dim.width && p.value?.height === dim.height)
  return preset ? preset.label : `${dim.width}×${dim.height}`
}

// ── Render card inside project ────────────────────────────────────────────────

function RenderCard({
  render, index, total, projectId,
}: {
  render: ProjectRender; index: number; total: number; projectId: string
}): React.ReactElement {
  const { removeRenderFromProject, reorderRender } = useProjectsStore()
  const isVideo = render.mediaType === 'video'
  const isAudio = render.mediaType === 'audio'

  return (
    <div className="relative rounded-lg overflow-hidden bg-neutral-800 border border-white/8 group">
      {/* Sequence number */}
      <div className="absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded-full bg-black/75 text-[9px] font-bold text-white/70 flex items-center justify-center leading-none">
        {index + 1}
      </div>

      {/* Media type badge */}
      <div className={`absolute top-1.5 right-1.5 z-10 text-[8px] font-mono px-1 py-0.5 rounded leading-none ${
        isVideo ? 'bg-brand/80 text-white' : isAudio ? 'bg-purple-500/80 text-white' : 'bg-neutral-600/80 text-white/50'
      }`}>
        {isVideo ? 'VID' : isAudio ? 'AUD' : 'IMG'}
      </div>

      {/* Thumbnail */}
      <div className="aspect-square bg-neutral-700/50">
        {render.thumbnailUrl ? (
          <img src={render.thumbnailUrl} alt={render.workflowSlug} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/15 text-3xl">
            {isVideo ? '▶' : isAudio ? '♪' : '□'}
          </div>
        )}
      </div>

      {/* Slug */}
      <div className="px-2 py-1.5">
        <p className="text-[10px] text-white/50 font-mono truncate" title={render.workflowSlug}>
          {render.workflowSlug || '—'}
        </p>
      </div>

      {/* Reorder / remove controls — reveal on hover */}
      <div className="absolute inset-x-0 bottom-[30px] flex items-center justify-between px-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/70 to-transparent pt-4">
        <button
          onClick={() => reorderRender(projectId, index, index - 1)}
          disabled={index === 0}
          className="w-6 h-6 rounded bg-black/70 text-white/60 hover:text-white disabled:opacity-20 text-xs flex items-center justify-center"
          title="Move earlier"
        >←</button>
        <button
          onClick={() => removeRenderFromProject(projectId, render.id)}
          className="w-6 h-6 rounded bg-black/70 text-red-400/70 hover:text-red-400 text-xs flex items-center justify-center"
          title="Remove from project"
        >✕</button>
        <button
          onClick={() => reorderRender(projectId, index, index + 1)}
          disabled={index === total - 1}
          className="w-6 h-6 rounded bg-black/70 text-white/60 hover:text-white disabled:opacity-20 text-xs flex items-center justify-center"
          title="Move later"
        >→</button>
      </div>
    </div>
  )
}

// ── Project list item ─────────────────────────────────────────────────────────

function ProjectListItem({
  project, isActive, isViewed, onView, onActivate, onRename, onDelete,
}: {
  project: Project
  isActive: boolean
  isViewed: boolean
  onView: () => void
  onActivate: () => void
  onRename: (name: string) => void
  onDelete: () => void
}): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(project.name)

  function commitRename() {
    if (draft.trim()) onRename(draft.trim())
    setEditing(false)
  }

  const videoCount = project.renders.filter(r => r.mediaType === 'video').length

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer rounded-lg transition-colors ${
        isViewed ? 'bg-white/8' : 'hover:bg-white/5'
      }`}
      onClick={onView}
    >
      {/* Active dot */}
      <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
        isActive ? 'bg-emerald-400' : 'bg-white/10 group-hover:bg-white/20'
      }`} title={isActive ? 'Active project' : 'Click ⊙ to set active'} />

      {/* Name / edit */}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') { setDraft(project.name); setEditing(false) }
          }}
          onBlur={commitRename}
          className="flex-1 bg-neutral-700 rounded px-1.5 py-0.5 text-xs text-white outline-none ring-1 ring-brand min-w-0"
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span
          className="flex-1 text-xs text-white/80 truncate leading-snug"
          onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}
          title="Double-click to rename"
        >
          {project.name}
        </span>
      )}

      {/* Stats */}
      <span className="text-[10px] text-white/25 shrink-0">
        {project.renders.length}
        {videoCount > 0 && <span className="text-brand/50"> / {videoCount}v</span>}
      </span>

      {/* Actions — revealed on hover */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
        {!isActive && (
          <button
            onClick={onActivate}
            className="text-[9px] px-1 py-0.5 rounded text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-900/20 transition-colors"
            title="Set as active project"
          >
            ⊙
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-[9px] px-1 py-0.5 rounded text-red-400/40 hover:text-red-400 hover:bg-red-900/20 transition-colors"
          title="Delete project"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ── ProjectManager ────────────────────────────────────────────────────────────

export default function ProjectManager({ onClose }: { onClose: () => void }): React.ReactElement {
  const {
    projects, activeProjectId,
    createProject, deleteProject, renameProject, setActiveProject, setProjectDimensions,
  } = useProjectsStore()
  const { addClip, clearEditor } = useVideoEditorStore()

  const [viewedProjectId, setViewedProjectId] = useState<string | null>(
    activeProjectId ?? projects[0]?.id ?? null
  )
  const [creatingInline, setCreatingInline] = useState(false)
  const [creatingName, setCreatingName] = useState('')
  const [creatingDimensions, setCreatingDimensions] = useState<ProjectDimensions | null>(null)
  const [importFeedback, setImportFeedback] = useState<string | null>(null)

  const viewedProject = projects.find(p => p.id === viewedProjectId) ?? null

  function handleCreate() {
    const name = creatingName.trim() || `Project ${projects.length + 1}`
    const id = createProject(name, creatingDimensions)
    setViewedProjectId(id)
    setActiveProject(id)
    setCreatingName('')
    setCreatingDimensions(null)
    setCreatingInline(false)
  }

  function importVideos(replace: boolean) {
    if (!viewedProject) return
    const clips = viewedProject.renders.filter(r => (r.mediaType === 'video' || r.mediaType === 'image') && r.resultUrl)
    if (clips.length === 0) return
    if (replace) clearEditor()
    for (const r of clips) {
      addClip(r.resultUrl!, r.prompt, r.workflowSlug, r.mediaType as 'video' | 'image')
    }
    const msg = replace
      ? `Replaced timeline with ${clips.length} clip${clips.length !== 1 ? 's' : ''}`
      : `Added ${clips.length} clip${clips.length !== 1 ? 's' : ''} to timeline`
    setImportFeedback(msg)
    setTimeout(() => setImportFeedback(null), 3000)
  }

  const videoCount   = viewedProject?.renders.filter(r => r.mediaType === 'video').length ?? 0
  const imageCount   = viewedProject?.renders.filter(r => r.mediaType === 'image').length ?? 0
  const totalRenders = viewedProject?.renders.length ?? 0
  const importableCount = videoCount + imageCount

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-white">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-neutral-900/95 px-4 py-2 flex-shrink-0">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/40">Projects</span>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-white/30 hover:text-white hover:bg-white/8 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {/* Left — project list */}
        <div className="flex flex-col w-52 shrink-0 border-r border-white/10 bg-neutral-900/50 min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0 p-2 flex flex-col gap-0.5">
            {projects.length === 0 && !creatingInline && (
              <p className="text-[11px] text-white/25 text-center py-4 px-3">
                No projects yet.
              </p>
            )}
            {projects.map(p => (
              <ProjectListItem
                key={p.id}
                project={p}
                isActive={p.id === activeProjectId}
                isViewed={p.id === viewedProjectId}
                onView={() => setViewedProjectId(p.id)}
                onActivate={() => setActiveProject(p.id)}
                onRename={name => renameProject(p.id, name)}
                onDelete={() => {
                  if (viewedProjectId === p.id) setViewedProjectId(projects.find(x => x.id !== p.id)?.id ?? null)
                  deleteProject(p.id)
                }}
              />
            ))}

            {/* Tapered divider — only when there are existing projects */}
            {projects.length > 0 && (
              <div className="relative my-2 flex items-center px-2">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>
            )}

            {/* Inline create input or centered + button */}
            {creatingInline ? (
              <div className="flex flex-col gap-1 px-1 pb-1">
                <input
                  autoFocus
                  value={creatingName}
                  onChange={e => setCreatingName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') { setCreatingInline(false); setCreatingName(''); setCreatingDimensions(null) }
                  }}
                  onBlur={() => { if (!creatingName.trim()) { setCreatingInline(false); setCreatingDimensions(null) } }}
                  placeholder="Project name…"
                  className="w-full rounded bg-neutral-800 px-2 py-1.5 text-[11px] text-white placeholder-white/20 outline-none ring-1 ring-brand min-w-0"
                />
                <div className="flex gap-1">
                  <select
                    value={creatingDimensions ? `${creatingDimensions.width}x${creatingDimensions.height}` : ''}
                    onChange={e => {
                      const preset = DIMENSION_PRESETS.find(p => p.value && `${p.value.width}x${p.value.height}` === e.target.value)
                      setCreatingDimensions(preset?.value ?? null)
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    className="flex-1 rounded bg-neutral-800 border border-white/10 px-1.5 py-1 text-[10px] text-white/70 outline-none focus:border-brand/60 min-w-0"
                  >
                    <option value="">No size constraint</option>
                    {['Landscape', 'Portrait', 'Square'].map(group => (
                      <optgroup key={group} label={group}>
                        {DIMENSION_PRESETS.filter(p => p.group === group).map(p => (
                          <option key={`${p.value!.width}x${p.value!.height}`} value={`${p.value!.width}x${p.value!.height}`}>
                            {p.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={handleCreate}
                    className="rounded bg-brand/20 border border-brand/30 px-2 py-1 text-xs text-brand hover:bg-brand/30 transition-colors flex-shrink-0"
                  >
                    ✓
                  </button>
                </div>
              </div>
            ) : (
              <div className={`flex justify-center ${projects.length === 0 ? 'flex-1 items-center py-4' : 'py-1'}`}>
                <button
                  onClick={() => setCreatingInline(true)}
                  className="w-9 h-9 rounded-full bg-brand/15 border border-brand/30 text-brand text-xl hover:bg-brand/25 flex items-center justify-center transition-colors leading-none"
                  title="Create new project"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right — project detail */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {!viewedProject ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-white/20 text-sm">Select a project to view its renders</p>
            </div>
          ) : (
            <>
              {/* Project header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8 shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white/90">{viewedProject.name}</h2>
                    {viewedProject.id === activeProjectId && (
                      <span className="text-[9px] font-mono bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 px-1.5 py-0.5 rounded-full leading-none">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/30 mt-0.5">
                    {totalRenders} render{totalRenders !== 1 ? 's' : ''}
                    {videoCount > 0 && ` · ${videoCount} video${videoCount !== 1 ? 's' : ''}`}
                    {imageCount > 0 && ` · ${imageCount} image${imageCount !== 1 ? 's' : ''}`}
                  </p>
                </div>

                {/* Dimension picker */}
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] text-white/25 uppercase tracking-widest">Size</label>
                  <select
                    value={viewedProject.dimensions ? `${viewedProject.dimensions.width}x${viewedProject.dimensions.height}` : ''}
                    onChange={e => {
                      const preset = DIMENSION_PRESETS.find(p => p.value && `${p.value.width}x${p.value.height}` === e.target.value)
                      setProjectDimensions(viewedProject.id, preset?.value ?? null)
                    }}
                    className="rounded bg-neutral-800 border border-white/10 px-2 py-1 text-[10px] text-white/70 outline-none focus:border-brand/60 hover:border-white/20 transition-colors"
                    title={`Current: ${dimLabel(viewedProject.dimensions)}`}
                  >
                    <option value="">No constraint</option>
                    {['Landscape', 'Portrait', 'Square'].map(group => (
                      <optgroup key={group} label={group}>
                        {DIMENSION_PRESETS.filter(p => p.group === group).map(p => (
                          <option key={`${p.value!.width}x${p.value!.height}`} value={`${p.value!.width}x${p.value!.height}`}>
                            {p.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="flex-1" />

                {/* Video Editor import actions */}
                {importableCount > 0 && (
                  <div className="flex items-center gap-2">
                    {importFeedback ? (
                      <span className="text-[10px] text-emerald-400">{importFeedback}</span>
                    ) : (
                      <>
                        <button
                          onClick={() => importVideos(false)}
                          className="rounded px-2.5 py-1.5 text-xs bg-brand/15 border border-brand/30 text-brand hover:bg-brand/25 transition-colors"
                          title="Append project media to the video editor timeline in sequence"
                        >
                          ▶ Append {importableCount} clip{importableCount !== 1 ? 's' : ''} to Editor
                        </button>
                        <button
                          onClick={() => importVideos(true)}
                          className="rounded px-2.5 py-1.5 text-xs bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80 transition-colors"
                          title="Clear the video editor timeline and import project media in sequence"
                        >
                          ↺ Replace Timeline
                        </button>
                      </>
                    )}
                  </div>
                )}

                {viewedProject.id !== activeProjectId && (
                  <button
                    onClick={() => setActiveProject(viewedProject.id)}
                    className="rounded px-2.5 py-1.5 text-xs bg-emerald-900/20 border border-emerald-500/20 text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-900/30 transition-colors"
                  >
                    Set Active
                  </button>
                )}
              </div>

              {/* Renders grid */}
              {viewedProject.renders.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-white/20 text-sm">No renders yet</p>
                    {viewedProject.id !== activeProjectId ? (
                      <p className="text-white/15 text-xs mt-1">Set this project as active to capture renders</p>
                    ) : (
                      <p className="text-white/15 text-xs mt-1">Renders will appear here as they complete</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                    {viewedProject.renders.map((render, idx) => (
                      <RenderCard
                        key={render.id}
                        render={render}
                        index={idx}
                        total={viewedProject.renders.length}
                        projectId={viewedProject.id}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
