import type { SkillDocument, PurposeBlock, WorkflowBlock, RuleBlock, CommandTemplateBlock, ExampleBlock } from '@/stores/skillEditor'

export interface ValidationCheck {
  id: string
  label: string
  passed: boolean
  hint?: string
}

export interface ValidationResult {
  score: number
  total: number
  checks: ValidationCheck[]
}

export function validateSkill(doc: SkillDocument): ValidationResult {
  const blocks = doc.blocks

  // 1. has_purpose
  const purposeBlocks = blocks.filter(b => b.type === 'purpose') as PurposeBlock[]
  const hasPurpose = purposeBlocks.some(b => b.content.trim().length > 0)

  // 2. has_workflow
  const workflowBlocks = blocks.filter(b => b.type === 'workflow') as WorkflowBlock[]
  const hasWorkflow = workflowBlocks.some(b => b.slug.trim().length > 0)

  // 3. has_rules
  const ruleBlocks = blocks.filter(b => b.type === 'rule') as RuleBlock[]
  const hasRules = ruleBlocks.length > 0

  // 4. has_command_template
  const commandBlocks = blocks.filter(b => b.type === 'command_template') as CommandTemplateBlock[]
  const hasCommandTemplate = commandBlocks.some(b => b.template.trim().length > 0)

  // 5. has_examples (≥ 2 with both userInput and command filled)
  const exampleBlocks = blocks.filter(b => b.type === 'example') as ExampleBlock[]
  const filledExamples = exampleBlocks.filter(
    b => b.userInput.trim().length > 0 && b.command.trim().length > 0
  )
  const hasExamples = filledExamples.length >= 2

  // 6. no_undefined_vars — all {VARIABLE} tokens in command_template have entries in variables array
  let noUndefinedVars = true
  for (const cb of commandBlocks) {
    if (!cb.template) continue
    const tokens = [...cb.template.matchAll(/\{([A-Z][A-Z0-9_]*)\}/g)].map(m => m[1])
    for (const token of tokens) {
      if (!cb.variables.find(v => v.name === token)) {
        noUndefinedVars = false
        break
      }
    }
    if (!noUndefinedVars) break
  }

  const checks: ValidationCheck[] = [
    {
      id: 'has_purpose',
      label: 'Purpose defined',
      passed: hasPurpose,
      hint: 'Add a Purpose block describing what this skill does',
    },
    {
      id: 'has_workflow',
      label: 'Workflow linked',
      passed: hasWorkflow,
      hint: 'Add a Workflow block with a valid slug',
    },
    {
      id: 'has_rules',
      label: 'Rules present',
      passed: hasRules,
      hint: 'Add at least one Rule block',
    },
    {
      id: 'has_command_template',
      label: 'Command template defined',
      passed: hasCommandTemplate,
      hint: 'Add a Command Template block with the command pattern',
    },
    {
      id: 'has_examples',
      label: '2+ examples with input & command',
      passed: hasExamples,
      hint: `${filledExamples.length}/2 complete examples — add more with User Input and Command filled`,
    },
    {
      id: 'no_undefined_vars',
      label: 'All variables documented',
      passed: noUndefinedVars,
      hint: 'Some {VARIABLE} tokens in your template have no variable entry',
    },
  ]

  const score = checks.filter(c => c.passed).length

  return { score, total: 6, checks }
}
