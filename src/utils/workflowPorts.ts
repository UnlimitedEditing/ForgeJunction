// ── Per-workflow input port manifest ─────────────────────────────────────────
//
// 90% of workflows use a single default port (init_image_filename).
// This file defines the exceptions with multiple or specialised inputs.

const NODE_H = 114 // must match ChainGraphEditor constant

export interface NodeInputPort {
  field: string            // API field name: 'init_image_filename' | 'image1' | 'audio' etc.
  label: string            // Short human label shown on the port
  tooltip: string          // Full description shown on hover
  mediaType: 'image' | 'video' | 'audio' | 'any'
  isControlnet: boolean    // Whether the image must be sent as a controlnet placeholder
  required: boolean
}

export const DEFAULT_INPUT_PORT: NodeInputPort = {
  field: 'init_image_filename',
  label: 'Input',
  tooltip: 'Primary media input — connect from an upstream node\'s output',
  mediaType: 'any',
  isControlnet: false,
  required: false,
}

// ── Helpers for building port entries ────────────────────────────────────────

function ctrl(index: number, label: string, tooltip: string): NodeInputPort {
  return {
    field: `image${index}`,
    label,
    tooltip: `${tooltip} — image sent as controlnet (set the slug on the edge after connecting)`,
    mediaType: 'image',
    isControlnet: true,
    required: true,
  }
}

const AUDIO_PORT: NodeInputPort = {
  field: 'audio',
  label: 'Audio Input',
  tooltip: 'Audio file input — connect from an upstream audio-producing node',
  mediaType: 'audio',
  isControlnet: false,
  required: true,
}

const IMAGE_IN: NodeInputPort = {
  field: 'init_image_filename',
  label: 'Source Image',
  tooltip: 'Raw image input — connect from an upstream node\'s output',
  mediaType: 'image',
  isControlnet: false,
  required: true,
}

const VIDEO_IN: NodeInputPort = {
  field: 'init_image_filename',
  label: 'Source Video',
  tooltip: 'Raw video input — connect from an upstream node\'s output',
  mediaType: 'video',
  isControlnet: false,
  required: true,
}

// ── Workflow port map ─────────────────────────────────────────────────────────

const WORKFLOW_PORT_MAP: Record<string, NodeInputPort[]> = {

  // ── InfiniteTalk family: controlnet image + audio ─────────────────────────
  'infinitetalk': [
    ctrl(1, 'Reference Image', 'Controlnet reference image for lip-sync animation'),
    AUDIO_PORT,
  ],
  'infinitetalk-read': [
    ctrl(1, 'Reference Image', 'Controlnet reference image for read-aloud animation'),
    AUDIO_PORT,
  ],
  'chatterbox2': [
    ctrl(1, 'Reference Image', 'Controlnet reference image for chatterbox animation'),
    AUDIO_PORT,
  ],

  // ── animate-first-last: two images, one controlnet ────────────────────────
  'animate-first-last': [
    ctrl(1, 'Last Frame', 'Last frame of the animation — passed as controlnet'),
    { ...IMAGE_IN, label: 'First Frame', tooltip: 'First frame of the animation — raw image input' },
  ],

  // ── chatterbox: audio only ────────────────────────────────────────────────
  'chatterbox': [
    AUDIO_PORT,
  ],

  // ── blend2 family: two controlnet images ─────────────────────────────────
  'blend2-qwen': [
    ctrl(1, 'Image 1', 'First blend source — passed as controlnet'),
    ctrl(2, 'Image 2', 'Second blend source — passed as controlnet'),
  ],
  'blend2-flux2': [
    ctrl(1, 'Image 1', 'First blend source — passed as controlnet'),
    ctrl(2, 'Image 2', 'Second blend source — passed as controlnet'),
  ],

  // ── wanimate-face / mocha-replace: face controlnet + target video ─────────
  'wanimate-face': [
    ctrl(1, 'Source Face', 'Face reference image — passed as controlnet'),
    { ...VIDEO_IN, label: 'Target Video', tooltip: 'Video to animate the face onto' },
  ],
  'mocha-replace': [
    ctrl(1, 'Source Face', 'Face reference image — passed as controlnet'),
    { ...VIDEO_IN, label: 'Target Video', tooltip: 'Video to swap the face onto' },
  ],

  // ── headswap family: face controlnet + swap destination image ─────────────
  'headswap-klein': [
    ctrl(1, 'Target Face', 'Face/head image — passed as controlnet'),
    { ...IMAGE_IN, label: 'Swap Destination', tooltip: 'Image to place the head onto' },
  ],
  'headswap-qwen': [
    ctrl(1, 'Target Face', 'Face/head image — passed as controlnet'),
    { ...IMAGE_IN, label: 'Swap Destination', tooltip: 'Image to place the head onto' },
  ],

  // ── wanimate-puppet: source video + puppet controlnet image ───────────────
  'wanimate-puppet': [
    VIDEO_IN,
    ctrl(1, 'Puppet Image', 'Controlnet image driving the puppet motion'),
  ],
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns the input port definitions for a workflow slug, or the single default port. */
export function getInputPorts(workflowSlug: string): NodeInputPort[] {
  return WORKFLOW_PORT_MAP[workflowSlug] ?? [DEFAULT_INPUT_PORT]
}

/**
 * Y position (within node, 0 = top) for an input port at `portIndex` of `portCount` total.
 * Single-port nodes centre the port; multi-port nodes distribute ports within the node body.
 */
export function inputPortY(portIndex: number, portCount: number): number {
  if (portCount === 1) return NODE_H / 2
  const margin = 22
  const range = NODE_H - 2 * margin
  return margin + portIndex * (range / (portCount - 1))
}
