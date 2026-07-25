import React, { useId, useState } from 'react'
import { SPEED } from './constants'

export function TapeVenueLogo({ srcs, title, fallbackIcon, fallbackHexColor, fallbackBadge }) {
  const candidates = Array.isArray(srcs) ? srcs.filter(Boolean) : (srcs ? [srcs] : [])
  const [idx, setIdx] = useState(0)
  const activeSrc = candidates[idx] || null

  if (activeSrc) {
    return (
      <span className="tape-logo" title={title} aria-hidden="true">
        <img
          src={activeSrc}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setIdx((n) => n + 1)}
        />
      </span>
    )
  }

  if (fallbackIcon) {
    return (
      <span
        className="tape-logo tape-logo--icon"
        title={title}
        aria-hidden="true"
        style={{ color: `#${fallbackHexColor || 'e5e7eb'}` }}
      >
        <svg viewBox="0 0 24 24" focusable="false">
          <path d={fallbackIcon.path} />
        </svg>
      </span>
    )
  }

  return fallbackBadge
}

export function SparklineSVG({ data, width = 120, height = 28 }) {
  const gradId = useId().replace(/:/g, '')
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const isUp = data[data.length - 1] >= data[0]
  const stroke = isUp ? SPEED.purple : '#ff6b7a'
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - 2 - ((v - min) / range) * (height - 4)
    return [x, y]
  })
  const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const areaD = `${lineD} L ${width},${height} L 0,${height} Z`
  return (
    <svg className="sparkline-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.45" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path d={lineD} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
