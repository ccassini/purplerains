import { useEffect } from 'react'
import { WINDOWS } from './constants'

function typingTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useKeyboard({
  setWindowId,
  toggleSound,
  toggleFollow,
  toggleClean,
  focusFilter,
  clearSelection,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (typingTarget(e.target)) {
        if (e.key === 'Escape') e.target.blur()
        return
      }
      const win = WINDOWS.find((w) => w.key === e.key)
      if (win) {
        e.preventDefault()
        setWindowId(win.id)
        return
      }
      if (e.key === 's') {
        e.preventDefault()
        toggleSound()
        return
      }
      if (e.key === 'f') {
        e.preventDefault()
        toggleFollow()
        return
      }
      if (e.key === 'c') {
        e.preventDefault()
        toggleClean()
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        focusFilter()
        return
      }
      if (e.key === 'Escape') {
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setWindowId, toggleSound, toggleFollow, toggleClean, focusFilter, clearSelection])
}
