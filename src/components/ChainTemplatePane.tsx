import React, { useState } from 'react'
import { useChainTemplateStore, type ChainTemplate } from '@/stores/chainTemplate'
import { useChainGraphStore } from '@/stores/chainGraph'

export default function ChainTemplatePane(): React.ReactElement {
  const {
    templates,
    activeTemplateId,
    formValues,
    editingTemplateId,
    saveTemplate,
    updateTemplateName,
    deleteTemplate,
    setActiveTemplate,
    setEditingTemplate,
    setFormValue,
    updateFieldLabel,
    removeField,
    addField,
    resolvePrompt,
  } = useChainTemplateStore()

  const { nodes, edges } = useChainGraphStore()

  // Save form state
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveName, setSaveName] = useState('')

  // Add field form state per template (keyed by templateId)
  const [addFieldState, setAddFieldState] = useState<Record<string, { id: string; label: string }>>({})

  const activeTemplate = templates.find(t => t.id === activeTemplateId) ?? null

  function handleSave() {
    if (!saveName.trim()) return
    const id = saveTemplate(saveName.trim(), nodes, edges)
    setActiveTemplate(id)
    setSaveName('')
    setShowSaveForm(false)
  }

  function handleRunTemplate() {
    if (!activeTemplate) return
    const { updateNode, runChain } = useChainGraphStore.getState()
    // Resolve prompts for each graph node by matching against template nodes by position/order
    // We match template nodes to graph nodes by index (order preserved by loadFromTemplate)
    for (const node of nodes) {
      // Find the matching template node — match by workflowSlug + position proximity
      const tNode = activeTemplate.nodes.find(
        tn => tn.workflowSlug === node.workflowSlug &&
          Math.abs(tn.position.x - node.position.x) < 1 &&
          Math.abs(tn.position.y - node.position.y) < 1
      )
      if (tNode) {
        updateNode(node.id, { prompt: resolvePrompt(tNode.promptTemplate) })
      } else {
        // Fallback: resolve whatever is in the node's current prompt
        updateNode(node.id, { prompt: resolvePrompt(node.prompt) })
      }
    }
    runChain().catch(console.error)
  }

  function handleReload() {
    if (!activeTemplate) return
    useChainGraphStore.getState().loadFromTemplate(activeTemplate)
  }

  return (
    <div className="flex flex-col h-full">
      {/* A. Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
            Chain Templates
          </span>
          {!showSaveForm && (
            <button
              onClick={() => { setShowSaveForm(true); setSaveName('') }}
              className="text-xs rounded px-2 py-0.5 bg-brand/15 border border-brand/30 text-brand hover:bg-brand/25 transition-colors"
            >
              Save Current
            </button>
          )}
        </div>

        {showSaveForm && (
          <div className="flex items-center gap-1.5 mt-1">
            <input
              autoFocus
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') { setShowSaveForm(false); setSaveName('') }
              }}
              placeholder="Template name…"
              className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-white placeholder-white/30 outline-none ring-1 ring-brand"
            />
            <button
              onClick={handleSave}
              disabled={!saveName.trim()}
              className="text-xs rounded bg-brand px-2 py-1 text-white disabled:opacity-40 transition-colors"
            >
              ✓
            </button>
            <button
              onClick={() => { setShowSaveForm(false); setSaveName('') }}
              className="text-xs text-white/30 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* B. Active Template Form */}
      {activeTemplate && activeTemplate.forms.length > 0 && (
        <div className="flex-shrink-0 px-4 py-3 border-b border-white/10 bg-neutral-900/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-white/50">
              Active: <span className="text-white/70 font-medium">{activeTemplate.name}</span>
            </span>
            <button
              onClick={() => setActiveTemplate(null)}
              className="text-xs text-white/20 hover:text-white/60 transition-colors"
              title="Clear active template"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-2 mb-3">
            {activeTemplate.forms.map(field => (
              <div key={field.id}>
                <label className="block text-xs text-white/40 mb-0.5">{field.label}</label>
                <input
                  type="text"
                  value={formValues[field.id] ?? ''}
                  onChange={e => setFormValue(field.id, e.target.value)}
                  placeholder={`{{${field.id}}}`}
                  className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-white placeholder-white/20 outline-none ring-1 ring-white/10 focus:ring-brand"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleRunTemplate}
              className="flex-1 rounded bg-brand px-2 py-1 text-xs text-white hover:bg-brand/80 transition-colors text-center"
            >
              ▶ Run Template
            </button>
            <button
              onClick={handleReload}
              className="rounded bg-white/8 px-2 py-1 text-xs text-white/60 hover:bg-white/12 hover:text-white transition-colors"
              title="Reload template (resets node prompts)"
            >
              ↺
            </button>
          </div>
        </div>
      )}

      {/* C. Template List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {templates.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-white/20 text-center px-4">No saved templates yet</p>
          </div>
        ) : (
          <div className="py-2 flex flex-col gap-1">
            {templates.map(template => (
              <TemplateCard
                key={template.id}
                template={template}
                isActive={activeTemplateId === template.id}
                isEditing={editingTemplateId === template.id}
                addFieldState={addFieldState[template.id] ?? { id: '', label: '' }}
                onSetAddFieldState={(state) =>
                  setAddFieldState(s => ({ ...s, [template.id]: state }))
                }
                onLoad={() => {
                  useChainGraphStore.getState().loadFromTemplate(template)
                  setActiveTemplate(template.id)
                }}
                onToggleEdit={() =>
                  setEditingTemplate(editingTemplateId === template.id ? null : template.id)
                }
                onDelete={() => {
                  if (window.confirm(`Delete template "${template.name}"?`)) {
                    deleteTemplate(template.id)
                  }
                }}
                onRename={(name) => updateTemplateName(template.id, name)}
                onUpdateFieldLabel={(fieldId, label) =>
                  updateFieldLabel(template.id, fieldId, label)
                }
                onRemoveField={(fieldId) => removeField(template.id, fieldId)}
                onAddField={(id, label) => {
                  addField(template.id, id, label)
                  setAddFieldState(s => ({ ...s, [template.id]: { id: '', label: '' } }))
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* D. Mark-as-field hint */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-white/5">
        <p className="text-xs text-white/20">
          Select text in a node prompt then click Mark
        </p>
      </div>
    </div>
  )
}

interface TemplateCardProps {
  template: ChainTemplate
  isActive: boolean
  isEditing: boolean
  addFieldState: { id: string; label: string }
  onSetAddFieldState: (state: { id: string; label: string }) => void
  onLoad: () => void
  onToggleEdit: () => void
  onDelete: () => void
  onRename: (name: string) => void
  onUpdateFieldLabel: (fieldId: string, label: string) => void
  onRemoveField: (fieldId: string) => void
  onAddField: (id: string, label: string) => void
}

function TemplateCard({
  template,
  isActive,
  isEditing,
  addFieldState,
  onSetAddFieldState,
  onLoad,
  onToggleEdit,
  onDelete,
  onRename,
  onUpdateFieldLabel,
  onRemoveField,
  onAddField,
}: TemplateCardProps): React.ReactElement {
  const [renameValue, setRenameValue] = useState(template.name)

  function commitRename() {
    const v = renameValue.trim()
    if (v && v !== template.name) onRename(v)
  }

  return (
    <div
      className={`mx-2 rounded-lg border transition-colors ${
        isActive
          ? 'border-brand/40 bg-brand/5'
          : 'border-white/8 bg-neutral-900/60 hover:border-white/15'
      }`}
    >
      {/* Card header */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white/80 truncate">{template.name}</p>
          <p className="text-xs text-white/25 mt-0.5">
            {template.nodes.length} node{template.nodes.length !== 1 ? 's' : ''} · {template.forms.length} field{template.forms.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={onLoad}
          className="text-xs rounded bg-brand/15 border border-brand/25 px-1.5 py-0.5 text-brand hover:bg-brand/25 transition-colors flex-shrink-0"
          title="Load template into chain"
        >
          ▶
        </button>
        <button
          onClick={onToggleEdit}
          className={`text-xs rounded px-1.5 py-0.5 transition-colors flex-shrink-0 ${
            isEditing
              ? 'text-brand bg-brand/10'
              : 'text-white/30 hover:text-white hover:bg-white/8'
          }`}
          title="Edit template"
        >
          ✎
        </button>
        <button
          onClick={onDelete}
          className="text-xs text-white/20 hover:text-red-400 transition-colors flex-shrink-0"
          title="Delete template"
        >
          ✕
        </button>
      </div>

      {/* Inline editor */}
      {isEditing && (
        <div className="border-t border-white/8 px-3 py-2 flex flex-col gap-2">
          {/* Rename */}
          <div>
            <label className="block text-xs text-white/30 mb-1">Template Name</label>
            <input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename() }}
              className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-white outline-none ring-1 ring-white/10 focus:ring-brand"
            />
          </div>

          {/* Fields list */}
          {template.forms.length > 0 && (
            <div>
              <label className="block text-xs text-white/30 mb-1">Form Fields</label>
              <div className="flex flex-col gap-1">
                {template.forms.map(field => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    onUpdateLabel={(label) => onUpdateFieldLabel(field.id, label)}
                    onRemove={() => onRemoveField(field.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Add field form */}
          <div>
            <label className="block text-xs text-white/30 mb-1">Add Field</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={addFieldState.id}
                onChange={e => onSetAddFieldState({ ...addFieldState, id: e.target.value })}
                placeholder="token (e.g. subject)"
                className="flex-1 rounded bg-neutral-800 px-2 py-0.5 text-xs text-white placeholder-white/20 outline-none ring-1 ring-white/10 focus:ring-brand"
              />
              <input
                type="text"
                value={addFieldState.label}
                onChange={e => onSetAddFieldState({ ...addFieldState, label: e.target.value })}
                placeholder="Label"
                className="flex-1 rounded bg-neutral-800 px-2 py-0.5 text-xs text-white placeholder-white/20 outline-none ring-1 ring-white/10 focus:ring-brand"
              />
              <button
                onClick={() => {
                  const id = addFieldState.id.trim().toLowerCase().replace(/\s+/g, '_')
                  const label = addFieldState.label.trim() || id
                  if (id) onAddField(id, label)
                }}
                disabled={!addFieldState.id.trim()}
                className="text-xs rounded bg-brand px-2 py-0.5 text-white disabled:opacity-40 transition-colors"
              >
                +
              </button>
            </div>
          </div>

          <button
            onClick={onToggleEdit}
            className="text-xs text-white/40 hover:text-white transition-colors self-end"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}

function FieldRow({
  field,
  onUpdateLabel,
  onRemove,
}: {
  field: { id: string; label: string }
  onUpdateLabel: (label: string) => void
  onRemove: () => void
}): React.ReactElement {
  const [val, setVal] = useState(field.label)

  function commit() {
    const v = val.trim()
    if (v && v !== field.label) onUpdateLabel(v)
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-white/25 font-mono flex-shrink-0">{`{{${field.id}}}`}</span>
      <input
        type="text"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit() }}
        className="flex-1 rounded bg-neutral-800 px-2 py-0.5 text-xs text-white outline-none ring-1 ring-white/10 focus:ring-brand"
      />
      <button
        onClick={onRemove}
        className="text-xs text-white/20 hover:text-red-400 transition-colors flex-shrink-0"
      >
        ✕
      </button>
    </div>
  )
}
