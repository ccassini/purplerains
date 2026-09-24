import { describe, expect, it } from 'vitest'
import {
  ERC20_TRANSFER_TOPIC,
  enrichDefiTransactionFromReceipt,
  getTokenMetadata,
} from '../txEnrichment.js'
import { createBudgetedEnrichmentClient, createRequestBudget } from '../requestBudget'

const SENDER = `0x${'a1'.repeat(20)}`
const POOL = `0x${'b2'.repeat(20)}`
const USDC = '0x754704bc059f8c67012fed69bc8a327a5aafb603'
const WMON = '0x3bd359c1119da7da1d913d1c4d2b7c461115433a'
const PEPE = `0x${'c3'.repeat(20)}`

const padTopic = (addr) => `0x${addr.toLowerCase().slice(2).padStart(64, '0')}`

function transferLog(token, from, to, rawAmount) {
  return {
    address: token,
    topics: [ERC20_TRANSFER_TOPIC, padTopic(from), padTopic(to)],
    data: `0x${rawAmount.toString(16)}`,
  }
}

/** Client whose readContract resolves per-function, and whose receipt is fixed. */
function makeClient(logs, contractAnswers = {}) {
  return {
    getTransactionReceipt: async () => ({ logs }),
    readContract: async ({ functionName }) => {
      if (functionName in contractAnswers) {
        const answer = contractAnswers[functionName]
        if (answer instanceof Error) throw answer
        return answer
      }
      throw new Error(`unexpected readContract ${functionName}`)
    },
  }
}

describe('getTokenMetadata decimals honesty', () => {
  it('trusts on-chain decimals()==18 even for USD-named symbols', async () => {
    const client = makeClient([], { decimals: 18, symbol: 'XUSD' })
    const meta = await getTokenMetadata(client, new Map(), PEPE)
    expect(meta.decimals).toBe(18)
    expect(meta.symbol).toBe('XUSD')
  })

  it('keeps on-chain 6 decimals for stables', async () => {
    const client = makeClient([], { decimals: 6, symbol: 'CUSD' })
    const meta = await getTokenMetadata(client, new Map(), PEPE)
    expect(meta.decimals).toBe(6)
  })

  it('preserves an on-chain decimals of 0', async () => {
    const client = makeClient([], { decimals: 0, symbol: 'SHARDS' })
    const meta = await getTokenMetadata(client, new Map(), PEPE)
    expect(meta.decimals).toBe(0)
  })

  it('falls back to the stable heuristic only when decimals() is unavailable', async () => {
    const client = makeClient([], {
      decimals: new Error('no decimals()'),
      symbol: 'SOMEUSD',
    })
    const meta = await getTokenMetadata(client, new Map(), PEPE)
    expect(meta.decimals).toBe(6)
  })

  it('defaults to 18 when decimals() fails for a non-stable', async () => {
    const client = makeClient([], {
      decimals: new Error('no decimals()'),
      symbol: 'PEPE',
    })
    const meta = await getTokenMetadata(client, new Map(), PEPE)
    expect(meta.decimals).toBe(18)
  })

  it('serves known tokens without any on-chain call', async () => {
    const client = {
      readContract: async () => {
        throw new Error('must not be called')
      },
    }
    const meta = await getTokenMetadata(client, new Map(), WMON)
    expect(meta).toMatchObject({ symbol: 'WMON', decimals: 18 })
  })

  it('does not cache guessed token metadata when the optional budget defers a lookup', async () => {
    const cache = new Map()
    const client = createBudgetedEnrichmentClient(makeClient([], { decimals: 6, symbol: 'PEPE' }), () => false)
    await expect(getTokenMetadata(client, cache, PEPE)).rejects.toMatchObject({ name: 'RequestBudgetError' })
    expect(cache.has(PEPE)).toBe(false)
  })
})

