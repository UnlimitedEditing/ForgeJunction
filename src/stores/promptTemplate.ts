import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface TemplateSlot {
  id: string
  label: string
  value: string
  start: number
  end: number
}

export interface TemplateStep {
  id: string
  workflowSlug: string
  templateText: string
  slots: TemplateSlot[]
  label?: string
  linkToPrevious?: boolean
}

interface PromptTemplateState {
  steps: TemplateStep[]
  activeStepId: string | null
  isTemplateMode: boolean

  setTemplateMode: (on: boolean) => void
  setActiveStep: (stepId: string | null) => void
  addStep: (workflowSlug: string, rawPrompt: string) => void
  removeStep: (stepId: string) => void
  moveStep: (stepId: string, direction: 'up' | 'down') => void
  updateTemplateText: (stepId: string, text: string) => void
  setStepWorkflow: (stepId: string, slug: string) => void
  setLinkToPrevious: (stepId: string, linked: boolean) => void
  updateSlotValue: (stepId: string, slotId: string, value: string) => void
  addSlot: (stepId: string, start: number, end: number, label: string) => void
  removeSlot: (stepId: string, slotId: string) => void
  buildFilledPrompt: (stepId: string) => string
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export const usePromptTemplateStore = create<PromptTemplateState>()(
  persist(
    (set, get) => ({
      steps: [],
      activeStepId: null,
      isTemplateMode: false,

      setTemplateMode: (on) => set({ isTemplateMode: on }),

      setActiveStep: (stepId) => set({ activeStepId: stepId }),

      addStep: (workflowSlug, rawPrompt) => {
        const id = uid()
        set((s) => ({
          steps: [
            ...s.steps,
            {
              id,
              workflowSlug,
              templateText: rawPrompt,
              slots: [],
              label: `Step ${s.steps.length + 1}`,
            },
          ],
          activeStepId: id,
        }))
      },

      removeStep: (stepId) => {
        set((s) => {
          const steps = s.steps.filter((st) => st.id !== stepId)
          const activeStepId =
            s.activeStepId === stepId ? (steps[0]?.id ?? null) : s.activeStepId
          return { steps, activeStepId }
        })
      },

      moveStep: (stepId, direction) => {
        set((s) => {
          const idx = s.steps.findIndex((st) => st.id === stepId)
          if (idx === -1) return s
          const newIdx = direction === 'up' ? idx - 1 : idx + 1
          if (newIdx < 0 || newIdx >= s.steps.length) return s
          const steps = [...s.steps]
          ;[steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]]
          return { steps }
        })
      },

      updateTemplateText: (stepId, text) => {
        set((s) => ({
          steps: s.steps.map((st) => (st.id === stepId ? { ...st, templateText: text } : st)),
        }))
      },

      setStepWorkflow: (stepId, slug) => {
        set((s) => ({
          steps: s.steps.map((st) => (st.id === stepId ? { ...st, workflowSlug: slug } : st)),
        }))
      },

      setLinkToPrevious: (stepId, linked) => {
        set((s) => ({
          steps: s.steps.map((st) => (st.id === stepId ? { ...st, linkToPrevious: linked } : st)),
        }))
      },

      updateSlotValue: (stepId, slotId, value) => {
        set((s) => ({
          steps: s.steps.map((st) =>
            st.id === stepId
              ? {
                  ...st,
                  slots: st.slots.map((sl) => (sl.id === slotId ? { ...sl, value } : sl)),
                }
              : st
          ),
        }))
      },

      addSlot: (stepId, start, end, label) => {
        set((s) => {
          const step = s.steps.find((st) => st.id === stepId)
          if (!step) return s

          const slotId = uid()
          const selectedText = step.templateText.slice(start, end)
          const placeholder = `{{${slotId}}}`
          const newText =
            step.templateText.slice(0, start) + placeholder + step.templateText.slice(end)

          const lenDiff = placeholder.length - (end - start)
          const adjustedSlots = step.slots.map((slot) =>
            slot.start >= end
              ? { ...slot, start: slot.start + lenDiff, end: slot.end + lenDiff }
              : slot
          )

          const newSlot: TemplateSlot = {
            id: slotId,
            label,
            value: selectedText,
            start,
            end: start + placeholder.length,
          }

          return {
            steps: s.steps.map((st) =>
              st.id === stepId
                ? {
                    ...st,
                    templateText: newText,
                    slots: [...adjustedSlots, newSlot].sort((a, b) => a.start - b.start),
                  }
                : st
            ),
          }
        })
      },

      removeSlot: (stepId, slotId) => {
        set((s) => {
          const step = s.steps.find((st) => st.id === stepId)
          if (!step) return s
          const slot = step.slots.find((sl) => sl.id === slotId)
          if (!slot) return s

          const placeholder = `{{${slotId}}}`
          const newText = step.templateText.replace(placeholder, slot.value)
          const lenDiff = slot.value.length - placeholder.length

          const adjustedSlots = step.slots
            .filter((sl) => sl.id !== slotId)
            .map((sl) =>
              sl.start > slot.start
                ? { ...sl, start: sl.start + lenDiff, end: sl.end + lenDiff }
                : sl
            )

          return {
            steps: s.steps.map((st) =>
              st.id === stepId ? { ...st, templateText: newText, slots: adjustedSlots } : st
            ),
          }
        })
      },

      buildFilledPrompt: (stepId) => {
        const step = get().steps.find((st) => st.id === stepId)
        if (!step) return ''
        let result = step.templateText
        for (const slot of step.slots) {
          result = result.split(`{{${slot.id}}}`).join(slot.value)
        }
        return result
      },
    }),
    { name: 'fj-prompt-templates' }
  )
)
