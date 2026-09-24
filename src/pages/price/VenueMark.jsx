import React, { useState } from 'react'
import {
  VENUE_ICON,
  VENUE_LOGO_SRC,
  venueColor,
  venueLabel,
  venueMonogram,
} from './venueBranding'
import './tables.css'

/**
 * Venue logo with a three-step fallback: bundled asset → vector mark → tinted
 * monogram. Always renders something, so tape rows never show an empty slot.
 *
 * @param {{ venueKey: string, size?: number }} props
 */
export default function VenueMark({ venueKey, size = 18 }) {
  const [idx, setIdx] = useState(0)
  const label = venueLabel(venueKey)
  const candidates = VENUE_LOGO_SRC[venueKey] || []
  const src = candidates[idx]
  const style = { '--mark-size': `${size}px` }

  if (src) {
    return (
      <span className="pr-mark" title={label} style={style}>
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setIdx((n) => n + 1)}
        />
      </span>
    )
  }

  const icon = VENUE_ICON[venueKey]
  if (icon) {
    return (
      <span
        className="pr-mark pr-mark--vector"
        title={label}
        style={{ ...style, color: `#${icon.hex}` }}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d={icon.path} />
        </svg>
      </span>
    )
  }

  return (
    <span
      className="pr-mark pr-mark--mono"
      title={label}
      style={{ ...style, '--mark-accent': venueColor(venueKey) }}
    >
      {venueMonogram(venueKey)}
    </span>
  )
}
