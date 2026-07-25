import React, { useState } from 'react'

/**
 * Shared validator avatar with image + fallback.
 * Supports two fallback types: 'letter' (first char of name) and 'icon' (renders children).
 */
export default function ValidatorAvatar({
  src,
  name = '',
  size = 24,
  className = '',
  fallbackClassName = '',
  children,
}) {
  const [failed, setFailed] = useState(!src)

  if (failed) {
    return (
      <div
        className={className}
        style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {children || (
          <span className={fallbackClassName}>
            {(name || 'V').charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={className} style={{ width: size, height: size }}>
      <img
        src={src}
        alt={name}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 'inherit' }}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
