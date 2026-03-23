import React from 'react'

interface Props {
  size?: number
  className?: string
}

// Open book icon for Skills.
export default function SkillsIcon({ size = 16, className }: Props): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      {/* Left page */}
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h5A1.5 1.5 0 0 1 10 4.5v11a.5.5 0 0 1-.8.4A6 6 0 0 0 3.5 14H3a1 1 0 0 1-1-1V4.5Z" opacity="0.75" />
      {/* Right page */}
      <path d="M18 4.5A1.5 1.5 0 0 0 16.5 3h-5A1.5 1.5 0 0 0 10 4.5v11a.5.5 0 0 0 .8.4A6 6 0 0 1 16.5 14H17a1 1 0 0 0 1-1V4.5Z" />
      {/* Spine line */}
      <rect x="9.25" y="3" width="1.5" height="13" rx="0.75" opacity="0.4" />
    </svg>
  )
}
