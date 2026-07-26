import { describe, expect, it } from 'vitest'
import {
  ERC20_TRANSFER_TOPIC,
  enrichDefiTransactionFromReceipt,
  getTokenMetadata,
} from '../txEnrichment.js'

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
})

describe('enrichDefiTransactionFromReceipt usdValue honesty', () => {
  const tx = { hash: `0x${'d4'.repeat(32)}`, from: SENDER, to: POOL }

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
})
