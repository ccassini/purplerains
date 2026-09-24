import { describe, expect, test, vi } from 'vitest'
import { createTerminalFlowTracker, createTerminalFlowController } from '../terminalFlow'

const row = (id, extra = {}) => ({ id, ts: Number(id), ...extra })

function element(id, top, height = 32) {
  const names = new Set()
  return {
    dataset: { flowId: id }, offsetTop: top, offsetHeight: height,
    classList: { add: (...items) => items.forEach((item) => names.add(item)), remove: (...items) => items.forEach((item) => names.delete(item)), contains: (item) => names.has(item) },
    animate: vi.fn(() => ({ cancel: vi.fn(), effect: { getComputedTiming: () => ({ progress: 0.5 }) }, finished: new Promise(() => {}) })),
  }
}
const root = (elements) => ({ querySelectorAll: () => elements })

describe('terminal flow arrival identity', () => {
  test('initial data is immediately available without an animation or reveal queue', () => {
    const tracker = createTerminalFlowTracker()
    const input = [row('3'), row('2'), row('1')]
    const plan = tracker.update(input, { enabled: true, resetKey: 'swaps' })
    expect(plan.animate).toBe(false)
    expect(plan.entries.map((entry) => entry.row)).toEqual(input)
    expect(plan.entries[0].row).toBe(input[0])
  })
  test('recognizes new top arrivals while preserving the identity of pushed rows', () => {
    const tracker = createTerminalFlowTracker()
    const previous = [row('3'), row('2'), row('1')]
    tracker.update(previous, { resetKey: 'swaps' })
    const next = [row('5'), row('4'), ...previous]
    const plan = tracker.update(next, { resetKey: 'swaps' })
    expect(plan.animate).toBe(true)
    expect(plan.newIds).toEqual(['5', '4'])
    expect(plan.entries.find((entry) => entry.id === '3')).toMatchObject({ previousId: '3', row: previous[0] })
    expect(plan.entries.find((entry) => entry.id === '3').row).toBe(previous[0])
  })
  test('metadata-only updates and reconciled source IDs are not new arrivals', () => {
    const tracker = createTerminalFlowTracker()
    tracker.update([row('c:tx', { ts: 1, amount: null })])
    expect(tracker.update([row('c:tx', { ts: 1, amount: 20 })]).animate).toBe(false)
    expect(tracker.update([row('g:event', { ts: 1, amount: 20, sourceIds: ['c:tx', 'g:event'] })]).animate).toBe(false)
    expect(tracker.update([row('g:event', { ts: 1, amount: 20 })]).animate).toBe(false)
  })
  test('historical insertions and reorderings do not pretend to be top arrivals', () => {
    const tracker = createTerminalFlowTracker()
    tracker.update([row('3'), row('1')])
    expect(tracker.update([row('3'), row('2'), row('1')]).animate).toBe(false)
    expect(tracker.update([row('1'), row('2'), row('3')]).animate).toBe(false)
  })
  test('filter changes, paused pages and resuming establish an unanimated baseline', () => {
    const tracker = createTerminalFlowTracker()
    tracker.update([row('1')], { resetKey: 'swaps' })
    expect(tracker.update([row('2')], { resetKey: 'transfers' }).animate).toBe(false)
    expect(tracker.update([row('3')], { resetKey: 'transfers', enabled: false }).animate).toBe(false)
    expect(tracker.update([row('4')], { resetKey: 'transfers', enabled: true }).animate).toBe(false)
    expect(tracker.update([row('5'), row('4')], { resetKey: 'transfers', enabled: true }).animate).toBe(true)
    tracker.reset()
    expect(tracker.update([row('6')], { resetKey: 'transfers' }).animate).toBe(false)
  })
  test('a complete new burst animates immediately while tracking only the 18 displayed rows', () => {
    const tracker = createTerminalFlowTracker()
    tracker.update(Array.from({ length: 1000 }, (_, n) => row(String(1000 - n))))
    const plan = tracker.update(Array.from({ length: 1000 }, (_, n) => row(String(2000 - n))))
    expect(plan.animate).toBe(true)
    expect(plan.entries).toHaveLength(18)
    expect(plan.newIds).toHaveLength(18)
    expect(tracker.retainedCount).toBe(18)
  })
})

describe('bounded row motion lifecycle', () => {
  test('moves existing rows downward from their old position and introduces new rows without delaying data', () => {
    const controller = createTerminalFlowController()
    const first = element('1', 0)
    controller.update(root([first]), [row('1')])
    expect(first.animate).not.toHaveBeenCalled()
    first.offsetTop = 32
    const next = element('2', 0)
    controller.update(root([next, first]), [row('2'), row('1')])
    expect(first.animate.mock.calls[0][0]).toEqual([{ transform: 'translateY(-32px)' }, { transform: 'translateY(0px)' }])
    expect(next.animate.mock.calls[0][0][0].opacity).toBeLessThan(1)
    expect(first.animate.mock.calls[0][1].duration).toBe(180)
    expect(controller.activeCount).toBe(2)
    controller.dispose()
    expect(controller.activeCount).toBe(0)
    expect(first.animate.mock.results[0].value.cancel).toHaveBeenCalledOnce()
    expect(first.classList.contains('term-flow-moving')).toBe(false)
  })
  test('metadata updates keep an existing movement running without starting another one', () => {
    const controller = createTerminalFlowController()
    const first = element('1', 0)
    controller.update(root([first]), [row('1')])
    first.offsetTop = 32
    const next = element('2', 0)
    const view = root([next, first])
    controller.update(view, [row('2'), row('1')])
    controller.update(view, [row('2', { amount: 100 }), row('1')])
    expect(first.animate).toHaveBeenCalledTimes(1)
    expect(next.animate).toHaveBeenCalledTimes(1)
    expect(first.animate.mock.results[0].value.cancel).not.toHaveBeenCalled()
    controller.dispose()
  })
  test('overlapping arrivals continue from the visible animation position instead of snapping', () => {
    const controller = createTerminalFlowController()
    const first = element('1', 0)
    controller.update(root([first]), [row('1')])
    first.offsetTop = 32
    const second = element('2', 0)
    controller.update(root([second, first]), [row('2'), row('1')])
    first.offsetTop = 64; second.offsetTop = 32
    const third = element('3', 0)
    controller.update(root([third, second, first]), [row('3'), row('2'), row('1')])
    // Halfway from 0px to32px leaves row1 visually at16px; its new target is64px.
    expect(first.animate.mock.calls[1][0][0].transform).toBe('translateY(-48px)')
    expect(first.animate.mock.results[0].value.cancel).toHaveBeenCalledOnce()
    controller.dispose()
  })
  test('disable/reset cancels all effects and a detached/disposed controller cannot animate', () => {
    const controller = createTerminalFlowController()
    const first = element('1', 0)
    controller.update(root([first]), [row('1')])
    const next = element('2', 0); first.offsetTop = 32
    const view = root([next, first])
    controller.update(view, [row('2'), row('1')])
    controller.update(view, [row('2'), row('1')], { enabled: false })
    expect(controller.activeCount).toBe(0)
    controller.update(view, [row('2'), row('1')], { enabled: true })
    expect(next.animate).toHaveBeenCalledTimes(1)
    controller.reset()
    controller.update(view, [row('2'), row('1')])
    expect(next.animate).toHaveBeenCalledTimes(1)
    controller.dispose()
    controller.update(root([element('3', 0), next, first]), [row('3'), row('2'), row('1')])
    expect(controller.activeCount).toBe(0)
  })
})
