import React from 'react'

interface Props {
  size?: number
  className?: string
}

function starPath(cx: number, cy: number, r: number, ir: number, points = 4): string {
  const pts: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2
    const radius = i % 2 === 0 ? r : ir
    pts.push(`${cx + Math.cos(angle) * radius} ${cy + Math.sin(angle) * radius}`)
  }
  return 'M ' + pts.join(' L ') + ' Z'
}

// Main outer radius. Inner radius = 33% of outer for a crisp 4-pointed star.
const R = 7.5
const IR = R * 0.33

export default function SkillStar({ size = 16, className }: Props): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      overflow="visible"
      className={className}
      aria-hidden
    >
      {/* Main star — center 9,11 */}
      <path d={starPath(9, 11, R, IR)} opacity={1} />
      {/* Medium star — 66% scale, top-right cascade */}
      <path d={starPath(15.5, 5, R * 0.66, IR * 0.66)} opacity={0.78} />
      {/* Small star — 33% scale, further top-right */}
      <path d={starPath(20, 1, R * 0.33, IR * 0.33)} opacity={0.55} />
    </svg>
  )
}
