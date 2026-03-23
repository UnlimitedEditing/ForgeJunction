import type {
  SkillDocument,
  Block,
  PurposeBlock,
  WorkflowBlock,
  RuleBlock,
  CommandTemplateBlock,
  ExampleBlock,
  WarningBlock,
  NoteBlock,
  RawBlock,
} from '@/stores/skillEditor'

function sortedBlocks(doc: SkillDocument): Block[] {
  return [...doc.blocks].sort((a, b) => a.order - b.order)
}

export function serializeSkill(doc: SkillDocument): string {
  const lines: string[] = []
  const blocks = sortedBlocks(doc)

  // Title
  lines.push(`# ${doc.meta.name}`)
  lines.push('')

  if (doc.meta.description) {
    lines.push(doc.meta.description)
    lines.push('')
  }

  // Group blocks by type for structured output, preserving raw block positions
  const purposeBlocks = blocks.filter(b => b.type === 'purpose') as PurposeBlock[]
  const workflowBlocks = blocks.filter(b => b.type === 'workflow') as WorkflowBlock[]
  const ruleBlocks = blocks.filter(b => b.type === 'rule') as RuleBlock[]
  const commandBlocks = blocks.filter(b => b.type === 'command_template') as CommandTemplateBlock[]
  const exampleBlocks = blocks.filter(b => b.type === 'example') as ExampleBlock[]
  const warningBlocks = blocks.filter(b => b.type === 'warning') as WarningBlock[]
  const noteBlocks = blocks.filter(b => b.type === 'note') as NoteBlock[]
  const rawBlocks = blocks.filter(b => b.type === 'raw') as RawBlock[]

  // Collect raw block orders for injection
  const rawByOrder = new Map(rawBlocks.map(b => [b.order, b]))

  // We'll track which raw blocks have been emitted
  const emittedRaw = new Set<string>()

  // Helper to inject raw blocks that appear before a given order
  function injectRawBefore(order: number) {
    for (const [rawOrder, rb] of rawByOrder.entries()) {
      if (rawOrder < order && !emittedRaw.has(rb.id)) {
        emittedRaw.add(rb.id)
        lines.push(rb.content)
        lines.push('')
      }
    }
  }

  // ## Purpose
  if (purposeBlocks.length > 0) {
    const firstOrder = purposeBlocks[0].order
    injectRawBefore(firstOrder)
    lines.push('## Purpose')
    lines.push('')
    for (const pb of purposeBlocks) {
      lines.push(pb.content)
      lines.push('')
    }
  }

  // ## Target Workflow
  if (workflowBlocks.length > 0) {
    const firstOrder = workflowBlocks[0].order
    injectRawBefore(firstOrder)
    lines.push('## Target Workflow')
    lines.push('')
    for (const wb of workflowBlocks) {
      lines.push(`- Slug: ${wb.slug}`)
      lines.push(`- Type: ${wb.commandType}`)
      if (wb.notes) lines.push(`- Notes: ${wb.notes}`)
      lines.push('')
    }
  }

  // ## Rules
  if (ruleBlocks.length > 0) {
    const firstOrder = ruleBlocks[0].order
    injectRawBefore(firstOrder)
    lines.push('## Rules')
    lines.push('')
    // Sort: required → optional → never
    const priorityOrder = { required: 0, optional: 1, never: 2 }
    const sortedRules = [...ruleBlocks].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    )
    for (const rb of sortedRules) {
      const prefix = rb.priority === 'required'
        ? '[REQUIRED]'
        : rb.priority === 'optional'
        ? '[OPTIONAL]'
        : '[NEVER]'
      lines.push(`- ${prefix} ${rb.content}`)
    }
    lines.push('')
  }

  // ## Command Template
  if (commandBlocks.length > 0) {
    const firstOrder = commandBlocks[0].order
    injectRawBefore(firstOrder)
    for (const cb of commandBlocks) {
      lines.push('## Command Template')
      lines.push('')
      lines.push('```')
      lines.push(cb.template)
      lines.push('```')
      lines.push('')

      if (cb.variables.length > 0) {
        lines.push('### Variables')
        lines.push('')
        lines.push('| Variable | Description | Required | Default |')
        lines.push('|----------|-------------|----------|---------|')
        for (const v of cb.variables) {
          lines.push(`| ${v.name} | ${v.description} | ${v.required ? 'Yes' : 'No'} | ${v.default ?? ''} |`)
        }
        lines.push('')
      }
    }
  }

  // ## Examples
  if (exampleBlocks.length > 0) {
    const firstOrder = exampleBlocks[0].order
    injectRawBefore(firstOrder)
    lines.push('## Examples')
    lines.push('')
    for (const eb of exampleBlocks) {
      lines.push(`User: ${eb.userInput}`)
      lines.push(`Command: ${eb.command}`)
      if (eb.notes) lines.push(`Notes: ${eb.notes}`)
      lines.push('')
    }
  }

  // ## Warnings
  if (warningBlocks.length > 0) {
    const firstOrder = warningBlocks[0].order
    injectRawBefore(firstOrder)
    lines.push('## Warnings')
    lines.push('')
    for (const wb of warningBlocks) {
      lines.push(`> [${wb.severity}] ${wb.content}`)
    }
    lines.push('')
  }

  // ## Notes
  if (noteBlocks.length > 0) {
    const firstOrder = noteBlocks[0].order
    injectRawBefore(firstOrder)
    lines.push('## Notes')
    lines.push('')
    for (const nb of noteBlocks) {
      lines.push(nb.content)
      lines.push('')
    }
  }

  // Inject any remaining raw blocks at end
  for (const rb of rawBlocks) {
    if (!emittedRaw.has(rb.id)) {
      lines.push(rb.content)
      lines.push('')
    }
  }

  // Trim trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  return lines.join('\n')
}
