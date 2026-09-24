import { useLayoutEffect, useRef } from 'react'
import { createTerminalFlowController } from './terminalFlow'
import './TerminalFlow.css'

/** Attach the returned ref to the activity table's existing wrapper. */
export function useTerminalFlow({ rows, enabled = true, active = true, resetKey } = {}) {
  const flowRef = useRef(null)
  const controllerRef = useRef(null)
  const motionQueryRef = useRef(null)

  useLayoutEffect(() => {
    const controller = createTerminalFlowController()
    const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    controllerRef.current = controller
    motionQueryRef.current = query
    // Visibility and preference changes cancel effects immediately. The next
    // React snapshot becomes a baseline, so resuming never replays a backlog.
    const reset = () => controller.reset()
    query?.addEventListener?.('change', reset)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', reset)
    return () => {
      controller.dispose()
      query?.removeEventListener?.('change', reset)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', reset)
      controllerRef.current = null
      motionQueryRef.current = null
    }
  }, [])

  useLayoutEffect(() => {
    const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
    controllerRef.current?.update(flowRef.current, rows || [], {
      enabled: enabled && active && visible && !motionQueryRef.current?.matches,
      resetKey,
    })
  }, [rows, enabled, active, resetKey])

  return flowRef
}
