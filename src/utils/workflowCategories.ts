import type { Workflow } from '@/api/graydient'

export type WorkflowCategory =
  | 'Text→Image'
  | 'Image→Image'
  | 'Text→Video'
  | 'Image→Video'
  | 'Video→Video'
  | 'Video→Image'
  | 'Text→Audio'
  | 'Video→Audio'
  | 'Audio→Text'

const FLAG_CATEGORY_MAP: Array<[keyof Workflow, WorkflowCategory]> = [
  ['supports_txt2img', 'Text→Image'],
  ['supports_img2img', 'Image→Image'],
  ['supports_txt2vid', 'Text→Video'],
  ['supports_img2vid', 'Image→Video'],
  ['supports_vid2vid', 'Video→Video'],
  ['supports_vid2img', 'Video→Image'],
  ['supports_txt2wav', 'Text→Audio'],
  ['supports_vid2wav', 'Video→Audio'],
  ['supports_wav2txt', 'Audio→Text'],
]

export function categorizeWorkflow(workflow: Workflow): WorkflowCategory[] {
  return FLAG_CATEGORY_MAP
    .filter(([flag]) => workflow[flag] === true)
    .map(([, category]) => category)
}

export const ALL_CATEGORIES: WorkflowCategory[] = FLAG_CATEGORY_MAP.map(([, c]) => c)
