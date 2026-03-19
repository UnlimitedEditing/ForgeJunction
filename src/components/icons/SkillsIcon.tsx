import React from 'react'

interface Props {
  size?: number
  className?: string
}

// Two lightning bolts side by side — the Skills icon.
// viewBox 0 0 20 20, overflow visible.
// Each bolt: top-right corner → diagonal down-left → kink right → diagonal down-left to bottom,
// then back up-right on the inner edge.
function bolt(ox: number): string {
  // Bolt fits in an ~8-wide × 18-tall space starting at (ox, 1)
  return [
    `M ${ox + 8}   1`,    // top-right
    `L ${ox + 2}  10`,    // diagonal down-left to mid
    `L ${ox + 5.5} 10`,   // kink right
    `L ${ox + 0}  19`,    // diagonal down-left to bottom
    `L ${ox + 7}   9`,    // diagonal back up-right
    `L ${ox + 3.5}  9`,   // inner kink left
    'Z',
  ].join(' ')
}

export default function SkillsIcon({ size = 16, className }: Props): React.ReactElement {
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
      {/* Left bolt */}
      <path d={bolt(1)} opacity={0.7} />
      {/* Right bolt — offset right, slightly behind */}
      <path d={bolt(9)} opacity={1} />
    </svg>
  )
}
