import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChainNode, ChainEdge } from '@/stores/chainGraph'

export interface FormField {
  id: string
  label: string
}

export interface TemplateNode {
  id: string
  workflowSlug: string
  workflowName: string
  promptTemplate: string
  position: { x: number; y: number }
}

export interface ChainTemplate {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  nodes: TemplateNode[]
  edges: ChainEdge[]
  forms: FormField[]
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

interface ChainTemplateState {
  templates: ChainTemplate[]
  activeTemplateId: string | null
  formValues: Record<string, string>
  editingTemplateId: string | null

  saveTemplate(name: string, nodes: ChainNode[], edges: ChainEdge[]): string
  updateTemplateName(id: string, name: string): void
  deleteTemplate(id: string): void
  setActiveTemplate(id: string | null): void
  setEditingTemplate(id: string | null): void
  setFormValue(fieldId: string, value: string): void
  updateFieldLabel(templateId: string, fieldId: string, label: string): void
  removeField(templateId: string, fieldId: string): void
  addField(templateId: string, id: string, label: string): void
  resolvePrompt(promptTemplate: string): string
}

export const useChainTemplateStore = create<ChainTemplateState>()(
  persist(
    (set, get) => ({
      templates: [],
      activeTemplateId: null,
      formValues: {},
      editingTemplateId: null,

      saveTemplate: (name, nodes, edges) => {
        const id = makeId()
        const now = Date.now()

        // Build template nodes
        const templateNodes: TemplateNode[] = nodes.map(n => ({
          id: makeId(),
          workflowSlug: n.workflowSlug,
          workflowName: n.workflowName,
          promptTemplate: n.prompt,
          position: { ...n.position },
        }))

        // Auto-detect {{fieldId}} patterns from all prompts
        const fieldIds = new Set<string>()
        for (const n of nodes) {
          const matches = n.prompt.matchAll(/\{\{(\w+)\}\}/g)
          for (const m of matches) fieldIds.add(m[1])
        }
        const forms: FormField[] = Array.from(fieldIds).map(fid => ({
          id: fid,
          label: capitalize(fid),
        }))

        // Map old node IDs to new template node IDs for edges
        const idMap = new Map<string, string>()
        nodes.forEach((n, i) => idMap.set(n.id, templateNodes[i].id))

        const templateEdges: ChainEdge[] = edges
          .filter(e => idMap.has(e.fromNodeId) && idMap.has(e.toNodeId))
          .map(e => ({
            id: makeId(),
            fromNodeId: idMap.get(e.fromNodeId)!,
            toNodeId: idMap.get(e.toNodeId)!,
            toPortField: e.toPortField ?? 'init_image_filename',
            controlnetSlug: e.controlnetSlug,
          }))

        const template: ChainTemplate = {
          id,
          name,
          createdAt: now,
          updatedAt: now,
          nodes: templateNodes,
          edges: templateEdges,
          forms,
        }

        set(s => ({ templates: [...s.templates, template] }))
        return id
      },

      updateTemplateName: (id, name) => {
        set(s => ({
          templates: s.templates.map(t =>
            t.id === id ? { ...t, name, updatedAt: Date.now() } : t
          ),
        }))
      },

      deleteTemplate: (id) => {
        set(s => ({
          templates: s.templates.filter(t => t.id !== id),
          activeTemplateId: s.activeTemplateId === id ? null : s.activeTemplateId,
          editingTemplateId: s.editingTemplateId === id ? null : s.editingTemplateId,
        }))
      },

      setActiveTemplate: (id) => {
        set({ activeTemplateId: id, formValues: {} })
      },

      setEditingTemplate: (id) => {
        set({ editingTemplateId: id })
      },

      setFormValue: (fieldId, value) => {
        set(s => ({ formValues: { ...s.formValues, [fieldId]: value } }))
      },

      updateFieldLabel: (templateId, fieldId, label) => {
        set(s => ({
          templates: s.templates.map(t =>
            t.id === templateId
              ? {
                  ...t,
                  updatedAt: Date.now(),
                  forms: t.forms.map(f => f.id === fieldId ? { ...f, label } : f),
                }
              : t
          ),
        }))
      },

      removeField: (templateId, fieldId) => {
        set(s => ({
          templates: s.templates.map(t =>
            t.id === templateId
              ? {
                  ...t,
                  updatedAt: Date.now(),
                  forms: t.forms.filter(f => f.id !== fieldId),
                }
              : t
          ),
        }))
      },

      addField: (templateId, id, label) => {
        set(s => ({
          templates: s.templates.map(t =>
            t.id === templateId
              ? {
                  ...t,
                  updatedAt: Date.now(),
                  forms: [...t.forms, { id, label }],
                }
              : t
          ),
        }))
      },

      resolvePrompt: (promptTemplate) => {
        const { formValues } = get()
        return promptTemplate.replace(/\{\{(\w+)\}\}/g, (_, id) => formValues[id] ?? '')
      },
    }),
    { name: 'fj-chain-templates' }
  )
)
