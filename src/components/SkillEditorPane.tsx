import React, { useState, useEffect } from 'react'
import { useSkillEditorStore, type SkillDocument, type SkillMeta } from '@/stores/skillEditor'
import { validateSkill } from '@/utils/skillValidator'
import { serializeSkill } from '@/utils/skillSerializer'
import { parseSkillText } from '@/utils/skillParser'
import { fetchSkillDetail } from '@/api/graydient'
import ValidationBar from '@/components/skills/ValidationBar'
import BlockList from '@/components/skills/BlockList'
import BlockToolbar from '@/components/skills/BlockToolbar'
import PreviewPane from '@/components/skills/PreviewPane'
import PublishModal from '@/components/skills/PublishModal'
import ImportModal from '@/components/skills/ImportModal'

interface Props {
  onClose: () => void
}

const STATUS_COLORS = {
  draft: 'bg-neutral-700 text-neutral-300',
  active: 'bg-emerald-900/50 text-emerald-300',
  archived: 'bg-red-900/30 text-red-400',
}

function deriveSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function SkillEditorPane({ onClose }: Props): React.ReactElement {
  const {
    activeTarget,
    skills,
    createSkill,
    importSkill,
    updateSkillMeta,
    setActiveTarget,
    logEvent,
    rateSkill,
  } = useSkillEditorStore()

  const [showPreview, setShowPreview] = useState(false)
  const [showPublish, setShowPublish] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [exportText, setExportText] = useState('')
  const [exportRated, setExportRated] = useState(false)

  // For api-view mode
  const [apiViewDoc, setApiViewDoc] = useState<SkillDocument | null>(null)
  const [apiViewLoading, setApiViewLoading] = useState(false)
  const [apiViewError, setApiViewError] = useState<string | null>(null)

  // Resolve the active document
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null)

  // Init: handle 'new' target
  useEffect(() => {
    if (!activeTarget) return
    if (activeTarget.mode === 'new') {
      const id = createSkill()
      setActiveTarget({ mode: 'local', skillId: id })
      setActiveSkillId(id)
    } else if (activeTarget.mode === 'local') {
      setActiveSkillId(activeTarget.skillId)
    } else if (activeTarget.mode === 'api-view') {
      setActiveSkillId(null)
      setApiViewLoading(true)
      setApiViewError(null)
      fetchSkillDetail(activeTarget.slug)
        .then(skill => {
          if (!skill) {
            setApiViewError('Skill not found.')
            setApiViewLoading(false)
            return
          }
          // Try to parse content if available
          if (skill.content) {
            const parsed = parseSkillText(skill.content)
            const doc: SkillDocument = {
              id: `api-${skill.slug}`,
              meta: {
                name: skill.name,
                slug: skill.slug,
                description: skill.description ?? '',
                targetWorkflow: '',
                commandType: 'txt2img',
                tags: [],
                status: 'active',
                apiSlug: skill.slug,
                isPublished: true,
                isPublic: skill.is_public,
                isOpenSource: skill.is_open_source,
                allowsInputMedia: skill.allows_input_media,
              },
              blocks: parsed.blocks.map((pb, i) => ({ ...pb.block, order: i })),
              createdAt: skill.inserted_at ?? new Date().toISOString(),
              updatedAt: skill.updated_at ?? new Date().toISOString(),
              version: skill.version ?? 1,
              rating: null,
            }
            setApiViewDoc(doc)
          } else {
            setApiViewDoc({
              id: `api-${skill.slug}`,
              meta: {
                name: skill.name,
                slug: skill.slug,
                description: skill.description ?? '',
                targetWorkflow: '',
                commandType: 'txt2img',
                tags: [],
                status: 'active',
                apiSlug: skill.slug,
                isPublished: true,
                isPublic: skill.is_public,
                isOpenSource: skill.is_open_source,
                allowsInputMedia: skill.allows_input_media,
              },
              blocks: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              version: 1,
              rating: null,
            })
          }
          setApiViewLoading(false)
        })
        .catch(e => {
          setApiViewError(String(e))
          setApiViewLoading(false)
        })
    }
  }, [activeTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  const isApiView = activeTarget?.mode === 'api-view'
  const doc: SkillDocument | null = isApiView
    ? apiViewDoc
    : activeSkillId
    ? skills.find(s => s.id === activeSkillId) ?? null
    : null

  const validation = doc ? validateSkill(doc) : null

  function handleExport() {
    if (!doc) return
    const text = serializeSkill(doc)
    setExportText(text)
    setShowExport(true)
    setExportRated(false)
    logEvent({ skillId: doc.id, eventType: 'export_triggered', payload: {} })
  }

  function downloadTxt() {
    const blob = new Blob([exportText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc?.meta.slug || 'skill'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(exportText)
  }

  function handleSlugChange(val: string) {
    if (!doc || isApiView) return
    updateSkillMeta(doc.id, { slug: val })
  }

  function handleNameChange(val: string) {
    if (!doc || isApiView) return
    const patch: Partial<SkillMeta> = { name: val }
    // Auto-derive slug only if slug hasn't been manually set
    if (!doc.meta.apiSlug) {
      patch.slug = deriveSlug(val)
    }
    updateSkillMeta(doc.id, patch)
  }

  // Empty state
  if (!activeTarget) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-950 text-white/30 select-none">
        <div className="text-center">
          <span className="text-3xl">✦</span>
          <p className="mt-2 text-sm">No skill selected</p>
          <p className="text-xs mt-1">Open a skill from the Skills panel</p>
        </div>
      </div>
    )
  }

  // API-view loading/error
  if (isApiView && apiViewLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-950">
        <div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    )
  }

  if (isApiView && apiViewError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-950 text-white/50">
        <div className="text-center">
          <p className="text-sm">Error loading skill</p>
          <p className="text-xs mt-1 text-red-400/70">{apiViewError}</p>
        </div>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-950 text-white/30 select-none">
        <p className="text-sm">Skill not found</p>
      </div>
    )
  }

  // API-view no-source message
  const isApiReadOnly = isApiView && !apiViewDoc?.blocks.length && !(activeTarget as { editable?: boolean }).editable
  const sourceNotAvailable = isApiView && !apiViewDoc?.blocks.length && activeTarget.mode === 'api-view' && !activeTarget.editable

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 bg-neutral-950 text-white overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-white/10 flex-shrink-0 bg-neutral-950">
        <button
          onClick={onClose}
          className="text-[11px] text-white/50 hover:text-white transition-colors flex-shrink-0"
          title="Close Skills Editor"
        >⌂ Home</button>
        <span className="text-white/20 flex-shrink-0">·</span>
        <span className="text-[11px] font-semibold text-white/70 flex-shrink-0">✦ Skills Editor</span>
        {doc.meta.name && (
          <>
            <span className="text-white/20 flex-shrink-0">·</span>
            <span className="text-[11px] text-white/60 truncate max-w-32">{doc.meta.name}</span>
          </>
        )}
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0 ${STATUS_COLORS[doc.meta.status]}`}>
          {doc.meta.status}
        </span>

        <div className="flex-1" />

        {/* Right actions */}
        <div className="flex items-center gap-1.5">
          {!isApiView && (
            <button
              onClick={() => setShowImport(true)}
              className="px-2.5 py-1 rounded text-[10px] text-white/60 hover:text-white hover:bg-white/8 border border-white/8 transition-colors"
            >Import .txt</button>
          )}
          <button
            onClick={() => setShowPreview(v => !v)}
            className={`px-2.5 py-1 rounded text-[10px] border transition-colors ${showPreview ? 'text-orange-300 bg-orange-950/30 border-orange-500/30' : 'text-white/60 hover:text-white hover:bg-white/8 border-white/8'}`}
          >Preview ◨</button>
          {!isApiView && (
            <button
              onClick={handleExport}
              className="px-2.5 py-1 rounded text-[10px] text-white/60 hover:text-white hover:bg-white/8 border border-white/8 transition-colors"
            >Export .txt</button>
          )}
          {!isApiView && (
            <button
              onClick={() => setShowPublish(true)}
              disabled={validation?.score !== 6}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold border transition-colors ${
                validation?.score === 6
                  ? 'bg-brand hover:bg-brand/80 text-white border-brand'
                  : 'text-white/30 border-white/8 cursor-not-allowed'
              }`}
              title={validation?.score !== 6 ? 'Complete all 6 validation checks first' : 'Publish to Graydient'}
            >Publish ↑</button>
          )}
        </div>
      </div>

      {/* ── Meta row ── */}
      {!isApiView && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/8 flex-shrink-0 bg-neutral-950/80 flex-wrap">
          <input
            type="text"
            value={doc.meta.name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder="Skill name"
            className="w-40 rounded bg-neutral-800/80 px-2 py-1 text-xs text-white placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-brand"
          />

          <div className="relative flex items-center">
            <input
              type="text"
              value={doc.meta.slug}
              onChange={e => handleSlugChange(e.target.value)}
              placeholder="slug"
              className="w-32 rounded bg-neutral-800/80 px-2 py-1 text-[11px] text-white/70 font-mono placeholder-white/20 outline-none ring-1 ring-white/10 focus:ring-brand pr-5"
            />
            {doc.meta.apiSlug ? (
              <span className="absolute right-1.5 text-[10px] text-cyan-400" title="Published">🔗</span>
            ) : (
              <span className="absolute right-1.5 text-[10px] text-emerald-400" title="Not yet published">✓</span>
            )}
          </div>

          <input
            type="text"
            value={doc.meta.description}
            onChange={e => updateSkillMeta(doc.id, { description: e.target.value })}
            placeholder="Short description…"
            className="flex-1 min-w-24 rounded bg-neutral-800/80 px-2 py-1 text-xs text-white/80 placeholder-white/20 outline-none ring-1 ring-white/10 focus:ring-brand"
          />

          <select
            value={doc.meta.status}
            onChange={e => updateSkillMeta(doc.id, { status: e.target.value as SkillMeta['status'] })}
            className="rounded bg-neutral-800/80 px-2 py-1 text-xs text-white outline-none ring-1 ring-white/10 focus:ring-brand"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>

          <input
            type="text"
            value={doc.meta.tags.join(', ')}
            onChange={e => {
              const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean)
              updateSkillMeta(doc.id, { tags })
            }}
            placeholder="tags, comma-separated"
            className="w-36 rounded bg-neutral-800/80 px-2 py-1 text-xs text-white/60 placeholder-white/20 outline-none ring-1 ring-white/10 focus:ring-brand"
          />

          {/* Tag pills */}
          {doc.meta.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {doc.meta.tags.map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand/20 text-brand/80 border border-brand/20">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Validation bar ── */}
      {!isApiView && <ValidationBar doc={doc} />}

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Block editor */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          {sourceNotAvailable ? (
            <div className="flex-1 flex items-center justify-center text-white/30 select-none p-8">
              <div className="text-center max-w-sm">
                <p className="text-2xl mb-3">🔒</p>
                <p className="text-sm font-medium text-white/50 mb-1">{doc.meta.name}</p>
                <p className="text-xs">Source content not available for this skill.</p>
                <p className="text-xs mt-1 text-white/25">The skill author has not made this skill open source.</p>
              </div>
            </div>
          ) : (
            <>
              {!isApiView && <BlockToolbar skillId={doc.id} blocks={doc.blocks} />}
              <div className="flex-1 overflow-y-auto min-h-0 p-3">
                <BlockList skillId={doc.id} blocks={doc.blocks} readOnly={isApiView} />
              </div>
            </>
          )}
        </div>

        {/* Right: Preview pane */}
        {showPreview && (
          <div className="w-80 flex-shrink-0 border-l border-white/8 overflow-hidden flex flex-col">
            <PreviewPane doc={doc} onClose={() => setShowPreview(false)} />
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showPublish && !isApiView && (
        <PublishModal
          doc={doc}
          onClose={() => setShowPublish(false)}
          onPublished={slug => {
            setShowPublish(false)
            logEvent({ skillId: doc.id, eventType: 'validation_passed', payload: { slug } })
          }}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImport={parsed => {
            const id = importSkill(parsed)
            setActiveTarget({ mode: 'local', skillId: id })
            setActiveSkillId(id)
            setShowImport(false)
          }}
        />
      )}

      {/* Export overlay */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-neutral-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-shrink-0">
              <h2 className="text-sm font-semibold text-white">Export Skill</h2>
              <button onClick={() => setShowExport(false)} className="text-white/40 hover:text-white text-sm">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              <pre className="p-4 text-[11px] font-mono text-white/70 whitespace-pre-wrap break-words leading-relaxed">
                {exportText}
              </pre>
            </div>

            <div className="px-4 py-3 border-t border-white/8 flex-shrink-0 space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="flex-1 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs text-white/70 transition-colors"
                >Copy to clipboard</button>
                <button
                  onClick={downloadTxt}
                  className="flex-1 py-1.5 rounded bg-brand hover:bg-brand/80 text-xs text-white font-semibold transition-colors"
                >Download .txt</button>
              </div>

              {!exportRated && (
                <div className="flex items-center gap-2 justify-center">
                  <span className="text-[11px] text-white/40">Rate this skill:</span>
                  <button
                    onClick={() => { rateSkill(doc.id, 'thumbs_up'); setExportRated(true) }}
                    className="px-2 py-0.5 rounded text-sm hover:bg-white/8 transition-colors"
                    title="Thumbs up"
                  >👍</button>
                  <button
                    onClick={() => { rateSkill(doc.id, 'thumbs_down'); setExportRated(true) }}
                    className="px-2 py-0.5 rounded text-sm hover:bg-white/8 transition-colors"
                    title="Thumbs down"
                  >👎</button>
                  <button
                    onClick={() => setExportRated(true)}
                    className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                  >skip</button>
                </div>
              )}
              {exportRated && (
                <p className="text-center text-[11px] text-emerald-400">Thanks for your feedback!</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
