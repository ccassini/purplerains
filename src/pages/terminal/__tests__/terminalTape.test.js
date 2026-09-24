import { describe, expect, test } from 'vitest'
import { TAPE_CAP } from '../constants'
import { selectTerminalTape } from '../terminalTape'

const rows = [
  { id: 'one', pool: 'pool-a', wallet: 'wallet-a', token: 'token-a', symbol: 'MON', side: 'buy', usd: 300 },
  { id: 'two', pool: 'pool-b', wallet: 'wallet-b', token: 'token-b', symbol: 'MON', side: 'buy', usd: 200 },
  { id: 'three', pool: 'pool-a', wallet: 'wallet-b', token: 'token-a', symbol: 'MON', side: 'sell', usd: 100 },
]

describe('terminal inspection and tape scope', () => {
  test.each(['pool', 'wallet', 'token'])('inspecting a %s leaves other observed trades visible until explicitly scoped', (type) => {
    const selected = { type, id: `${type}-a` }
    const all = selectTerminalTape(rows, { selected })
    expect(all.map((fill) => fill.id)).toEqual(['one', 'two', 'three'])
    const related = selectTerminalTape(rows, { selected, selectedOnly: true })
    expect(related.map((fill) => fill.id)).toEqual(type === 'wallet' ? ['one'] : ['one', 'three'])
    // Returning to all activity retains the inspected item without losing incoming data.
    const incoming = { ...rows[1], id: 'new' }
    expect(selectTerminalTape([incoming, ...rows], { selected, selectedOnly: false }).map((fill) => fill.id))
      .toEqual(['new', 'one', 'two', 'three'])
  })

  test('explicit selected scope intersects search, direction and amount filters', () => {
    const selected = { type: 'pool', id: 'pool-a' }
    expect(selectTerminalTape(rows, { selected, selectedOnly: true, q: 'MON', side: 'buys', minUsd: 200 }).map((fill) => fill.id))
      .toEqual(['one'])
    expect(selectTerminalTape(rows, { selected, selectedOnly: false, q: 'MON', side: 'buys', minUsd: 200 }).map((fill) => fill.id))
      .toEqual(['one', 'two'])
    expect(selectTerminalTape(rows, { selected: null, selectedOnly: true })).toEqual(rows)
  })

  test('applies the output cap after filtering without mutating source observations', () => {
    const source = Array.from({ length: TAPE_CAP * 3 }, (_, index) => ({ ...rows[index % 2], id: String(index) }))
    const idsBefore = source.map((fill) => fill.id)
    const selected = selectTerminalTape(source, { selected: { type: 'pool', id: 'pool-b' }, selectedOnly: true })
    expect(selected).toHaveLength(TAPE_CAP)
    expect(selected.every((fill) => fill.pool === 'pool-b')).toBe(true)
    expect(selected.at(-1).id).toBe(String(TAPE_CAP * 2 - 1))
    expect(source.map((fill) => fill.id)).toEqual(idsBefore)
  })
})

describe('RPC and indexed source selection', () => {
  const rows = [
    { id: 'rpc', source: 'chain', kind: 'flow' },
    { id: 'indexed', source: 'gecko' },
    { id: 'both', source: 'gecko', sources: ['chain', 'gecko'] },
  ]
  test('keeps RPC observations and reconciled events in the live view', () => {
    expect(selectTerminalTape(rows, { source: 'chain' }).map((r) => r.id)).toEqual(['rpc', 'both'])
    expect(selectTerminalTape(rows, { source: 'gecko' }).map((r) => r.id)).toEqual(['indexed', 'both'])
    expect(selectTerminalTape(rows, { source: 'all' })).toEqual(rows)
  })
})
