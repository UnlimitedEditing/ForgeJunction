import React from 'react'
import type { SkillDocument } from '@/stores/skillEditor'
import { validateSkill } from '@/utils/skillValidator'

interface Props {
  doc: SkillDocument
}

export default function ValidationBar({ doc }: Props): React.ReactElement {
  const result = validateSkill(doc)
  const { score, total, checks } = result
  const pct = Math.round((score / total) * 100)

  let barColor = 'bg-red-600'
  let textColor = 'text-red-400'
  if (score >= 6) { barColor = 'bg-emerald-500'; textColor = 'text-emerald-400' }
  else if (score >= 4) { barColor = 'bg-yellow-500'; textColor = 'text-yellow-400' }
  else if (score >= 2) { barColor = 'bg-orange-500'; textColor = 'text-orange-400' }

  const failed = checks.filter(c => !c.passed)

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-white/8 bg-neutral-950/60 flex-shrink-0">
      {/* Progress bar */}
      <div className="relative w-28 h-1.5 rounded-full bg-white/10 flex-shrink-0 overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Score */}
      <span className={`text-[11px] font-semibold tabular-nums flex-shrink-0 ${textColor}`}>
        {score} / {total}
      </span>

      {score >= 6 ? (
        <span className="text-[11px] text-emerald-400 font-semibold flex-shrink-0">✓ Ready to publish</span>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {failed.map(c => (
            <span
              key={c.id}
              className="text-[10px] px-1.5 py-0.5 rounded bg-white/6 text-white/50 border border-white/8"
              title={c.hint}
            >
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
