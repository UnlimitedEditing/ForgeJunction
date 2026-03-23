import React, { useState } from 'react'
import type { SkillDocument } from '@/stores/skillEditor'
import { useSkillEditorStore } from '@/stores/skillEditor'
import { createSkillApi, updateSkillApi } from '@/api/graydient'
import { serializeSkill } from '@/utils/skillSerializer'

interface Props {
  doc: SkillDocument
  onClose: () => void
  onPublished: (apiSlug: string) => void
}

export default function PublishModal({ doc, onClose, onPublished }: Props): React.ReactElement {
  const { updateSkillMeta } = useSkillEditorStore()

  const [name, setName] = useState(doc.meta.name)
  const [slug, setSlug] = useState(doc.meta.apiSlug ?? doc.meta.slug)
  const [description, setDescription] = useState(doc.meta.description)
  const [isPublic, setIsPublic] = useState(doc.meta.isPublic ?? false)
  const [isOpenSource, setIsOpenSource] = useState(doc.meta.isOpenSource ?? false)
  const [allowsInputMedia, setAllowsInputMedia] = useState(doc.meta.allowsInputMedia ?? false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePublish() {
    setLoading(true)
    setError(null)
    try {
      const content = serializeSkill(doc)
      let result
      if (doc.meta.isPublished && doc.meta.apiSlug) {
        result = await updateSkillApi(doc.meta.apiSlug, {
          name,
          description,
          content,
          is_public: isPublic,
          is_open_source: isOpenSource,
          allows_input_media: allowsInputMedia,
        })
      } else {
        result = await createSkillApi({
          name,
          slug: slug || undefined,
          description,
          content,
          is_public: isPublic,
          is_open_source: isOpenSource,
          allows_input_media: allowsInputMedia,
        })
      }
      updateSkillMeta(doc.id, {
        isPublished: true,
        apiSlug: result.slug,
        isPublic,
        isOpenSource,
        allowsInputMedia,
      })
      onPublished(result.slug)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-neutral-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-md mx-4 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Publish Skill</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-sm">✕</button>
        </div>

        {doc.meta.isPublished && doc.meta.apiSlug && (
          <div className="rounded-lg bg-yellow-950/40 border border-yellow-500/30 px-3 py-2 text-[11px] text-yellow-300">
            ⚠ This will overwrite an existing skill on Graydient (<code>{doc.meta.apiSlug}</code>).
          </div>
        )}

        {isPublic && doc.meta.isPublished && (
          <div className="rounded-lg bg-orange-950/40 border border-orange-500/30 px-3 py-2 text-[11px] text-orange-300">
            ⚠ This skill is publicly visible. Updating it will affect all users who use it.
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-white/45 uppercase tracking-wider mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded bg-neutral-800 px-2.5 py-1.5 text-xs text-white outline-none ring-1 ring-white/10 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-[10px] text-white/45 uppercase tracking-wider mb-1">Slug</label>
            <input
              type="text"
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="auto-generated if empty"
              className="w-full rounded bg-neutral-800 px-2.5 py-1.5 text-xs text-white font-mono outline-none ring-1 ring-white/10 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-[10px] text-white/45 uppercase tracking-wider mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded bg-neutral-800 px-2.5 py-1.5 text-xs text-white outline-none ring-1 ring-white/10 focus:ring-brand resize-none"
            />
          </div>

          <div className="space-y-2">
            {([
              { label: 'Public', value: isPublic, set: setIsPublic },
              { label: 'Open Source', value: isOpenSource, set: setIsOpenSource },
              { label: 'Allows Input Media', value: allowsInputMedia, set: setAllowsInputMedia },
            ] as const).map(({ label, value, set }) => (
              <label key={label} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={e => (set as (v: boolean) => void)(e.target.checked)}
                  className="accent-brand"
                />
                <span className="text-xs text-white/70">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-950/40 border border-red-500/30 px-3 py-2 text-[11px] text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs text-white/70 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={loading}
            className="flex-1 py-1.5 rounded bg-brand hover:bg-brand/80 text-xs text-white font-semibold transition-colors disabled:opacity-50"
          >
            {loading ? 'Publishing…' : doc.meta.isPublished ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}