describe('enrichDefiTransactionFromReceipt usdValue honesty', () => {
  const tx = { hash: `0x${'d4'.repeat(32)}`, from: SENDER, to: POOL }

  it.each(['reverted', 'failed', '0x0', 0, false])('propagates failed receipt status %s even with no logs', async (status) => {
    const raw = Object.freeze({ ...tx, status: 'success' })
    let reads = 0
    const client = {
      getTransactionReceipt: async () => ({ status, logs: [] }),
      readContract: async () => { reads += 1 },
    }
    const enriched = await enrichDefiTransactionFromReceipt(client, new Map(), raw)
    expect(enriched).toEqual({ ...raw, status: 'reverted' })
    expect(enriched).not.toBe(raw)
    expect(raw.status).toBe('success')
    expect(reads).toBe(0)
  })

  it.each(['success', '0x1', 1, true, undefined])('does not mistake receipt status %s for a failed transaction', async (status) => {
    const client = { getTransactionReceipt: async () => ({ status, logs: [] }) }
    expect(await enrichDefiTransactionFromReceipt(client, new Map(), tx)).toBe(tx)
  })

  it('reports usdValue from the stable side the sender paid', async () => {
    const logs = [
      transferLog(USDC, SENDER, POOL, 100n * 10n ** 6n),
      transferLog(WMON, POOL, SENDER, 50n * 10n ** 18n),
    ]
    const enriched = await enrichDefiTransactionFromReceipt(makeClient(logs), new Map(), tx)
    expect(enriched.usdValue).toBe(100)
    expect(enriched.pairLabel).toBe('USDC/WMON')
    expect(enriched.price).toBeCloseTo(0.5)
  })

  it('reports usdValue from the stable side the sender received', async () => {
    const logs = [
      transferLog(WMON, SENDER, POOL, 2n * 10n ** 18n),
      transferLog(USDC, POOL, SENDER, 7n * 10n ** 6n),
    ]
    const enriched = await enrichDefiTransactionFromReceipt(makeClient(logs), new Map(), tx)
    expect(enriched.usdValue).toBe(7)
  })

  it('omits usdValue entirely for non-stable pairs instead of inventing one', async () => {
    const logs = [
      transferLog(WMON, SENDER, POOL, 3n * 10n ** 18n),
      transferLog(PEPE, POOL, SENDER, 9n * 10n ** 18n),
    ]
    const client = makeClient(logs, { decimals: 18, symbol: 'PEPE' })
    const enriched = await enrichDefiTransactionFromReceipt(client, new Map(), tx)
    expect('usdValue' in enriched).toBe(false)
    // The honest fields still come through.
    expect(enriched.pairLabel).toBe('WMON/PEPE')
    expect(enriched.price).toBeCloseTo(3)
    expect(enriched.baseAmount).toBeCloseTo(3)
    expect(enriched.quoteAmount).toBeCloseTo(9)
  })

  it('keeps the original transaction when a metadata subcall exhausts enrichment allowance', async () => {
    const cache = new Map()
    const budget = createRequestBudget({ now: () => 0, optionalLimit: 2 })
    const logs = [
      transferLog(USDC, SENDER, POOL, 100n * 10n ** 6n),
      transferLog(PEPE, POOL, SENDER, 9n * 10n ** 6n),
    ]
    const client = createBudgetedEnrichmentClient(makeClient(logs, { decimals: 6, symbol: 'PEPE' }), () => {
      if (!budget.hasBudget('enrichment')) return false
      budget.track('enrichment')
      return true
    })
    expect(await enrichDefiTransactionFromReceipt(client, cache, tx)).toBe(tx)
    expect(cache.has(PEPE)).toBe(false)
    expect(budget.getSnapshot().optionalCount).toBe(2)
  })

  it('skips irrelevant multihop token metadata and spends the budget on the sender legs', async () => {
    const intermediateToken = `0x${'e5'.repeat(20)}`
    const nextPool = `0x${'f6'.repeat(20)}`
    const logs = [
      transferLog(intermediateToken, POOL, nextPool, 999n * 10n ** 18n),
      transferLog(USDC, SENDER, POOL, 100n * 10n ** 6n),
      transferLog(PEPE, nextPool, SENDER, 9n * 10n ** 6n),
    ]
    const reads = []
    const cache = new Map()
    const budget = createRequestBudget({ now: () => 0, optionalLimit: 3 })
    const client = createBudgetedEnrichmentClient({
      getTransactionReceipt: async () => ({ logs }),
      readContract: async ({ address, functionName }) => {
        reads.push({ address, functionName })
        return functionName === 'decimals' ? 6 : 'PEPE'
      },
    }, () => {
      if (!budget.hasBudget('enrichment')) return false
      budget.track('enrichment')
      return true
    })
    const enriched = await enrichDefiTransactionFromReceipt(client, cache, tx)
    expect(reads).toEqual([{ address: PEPE, functionName: 'decimals' }, { address: PEPE, functionName: 'symbol' }])
    expect(cache.has(intermediateToken)).toBe(false)
    expect(enriched).toMatchObject({ baseAmount: 100, baseTokenAddress: USDC, quoteAmount: 9, quoteTokenAddress: PEPE, quoteDecimalsVerified: true, usdValue: 100 })
    expect(budget.getSnapshot().optionalCount).toBe(3)
  })
})

describe('token decimal provenance for downstream financial displays', () => {
  it('distinguishes successful 8-decimal metadata from an 18-decimal fallback', async () => {
    const verified = await getTokenMetadata(makeClient([], { decimals: 8, symbol: 'cbBTC' }), new Map(), PEPE)
    const guessed = await getTokenMetadata(makeClient([], { decimals: new Error('RPC unavailable'), symbol: 'cbBTC' }), new Map(), PEPE)
    expect(verified).toMatchObject({ decimals: 8, decimalsVerified: true })
    expect(guessed).toMatchObject({ decimals: 18, decimalsVerified: false })
  })

  it('marks known-contract and zero-decimal metadata as verified', async () => {
    const known = await getTokenMetadata(makeClient([]), new Map(), USDC)
    const zero = await getTokenMetadata(makeClient([], { decimals: 0, symbol: 'SHARD' }), new Map(), PEPE)
    expect(known.decimalsVerified).toBe(true)
    expect(zero).toMatchObject({ decimals: 0, decimalsVerified: true })
  })

  it('carries decimal provenance through both swap legs without changing legacy numeric fields', async () => {
    const tx = { hash: '0xcbtc', from: SENDER, to: POOL }
    const logs = [transferLog(PEPE, SENDER, POOL, 500000n), transferLog(USDC, POOL, SENDER, 415710000n)]
    const failed = await enrichDefiTransactionFromReceipt(makeClient(logs, { decimals: new Error('RPC unavailable'), symbol: 'cbBTC' }), new Map(), tx)
    const verified = await enrichDefiTransactionFromReceipt(makeClient(logs, { decimals: 8, symbol: 'cbBTC' }), new Map(), tx)
    expect(failed).toMatchObject({ baseAmount: 5e-13, baseDecimalsVerified: false, quoteDecimalsVerified: true, usdValue: 415.71, usdValueVerified: true })
    expect(verified).toMatchObject({ baseAmount: 0.005, baseDecimals: 8, baseDecimalsVerified: true, quoteDecimalsVerified: true })
  })
})
