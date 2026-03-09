import knowledge from '@/data/workflow-knowledge.json'

type WorkflowEntry = (typeof knowledge.workflow_specific_knowledge)[keyof typeof knowledge.workflow_specific_knowledge]
type GlobalConstraints = typeof knowledge.global_parameter_constraints

// ── getWorkflowTips ────────────────────────────────────────────────────────

export interface WorkflowTips {
  description: string | null
  tips: string[]
  knownIssues: string[]
  recommendedParams: Record<string, string>
}

export function getWorkflowTips(slug: string): WorkflowTips {
  const wk = knowledge.workflow_specific_knowledge as Record<string, WorkflowEntry>
  const entry = wk[slug] as Record<string, unknown> | undefined

  return {
    description: (entry?.description as string) ?? null,
    tips: ((entry?.prompt_tips as string[]) ?? []),
    knownIssues: ((entry?.known_issues as string[]) ?? []),
    recommendedParams: ((entry?.recommended_params as Record<string, string>) ?? {}),
  }
}

// ── getParamConstraints ────────────────────────────────────────────────────

export interface ParamConstraints {
  min?: number
  max?: number
  recommended?: string
  notes?: string
}

export function getParamConstraints(slug: string, paramName: string): ParamConstraints {
  const globalConstraints = knowledge.global_parameter_constraints as Record<string, Record<string, unknown>>
  const wk = knowledge.workflow_specific_knowledge as Record<string, Record<string, unknown>>
  const entry = wk[slug]

  // Check workflow-specific recommended_params first
  const recParams = entry?.recommended_params as Record<string, string> | undefined
  if (recParams?.[paramName]) {
    return { recommended: recParams[paramName] }
  }

  // Fall back to global constraints
  const global = globalConstraints[paramName]
  if (!global) return {}

  return {
    min: global.absolute_min_observed as number | undefined,
    max: global.absolute_max_observed as number | undefined,
    notes: global.notes as string | undefined,
  }
}

// ── getWorkflowChains ──────────────────────────────────────────────────────

export interface WorkflowChain {
  name: string
  description: string
  steps: string[]
}

export function getWorkflowChains(slug: string): WorkflowChain[] {
  const chains = knowledge.workflow_chains as Record<string, { description: string; steps: string[]; notes?: string }>
  const results: WorkflowChain[] = []

  for (const [chainName, chain] of Object.entries(chains)) {
    const involved = chain.steps.some((s) => s.includes(slug))
    if (involved) {
      results.push({
        name: chainName,
        description: chain.description,
        steps: chain.steps,
      })
    }
  }

  return results
}

// ── getErrorHelp ───────────────────────────────────────────────────────────

export interface ErrorHelp {
  cause: string
  fix: string
}

export function getErrorHelp(errorMessage: string): ErrorHelp | null {
  const patterns = knowledge.error_patterns as Record<
    string,
    { description: string; triggers?: string[]; remedies?: string[]; fix?: string; remedy?: string }
  >

  const lower = errorMessage.toLowerCase()

  for (const [key, pattern] of Object.entries(patterns)) {
    let matched = false

    // Match by key terms
    if (key === 'memory_exceeded' && (lower.includes('memory') || lower.includes('vram') || lower.includes('out of memory') || lower.includes('cuda'))) {
      matched = true
    } else if (key === 'failed_to_convert_float' && lower.includes('float')) {
      matched = true
    } else if (key === 'corrupted_model' && lower.includes('corrupt')) {
      matched = true
    } else if (key === 'rendering_now_infinite' && lower.includes('rendering now')) {
      matched = true
    } else if (key === 'lora_not_applied' && lower.includes('lora')) {
      matched = true
    } else if (key === 'concept_syntax_error' && lower.includes('<<')) {
      matched = true
    } else if (key === 'video_smoky_glitch' && lower.includes('smoky')) {
      matched = true
    } else if (key === 'faceswap_15_broken' && (lower.includes('faceswap') || lower.includes('facepush'))) {
      matched = true
    } else if (key === 'unhandled_error' && lower.includes('unhandled')) {
      matched = true
    }

    if (matched) {
      const fix = pattern.fix ?? (Array.isArray(pattern.remedies) ? pattern.remedies[0] : undefined) ?? pattern.remedy ?? 'See documentation.'
      return {
        cause: pattern.description,
        fix,
      }
    }
  }

  // Fallback: generic unhandled
  if (lower.includes('error') || lower.includes('fail')) {
    const unhandled = patterns.unhandled_error
    return {
      cause: unhandled.description,
      fix: unhandled.remedies?.[0] ?? 'Retry the render.',
    }
  }

  return null
}

// ── validatePromptParams ───────────────────────────────────────────────────

export function validatePromptParams(slug: string, params: Record<string, string>): string[] {
  const warnings: string[] = []
  const gc = knowledge.global_parameter_constraints as GlobalConstraints & Record<string, Record<string, unknown>>
  const wk = knowledge.workflow_specific_knowledge as Record<string, Record<string, unknown>>
  const entry = wk[slug] as Record<string, unknown> | undefined

  // Detect model family from slug
  const isFlux = slug.startsWith('flux') || (entry?.model_family as string | undefined)?.includes('flux')
  const isVideo = (entry?.type as string | undefined)?.includes('vid')

  for (const [key, rawVal] of Object.entries(params)) {
    const val = rawVal.trim()

    if (key === 'guidance') {
      const num = parseFloat(val)
      if (!isNaN(num)) {
        if (isFlux && num > 3.5) {
          warnings.push(`/guidance:${val} is too high for Flux workflows — recommended 1.0–3.5`)
        } else if (!isFlux && !isVideo && num > 16) {
          warnings.push(`/guidance:${val} exceeds observed maximum of 16`)
        }
      }
    }

    if (key === 'images') {
      const num = parseInt(val, 10)
      if (!isNaN(num) && num > 9) {
        warnings.push(`/images:${val} exceeds absolute max of 9`)
      } else if (!isNaN(num) && num > 3 && entry) {
        warnings.push(`/images:${val} — using more than 3 images with LoRAs may cause failures`)
      }
    }

    if (key === 'strength') {
      const wfType = entry?.type as string | undefined
      if (!wfType || wfType === 'txt2img') {
        warnings.push(`/strength should not be used for txt2img workflows — it will leave the image 50% unfinished`)
      }
    }

    if (key === 'size') {
      const match = val.match(/^(\d+)x(\d+)$/)
      if (match) {
        const w = parseInt(match[1], 10)
        const h = parseInt(match[2], 10)
        if (w > 3000 || h > 3000) {
          warnings.push(`/size:${val} — images above 3000px on any side cause delivery issues`)
        }
        if (isVideo && (w > 768 || h > 768)) {
          warnings.push(`/size:${val} is above 768×768 — video workflows frequently fail above this resolution`)
        }
      }
    }

    if (key === 'nofix' || key === 'clipskip') {
      if (isFlux) {
        warnings.push(`/${key} is an SDXL-specific flag and is incompatible with Flux workflows`)
      }
    }

    if (key === 'lpw') {
      warnings.push(`/lpw (Long Prompt Weighting) does not work with LoRAs — remove LoRAs or remove /lpw`)
    }

    if (key === 'slot8' && slug === 'flux') {
      warnings.push(`/slot8 on the flux workflow must NOT be the last parameter before the prompt — move it earlier to avoid FLOAT parse error`)
    }
  }

  return warnings
}
