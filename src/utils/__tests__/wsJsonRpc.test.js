import { describe, expect, test, vi } from 'vitest'
import { createWsRpcBridge } from '../wsJsonRpc'

describe('createWsRpcBridge', () => {
  test('resolves callOn when a matching id reply arrives', async () => {
    const bridge = createWsRpcBridge()
    const sent = []
    const ws = {
      readyState: 1, // OPEN
      send: (raw) => sent.push(JSON.parse(raw)),
    }

    const p = bridge.callOn(/** @type {any} */ (ws), 'eth_blockNumber', [])
    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('eth_blockNumber')
    expect(sent[0].id).toBe(2)

    expect(bridge.handleMessage({ jsonrpc: '2.0', id: 2, result: '0x64' })).toBe(true)
    await expect(p).resolves.toBe('0x64')
  })

  test('ignores subscription frames so the live path can keep them', () => {
    const bridge = createWsRpcBridge()
    expect(
      bridge.handleMessage({
        method: 'eth_subscription',
        params: { result: { number: '0x1' } },
      }),
    ).toBe(false)
  })

  test('rejects on timeout', async () => {
    vi.useFakeTimers()
    const bridge = createWsRpcBridge()
    const ws = { readyState: 1, send: () => {} }
    const p = bridge.callOn(/** @type {any} */ (ws), 'eth_getBlockByNumber', ['0x1', true], 100)
    const assertion = expect(p).rejects.toThrow(/timeout/i)
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    vi.useRealTimers()
  })
})
