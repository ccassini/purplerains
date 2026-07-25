import React from 'react'

const shimmerStyle = {
  background: 'linear-gradient(90deg, rgba(139,92,246,0.06) 25%, rgba(139,92,246,0.12) 50%, rgba(139,92,246,0.06) 75%)',
  backgroundSize: '200% 100%',
  animation: 'skeleton-shimmer 1.5s ease-in-out infinite',
  borderRadius: 8
}

export function SkeletonLine({ width = '100%', height = 16, style }) {
  return (
    <div
      aria-hidden="true"
      style={{ ...shimmerStyle, width, height, ...style }}
    />
  )
}

export function SkeletonCard({ height = 80, style }) {
  return (
    <div
      aria-hidden="true"
      style={{
        ...shimmerStyle,
        width: '100%',
        height,
        borderRadius: 12,
        ...style
      }}
    />
  )
}

export function SkeletonCircle({ size = 40, style }) {
  return (
    <div
      aria-hidden="true"
      style={{
        ...shimmerStyle,
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        ...style
      }}
    />
  )
}

// Inject keyframes once
if (typeof document !== 'undefined') {
  const styleId = 'skeleton-shimmer-keyframes'
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement('style')
    styleEl.id = styleId
    styleEl.textContent = `
      @keyframes skeleton-shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
    `
    document.head.appendChild(styleEl)
  }
}
