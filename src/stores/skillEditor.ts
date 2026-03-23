import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Types ────────────────────────────────────────────────────────────────────

export type BlockType = 'purpose' | 'workflow' | 'rule' | 'command_template' | 'example' | 'warning' | 'note' | 'raw'

export interface BlockBase { id: string; type: BlockType; order: number; collapsed?: boolean }
export interface PurposeBlock extends BlockBase { type: 'purpose'; content: string }
export interface WorkflowBlock extends BlockBase { type: 'workflow'; slug: string; commandType: string; notes: string }
export interface RuleBlock extends BlockBase { type: 'rule'; content: string; priority: 'required' | 'optional' | 'never' }
export interface TemplateVariable { name: string; description: string; required: boolean; default?: string }
export interface CommandTemplateBlock extends BlockBase { type: 'command_template'; template: string; variables: TemplateVariable[] }
export interface ExampleBlock extends BlockBase { type: 'example'; userInput: string; command: string; notes: string }
export interface WarningBlock extends BlockBase { type: 'warning'; content: string; severity: 'info' | 'caution' | 'critical' }
export interface NoteBlock extends BlockBase { type: 'note'; content: string }
export interface RawBlock extends BlockBase { type: 'raw'; content: string }
export type Block = PurposeBlock | WorkflowBlock | RuleBlock | CommandTemplateBlock | ExampleBlock | WarningBlock | NoteBlock | RawBlock

export interface SkillMeta {
  name: string
  slug: string
  description: string
  targetWorkflow: string
  commandType: 'txt2img' | 'img2img' | 'wf' | 'render' | 'custom'
  tags: string[]
  status: 'draft' | 'active' | 'archived'
  apiSlug?: string
  isPublished?: boolean
  isPublic?: boolean
  isOpenSource?: boolean
  allowsInputMedia?: boolean
}

export interface SkillDocument {
  id: string
  meta: SkillMeta
  blocks: Block[]
  createdAt: string
  updatedAt: string
  version: number
  rating?: 'thumbs_up' | 'thumbs_down' | null
}

export type SkillEventType =
  | 'skill_created'
  | 'skill_imported'
  | 'block_added'
  | 'block_edited'
  | 'block_deleted'
  | 'block_reordered'
  | 'example_added'
  | 'rule_priority_changed'
  | 'export_triggered'
  | 'skill_rated'
  | 'validation_passed'

export interface SkillEvent {
  skillId: string
  eventType: SkillEventType
  payload: Record<string, unknown>
  timestamp: string
}

export type SkillEditorTarget =
  | { mode: 'new' }
  | { mode: 'local'; skillId: string }
  | { mode: 'api-view'; slug: string; editable: boolean }

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function defaultMeta(patch?: Partial<SkillMeta>): SkillMeta {
  return {
    name: 'Untitled Skill',
    slug: '',
    description: '',
    targetWorkflow: '',
    commandType: 'txt2img',
    tags: [],
    status: 'draft',
    ...patch,
  }
}

function defaultBlock(type: BlockType, order: number): Block {
  const id = genId()
  switch (type) {
    case 'purpose':
      return { id, type, order, content: '' }
    case 'workflow':
      return { id, type, order, slug: '', commandType: 'txt2img', notes: '' }
    case 'rule':
      return { id, type, order, content: '', priority: 'required' }
    case 'command_template':
      return { id, type, order, template: '', variables: [] }
    case 'example':
      return { id, type, order, userInput: '', command: '', notes: '' }
    case 'warning':
      return { id, type, order, content: '', severity: 'info' }
    case 'note':
      return { id, type, order, content: '' }
    case 'raw':
      return { id, type, order, content: '' }
  }
}

// ── Store interface ───────────────────────────────────────────────────────────

interface SkillEditorState {
  skills: SkillDocument[]
  events: SkillEvent[]
  activeTarget: SkillEditorTarget | null

