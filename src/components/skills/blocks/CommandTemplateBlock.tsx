import React, { useEffect } from 'react'
import type { CommandTemplateBlock as CommandTemplateBlockType, TemplateVariable } from '@/stores/skillEditor'
import { useSkillEditorStore } from '@/stores/skillEditor'
import CodeMirrorEditor from '@/components/skills/CodeMirrorEditor'

interface Props {
  block: CommandTemplateBlockType
  skillId: string
  readOnly?: boolean
}

function extractVariables(template: string): string[] {
  const matches = [...template.matchAll(/\{([A-Z][A-Z0-9_]*)\}/g)]
  const seen = new Set<string>()
  const result: string[] = []
  for (const m of matches) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      result.push(m[1])
    }
  }
  return result
}

export default function CommandTemplateBlock({ block, skillId, readOnly }: Props): React.ReactElement {
  const { updateBlock } = useSkillEditorStore()

  // Sync variables when template changes
  useEffect(() => {
    const tokenNames = extractVariables(block.template)
    const existingVars = block.variables

    // Add new variables (preserve existing descriptions)
    const newVars: TemplateVariable[] = tokenNames.map(name => {
      const existing = existingVars.find(v => v.name === name)
      if (existing) return existing
      return { name, description: '', required: true, default: undefined }
    })

    // Remove variables that no longer appear in template
    const updated = newVars.filter(v => tokenNames.includes(v.name))

    // Only update if different
    const existingNames = existingVars.map(v => v.name).join(',')
    const newNames = updated.map(v => v.name).join(',')
    if (existingNames !== newNames) {
      updateBlock(skillId, block.id, { variables: updated } as Partial<CommandTemplateBlockType>)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.template])

  function updateVariable(name: string, patch: Partial<TemplateVariable>) {
    const updated = block.variables.map(v => v.name === name ? { ...v, ...patch } : v)
    updateBlock(skillId, block.id, { variables: updated } as Partial<CommandTemplateBlockType>)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[10px] text-white/45 uppercase tracking-wider mb-1.5">Command Template</label>
        <CodeMirrorEditor
          value={block.template}
          onChange={val => !readOnly && updateBlock(skillId, block.id, { template: val } as Partial<CommandTemplateBlockType>)}
          readOnly={readOnly}
          minHeight="100px"
        />
      </div>

      {block.variables.length > 0 && (
        <div>
          <label className="block text-[10px] text-white/45 uppercase tracking-wider mb-1.5">Variables</label>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="text-left py-1 pr-2 text-[10px] text-white/40 font-normal">Name</th>
                  <th className="text-left py-1 pr-2 text-[10px] text-white/40 font-normal">Description</th>
                  <th className="text-center py-1 pr-2 text-[10px] text-white/40 font-normal w-16">Required</th>
                  <th className="text-left py-1 text-[10px] text-white/40 font-normal">Default</th>
                </tr>
              </thead>
              <tbody>
                {block.variables.map(v => (
                  <tr key={v.name} className="border-b border-white/5">
                    <td className="py-1 pr-2">
                      <code className="text-[11px] text-cyan-400 bg-cyan-950/30 px-1 rounded">{'{' + v.name + '}'}</code>
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="text"
                        value={v.description}
                        readOnly={readOnly}
                        onChange={e => updateVariable(v.name, { description: e.target.value })}
                        placeholder="What is this for?"
                        className="w-full bg-transparent text-white/70 placeholder-white/20 outline-none border-b border-white/8 focus:border-cyan-500/50 text-xs py-0.5"
                      />
                    </td>
                    <td className="py-1 pr-2 text-center">
                      <input
                        type="checkbox"
                        checked={v.required}
                        disabled={readOnly}
                        onChange={e => updateVariable(v.name, { required: e.target.checked })}
                        className="accent-cyan-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-1">
                      <input
                        type="text"
                        value={v.default ?? ''}
                        readOnly={readOnly}
                        onChange={e => updateVariable(v.name, { default: e.target.value || undefined })}
                        placeholder="optional"
                        className="w-full bg-transparent text-white/50 placeholder-white/20 outline-none border-b border-white/8 focus:border-cyan-500/50 text-xs py-0.5 font-mono"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {block.variables.length === 0 && block.template && (
        <p className="text-[10px] text-white/35 italic">
          No <code className="text-cyan-400/60">{'{VARIABLE}'}</code> tokens found — add uppercase tokens to the template to document variables.
        </p>
      )}
    </div>
  )
}
