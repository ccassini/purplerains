import { describe, expect, it } from 'vitest'
import { acceptTransfers, connectionSummary, explorerLink, filterTransfers, makeNodes, mapTransfer, summarizeTransfers } from '../agoraModel'

const nodes = makeNodes([{ city: 'Tokyo', country: 'Japan', lat: 35, lon: 139 }, { city: 'London', country: 'UK', lat: 51, lon: 0 }])
const transfer = { chainId: 143, txHash: '0xabc', logIndex: 0, from: '0xabcdef', to: '0x12345', amount: 12.5, blockNumber: 12 }

describe('Agora visual feed', () => {
  it('keeps address anchors stable across hashes, case, chains and scene order', () => {
    const a = mapTransfer(transfer, nodes)
    const b = mapTransfer({ ...transfer, chainId: 1, txHash: '0xother', from: '0xABCDEF' }, makeNodes([...nodes].reverse()))
    expect(a.fromNode).toEqual(b.fromNode)
    expect(a.toNode).toEqual(b.toNode)
  })
  it('retains distinct logs in one transaction and deduplicates repeated results', () => {
    const seen = new Set()
    expect(acceptTransfers([transfer, { ...transfer, logIndex: 1 }, transfer], nodes, seen, 100)).toHaveLength(2)
    expect(acceptTransfers([transfer], nodes, seen, 200)).toHaveLength(0)
  })
  it('classifies mint and burn from the zero address, never guesses swaps', () => {
    expect(mapTransfer({ ...transfer, kind: 'swap' }, nodes).kind).toBe('transfer')
    expect(mapTransfer({ ...transfer, from: `0x${'0'.repeat(40)}` }, nodes).kind).toBe('mint')
    expect(mapTransfer({ ...transfer, to: `0x${'0'.repeat(40)}` }, nodes).kind).toBe('burn')
  })
  it('sorts different chains by observation time rather than incomparable block heights', () => {
    const rows = acceptTransfers([{ ...transfer, receivedAt: 200 }, { ...transfer, chainId: 1, blockNumber: 500000, receivedAt: 100 }], nodes, new Set())
    expect(rows[0].chainId).toBe(143)
  })
  it('bounds duplicate bookkeeping on a long running stream', () => {
    const seen = new Set()
    acceptTransfers(Array.from({ length: 4200 }, (_, logIndex) => ({ ...transfer, logIndex })), nodes, seen)
    expect(seen.size).toBe(4096)
  })
  it('applies chain, kind and node filters together and totals only displayed events', () => {
    const rows = [mapTransfer(transfer, nodes), mapTransfer({ ...transfer, chainId: 1, kind: 'swap', amount: 20 }, nodes)]
    const filtered = filterTransfers(rows, '143', 'transfer', rows[0].fromNode.id)
    expect(summarizeTransfers(filtered)).toEqual({ count: 1, volume: 12.5 })
    expect(filterTransfers(rows, 'all', 'mint')).toEqual([])
  })
  it('does not describe failed or stale chains as live', () => {
    expect(connectionSummary([{ status: 'error' }]).label).toBe('Reconnecting')
    expect(connectionSummary([{ status: 'live', lastSuccessAt: 1 }], 60_000).live).toBe(false)
    expect(connectionSummary([{ status: 'live', lastSuccessAt: 1 }], 60_000).label).toBe('Reconnecting')
    expect(connectionSummary([{ status: 'live', lastSuccessAt: 100 }, { status: 'error' }], 200).label).toBe('Partial coverage')
  })
  it('only builds explorer links from trusted https chain metadata and hex IDs', () => {
    expect(explorerLink({ explorerUrl: 'https://monadscan.com/' }, 'tx', '0xabc')).toBe('https://monadscan.com/tx/0xabc')
    expect(explorerLink({ explorerUrl: 'javascript:alert(1)' }, 'tx', '0xabc')).toBeNull()
  })
})