  createSkill(meta?: Partial<SkillMeta>): string
  importSkill(doc: Omit<SkillDocument, 'id' | 'createdAt' | 'updatedAt'>): string
  updateSkillMeta(id: string, patch: Partial<SkillMeta>): void
  deleteSkill(id: string): void
  addBlock(skillId: string, type: BlockType, afterId?: string): string
  updateBlock(skillId: string, blockId: string, patch: Partial<Block>): void
  deleteBlock(skillId: string, blockId: string): void
  moveBlock(skillId: string, blockId: string, dir: 'up' | 'down'): void
  toggleBlockCollapse(skillId: string, blockId: string): void
  setActiveTarget(target: SkillEditorTarget | null): void
  rateSkill(skillId: string, rating: 'thumbs_up' | 'thumbs_down'): void
  logEvent(event: Omit<SkillEvent, 'timestamp'>): void
  exportBundle(): string
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useSkillEditorStore = create<SkillEditorState>()(
  persist(
    (set, get) => ({
      skills: [],
      events: [],
      activeTarget: null,

      createSkill(meta?: Partial<SkillMeta>): string {
        const id = genId()
        const now = new Date().toISOString()
        const doc: SkillDocument = {
          id,
          meta: defaultMeta(meta),
          blocks: [],
          createdAt: now,
          updatedAt: now,
          version: 1,
          rating: null,
        }
        set(s => ({ skills: [...s.skills, doc] }))
        get().logEvent({ skillId: id, eventType: 'skill_created', payload: { meta: doc.meta } })
        return id
      },

      importSkill(doc: Omit<SkillDocument, 'id' | 'createdAt' | 'updatedAt'>): string {
        const id = genId()
        const now = new Date().toISOString()
        const full: SkillDocument = { ...doc, id, createdAt: now, updatedAt: now }
        set(s => ({ skills: [...s.skills, full] }))
        get().logEvent({ skillId: id, eventType: 'skill_imported', payload: { name: doc.meta.name } })
        return id
      },

      updateSkillMeta(id: string, patch: Partial<SkillMeta>): void {
        set(s => ({
          skills: s.skills.map(doc =>
            doc.id === id
              ? { ...doc, meta: { ...doc.meta, ...patch }, updatedAt: new Date().toISOString() }
              : doc
          ),
        }))
      },

      deleteSkill(id: string): void {
        set(s => ({ skills: s.skills.filter(doc => doc.id !== id) }))
      },

      addBlock(skillId: string, type: BlockType, afterId?: string): string {
        const doc = get().skills.find(d => d.id === skillId)
        if (!doc) return ''

        const sorted = [...doc.blocks].sort((a, b) => a.order - b.order)
        let insertOrder: number

        if (afterId) {
          const idx = sorted.findIndex(b => b.id === afterId)
          insertOrder = idx >= 0 ? sorted[idx].order + 1 : (sorted[sorted.length - 1]?.order ?? 0) + 1
          // Shift all subsequent blocks up
          const newBlocks = sorted.map(b =>
            b.order >= insertOrder && b.id !== afterId ? { ...b, order: b.order + 1 } : b
          )
          const newBlock = defaultBlock(type, insertOrder)
          set(s => ({
            skills: s.skills.map(d =>
              d.id === skillId
                ? { ...d, blocks: [...newBlocks, newBlock], updatedAt: new Date().toISOString() }
                : d
            ),
          }))
          get().logEvent({ skillId, eventType: 'block_added', payload: { type, blockId: newBlock.id } })
          return newBlock.id
        } else {
          insertOrder = (sorted[sorted.length - 1]?.order ?? -1) + 1
          const newBlock = defaultBlock(type, insertOrder)
          set(s => ({
            skills: s.skills.map(d =>
              d.id === skillId
                ? { ...d, blocks: [...d.blocks, newBlock], updatedAt: new Date().toISOString() }
                : d
            ),
          }))
          get().logEvent({ skillId, eventType: 'block_added', payload: { type, blockId: newBlock.id } })
          return newBlock.id
        }
      },

      updateBlock(skillId: string, blockId: string, patch: Partial<Block>): void {
        set(s => ({
          skills: s.skills.map(doc =>
            doc.id === skillId
              ? {
                  ...doc,
                  blocks: doc.blocks.map(b => b.id === blockId ? { ...b, ...patch } as Block : b),
                  updatedAt: new Date().toISOString(),
                }
              : doc
          ),
        }))
      },

      deleteBlock(skillId: string, blockId: string): void {
        set(s => ({
          skills: s.skills.map(doc =>
            doc.id === skillId
              ? { ...doc, blocks: doc.blocks.filter(b => b.id !== blockId), updatedAt: new Date().toISOString() }
              : doc
          ),
        }))
        get().logEvent({ skillId, eventType: 'block_deleted', payload: { blockId } })
      },

      moveBlock(skillId: string, blockId: string, dir: 'up' | 'down'): void {
        const doc = get().skills.find(d => d.id === skillId)
        if (!doc) return
        const sorted = [...doc.blocks].sort((a, b) => a.order - b.order)
        const idx = sorted.findIndex(b => b.id === blockId)
        if (idx < 0) return
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= sorted.length) return

        const aOrder = sorted[idx].order
        const bOrder = sorted[swapIdx].order

        const newBlocks = doc.blocks.map(b => {
          if (b.id === sorted[idx].id) return { ...b, order: bOrder }
          if (b.id === sorted[swapIdx].id) return { ...b, order: aOrder }
          return b
        })

        set(s => ({
          skills: s.skills.map(d =>
            d.id === skillId
              ? { ...d, blocks: newBlocks, updatedAt: new Date().toISOString() }
              : d
          ),
        }))
        get().logEvent({ skillId, eventType: 'block_reordered', payload: { blockId, dir } })
      },

      toggleBlockCollapse(skillId: string, blockId: string): void {
        set(s => ({
          skills: s.skills.map(doc =>
            doc.id === skillId
              ? {
                  ...doc,
                  blocks: doc.blocks.map(b =>
                    b.id === blockId ? { ...b, collapsed: !b.collapsed } : b
                  ),
                }
              : doc
          ),
        }))
      },

      setActiveTarget(target: SkillEditorTarget | null): void {
        set({ activeTarget: target })
      },

      rateSkill(skillId: string, rating: 'thumbs_up' | 'thumbs_down'): void {
        set(s => ({
          skills: s.skills.map(doc =>
            doc.id === skillId ? { ...doc, rating } : doc
          ),
        }))
        get().logEvent({ skillId, eventType: 'skill_rated', payload: { rating } })
      },

      logEvent(event: Omit<SkillEvent, 'timestamp'>): void {
        const full: SkillEvent = { ...event, timestamp: new Date().toISOString() }
        set(s => ({
          events: [...s.events.slice(-499), full],
        }))
      },

      exportBundle(): string {
        const { skills, events } = get()
        return JSON.stringify({ exportedAt: new Date().toISOString(), skills, events }, null, 2)
      },
    }),
    { name: 'fj-skill-editor' }
  )
)
