import type {
  Block,
  SkillMeta,
  PurposeBlock,
  WorkflowBlock,
  RuleBlock,
  CommandTemplateBlock,
  ExampleBlock,
  WarningBlock,
  NoteBlock,
  RawBlock,
  TemplateVariable,
} from '@/stores/skillEditor'

export interface ParsedBlock {
  block: Block
  confidence: 'high' | 'low'
}

export interface ParseResult {
  meta: Partial<SkillMeta>
  blocks: ParsedBlock[]
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function parseSkillText(text: string): ParseResult {
  const lines = text.split('\n')
  const meta: Partial<SkillMeta> = {}
  const blocks: ParsedBlock[] = []
  let order = 0

  // Extract skill name from first # heading
  let titleFound = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (!titleFound && trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      meta.name = trimmed.slice(2).trim()
      titleFound = true
    }
  }

  // Split into sections by ## headings
  type Section = { heading: string; body: string[] }
  const sections: Section[] = []
  let currentSection: Section | null = null
  let inSkillHeader = true

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip the # title line
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      inSkillHeader = false
      continue
    }

    if (trimmed.startsWith('## ')) {
      inSkillHeader = false
      if (currentSection) sections.push(currentSection)
      currentSection = { heading: trimmed.slice(3).trim(), body: [] }
    } else if (currentSection) {
      currentSection.body.push(line)
    } else if (!inSkillHeader) {
      // Lines before first ## section but after title
      if (trimmed && !trimmed.startsWith('# ')) {
        if (!meta.description) meta.description = trimmed
      }
    }
  }
  if (currentSection) sections.push(currentSection)

  for (const section of sections) {
    const heading = section.heading.toLowerCase()
    const body = section.body.join('\n').trim()
    const bodyLines = section.body.map(l => l.trim()).filter(Boolean)

    // ## Purpose
    if (heading === 'purpose' || heading.startsWith('purpose')) {
      if (body) {
        const block: PurposeBlock = { id: genId(), type: 'purpose', order: order++, content: body }
        blocks.push({ block, confidence: 'high' })
      }
      continue
    }

    // ## Target Workflow / Target
    if (heading.startsWith('target')) {
      const slugLine = bodyLines.find(l => l.toLowerCase().startsWith('- slug:') || l.toLowerCase().startsWith('slug:'))
      const typeLine = bodyLines.find(l => l.toLowerCase().startsWith('- type:') || l.toLowerCase().startsWith('type:'))
      const notesLine = bodyLines.find(l => l.toLowerCase().startsWith('- notes:') || l.toLowerCase().startsWith('notes:'))

      const slug = slugLine ? slugLine.replace(/^-?\s*slug:\s*/i, '').trim() : ''
      const commandType = typeLine ? typeLine.replace(/^-?\s*type:\s*/i, '').trim() : 'txt2img'
      const notes = notesLine ? notesLine.replace(/^-?\s*notes:\s*/i, '').trim() : ''

      if (slug) {
        meta.targetWorkflow = slug
      }

      const block: WorkflowBlock = {
        id: genId(),
        type: 'workflow',
        order: order++,
        slug,
        commandType,
        notes,
      }
      blocks.push({ block, confidence: slug ? 'high' : 'low' })
      continue
    }

    // ## Rules
    if (heading === 'rules' || heading.startsWith('rule')) {
      for (const line of bodyLines) {
        if (!line.startsWith('-')) continue
        const content = line.slice(1).trim()
        let priority: 'required' | 'optional' | 'never' = 'required'
        let cleanContent = content

        if (content.startsWith('[REQUIRED]')) {
          priority = 'required'
          cleanContent = content.slice('[REQUIRED]'.length).trim()
        } else if (content.startsWith('[OPTIONAL]')) {
          priority = 'optional'
          cleanContent = content.slice('[OPTIONAL]'.length).trim()
        } else if (content.startsWith('[NEVER]')) {
          priority = 'never'
          cleanContent = content.slice('[NEVER]'.length).trim()
        }

        const block: RuleBlock = {
          id: genId(),
          type: 'rule',
          order: order++,
          content: cleanContent,
          priority,
        }
        blocks.push({ block, confidence: 'high' })
      }
      continue
    }

    // ## Command Template / Commands
    if (heading.startsWith('command')) {
      // Extract template from code block or raw lines
      let template = ''
      const codeBlockMatch = body.match(/```[\s\S]*?\n([\s\S]*?)```/)
      if (codeBlockMatch) {
        template = codeBlockMatch[1].trim()
      } else {
        // Grab lines that look like commands
        const cmdLines = bodyLines.filter(l =>
          l.startsWith('/wf') || l.startsWith('/run:') || l.startsWith('/render')
        )
        template = cmdLines.join('\n')
      }

      // Parse variables table
      const variables: TemplateVariable[] = []
      const tableLines = bodyLines.filter(l => l.startsWith('|') && !l.startsWith('|---') && !l.toLowerCase().startsWith('| variable'))
      for (const tl of tableLines) {
        const cols = tl.split('|').map(c => c.trim()).filter(Boolean)
        if (cols.length >= 2) {
          variables.push({
            name: cols[0],
            description: cols[1] ?? '',
            required: (cols[2] ?? '').toLowerCase() === 'yes',
            default: cols[3] ?? undefined,
          })
        }
      }

      // Also extract {VARIABLE} tokens from template
      const varTokens = [...(template.matchAll(/\{([A-Z][A-Z0-9_]*)\}/g))].map(m => m[1])
      for (const token of varTokens) {
        if (!variables.find(v => v.name === token)) {
          variables.push({ name: token, description: '', required: true })
        }
      }

      const block: CommandTemplateBlock = {
        id: genId(),
        type: 'command_template',
        order: order++,
        template,
        variables,
      }
      blocks.push({ block, confidence: template ? 'high' : 'low' })
      continue
    }

    // ## Examples
    if (heading === 'examples' || heading.startsWith('example')) {
      let currentUser = ''
      let currentCmd = ''
      let currentNotes = ''

      function flushExample() {
        if (currentUser || currentCmd) {
          const block: ExampleBlock = {
            id: genId(),
            type: 'example',
            order: order++,
            userInput: currentUser,
            command: currentCmd,
            notes: currentNotes,
          }
          blocks.push({ block, confidence: 'high' })
        }
        currentUser = ''
        currentCmd = ''
        currentNotes = ''
      }

      for (const line of bodyLines) {
        if (line.startsWith('User:')) {
          if (currentUser || currentCmd) flushExample()
          currentUser = line.slice('User:'.length).trim()
        } else if (line.startsWith('Command:')) {
          currentCmd = line.slice('Command:'.length).trim()
        } else if (line.startsWith('Notes:')) {
          currentNotes = line.slice('Notes:'.length).trim()
        } else if (line.startsWith('/wf') || line.startsWith('/run:') || line.startsWith('/render')) {
          currentCmd = line
        }
      }
      flushExample()
      continue
    }

    // ## Warnings
    if (heading === 'warnings' || heading.startsWith('warning')) {
      for (const line of bodyLines) {
        if (line.startsWith('>')) {
          const content = line.slice(1).trim()
          let severity: 'info' | 'caution' | 'critical' = 'info'
          let cleanContent = content

          const sevMatch = content.match(/^\[(info|caution|critical)\]\s*/i)
          if (sevMatch) {
            severity = sevMatch[1].toLowerCase() as 'info' | 'caution' | 'critical'
            cleanContent = content.slice(sevMatch[0].length).trim()
          }

          const block: WarningBlock = {
            id: genId(),
            type: 'warning',
            order: order++,
            content: cleanContent,
            severity,
          }
          blocks.push({ block, confidence: 'high' })
        }
      }
      continue
    }

    // ## Notes
    if (heading === 'notes' || heading === 'note') {
      if (body) {
        const block: NoteBlock = {
          id: genId(),
          type: 'note',
          order: order++,
          content: body,
        }
        blocks.push({ block, confidence: 'high' })
      }
      continue
    }

    // Unmatched section — raw block
    if (body) {
      const block: RawBlock = {
        id: genId(),
        type: 'raw',
        order: order++,
        content: `## ${section.heading}\n${body}`,
      }
      blocks.push({ block, confidence: 'low' })
    }
  }

  // Also parse any rule/example/warning lines that appear outside sections
  // (fallback heuristic pass)
  for (const line of lines) {
    const trimmed = line.trim()

    // Standalone rule lines
    if (trimmed.match(/^- \[(REQUIRED|OPTIONAL|NEVER)\]/)) {
      const alreadyParsed = blocks.some(
        pb => pb.block.type === 'rule' &&
        (pb.block as RuleBlock).content === trimmed.replace(/^- \[(REQUIRED|OPTIONAL|NEVER)\]\s*/, '')
      )
      if (!alreadyParsed) {
        const priority = trimmed.includes('[REQUIRED]') ? 'required' : trimmed.includes('[OPTIONAL]') ? 'optional' : 'never'
        const content = trimmed.replace(/^- \[(REQUIRED|OPTIONAL|NEVER)\]\s*/, '')
        const block: RuleBlock = { id: genId(), type: 'rule', order: order++, content, priority }
        blocks.push({ block, confidence: 'high' })
      }
      continue
    }

    // Standalone warning lines
    if (trimmed.startsWith('> ') && !trimmed.startsWith('> [')) {
      const content = trimmed.slice(2).trim()
      const alreadyParsed = blocks.some(pb => pb.block.type === 'warning' && (pb.block as WarningBlock).content === content)
      if (!alreadyParsed) {
        const block: WarningBlock = { id: genId(), type: 'warning', order: order++, content, severity: 'info' }
        blocks.push({ block, confidence: 'low' })
      }
    }
  }

  return { meta, blocks }
}
