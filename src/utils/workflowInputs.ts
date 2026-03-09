import type { Workflow, WorkflowFieldMapping } from '@/api/graydient'

export interface MediaInputSlot {
  fieldName: string              // "init_image_filename", "image1", "image2"
  type: 'primary' | 'secondary' // primary = init_image, secondary = named placeholder
  label: string                  // Human-readable
  helpText: string | null
  defaultHint: string | null
  required: boolean
  acceptsMediaType: 'image' | 'video' | 'audio' | 'any'
}

export function getWorkflowInputSlots(workflow: Workflow): MediaInputSlot[] {
  const slots: MediaInputSlot[] = []

  if (!workflow.field_mapping) return slots

  const initField = workflow.field_mapping.find(f => f.local_field === 'init_image_filename') ?? null

  for (const field of workflow.field_mapping) {
    const name = field.local_field

    if (name === 'init_image_filename') {
      slots.push({
        fieldName: name,
        type: 'primary',
        label: inferLabel(field, workflow),
        helpText: field.help_text || null,
        defaultHint: field.default_value !== null && field.default_value !== undefined ? String(field.default_value) || null : null,
        required: isPrimaryRequired(field),
        acceptsMediaType: inferMediaType(workflow),
      })
      continue
    }

    const imageMatch = name.match(/^image(\d+)$/)
    if (imageMatch) {
      // If this secondary slot points to the same ComfyUI node as init_image_filename,
      // it's an alias — filling either is sufficient → mark as not required
      const fieldWithNode = field as WorkflowFieldMapping & { node_id?: string | null }
      const initWithNode = initField as (WorkflowFieldMapping & { node_id?: string | null }) | null
      const sameNode =
        initWithNode?.node_id != null &&
        fieldWithNode?.node_id != null &&
        initWithNode.node_id === fieldWithNode.node_id

      slots.push({
        fieldName: name,
        type: 'secondary',
        label: field.help_text || `Reference Image ${imageMatch[1]}`,
        helpText: field.help_text || null,
        defaultHint: field.default_value !== null && field.default_value !== undefined ? String(field.default_value) || null : null,
        required: !sameNode,
        acceptsMediaType: 'image',
      })
    }
  }

  return slots
}

function inferLabel(field: WorkflowFieldMapping, workflow: Workflow): string {
  if (field.default_value !== null && field.default_value !== undefined && String(field.default_value) !== '') {
    const hint = String(field.default_value).toLowerCase()
    if (hint.includes('first frame')) return 'First Frame'
    if (hint.includes('source')) return 'Source Image'
    if (hint.includes('reply')) return 'Source Media'
  }
  if (workflow.supports_img2vid) return 'Source Image (to animate)'
  if (workflow.supports_img2img) return 'Source Image (to edit)'
  if (workflow.supports_vid2vid) return 'Source Video'
  if (workflow.supports_vid2wav) return 'Source Video (for audio)'
  return 'Source Media'
}

function inferMediaType(workflow: Workflow): 'image' | 'video' | 'audio' | 'any' {
  if (workflow.supports_img2img || workflow.supports_img2vid) return 'image'
  if (workflow.supports_vid2vid || workflow.supports_vid2img || workflow.supports_vid2wav) return 'video'
  if (workflow.supports_wav2txt) return 'audio'
  return 'any'
}

function isPrimaryRequired(field: WorkflowFieldMapping): boolean {
  const val = String(field.default_value ?? '').toLowerCase()
  return !val || val.includes('reply') || val.includes('source') || val === ''
}
