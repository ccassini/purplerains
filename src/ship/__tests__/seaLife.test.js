import { describe, expect, test } from 'vitest'
import { speciesFor, separatePod, TIER_USD, SEA_LIFE_SIZE, SPECIES } from '../seaLife'
import { normalizeInflow, normalizeLifiTransfer, normalizeWormholeOp, freshInflows, chainName, bridgeName, MONAD_CHAIN_ID, WORMHOLE_MONAD } from '../../utils/bridgeApi'

describe('speciesFor', () => {
  test('splits the pod at the configured thresholds', () => {
    expect(speciesFor(0)).toBe('dolphin')
    expect(speciesFor(TIER_USD.dolphin - 0.01)).toBe('dolphin')
    expect(speciesFor(TIER_USD.dolphin)).toBe('orca')
    expect(speciesFor(TIER_USD.orca - 0.01)).toBe('orca')
    expect(speciesFor(TIER_USD.orca)).toBe('whale')
    expect(speciesFor(5_000_000)).toBe('whale')
  })

  test('is monotonic — more value never means a smaller creature', () => {
    const rank = { dolphin: 0, orca: 1, whale: 2 }
    let prev = -1
    for (const usd of [0, 1, 50, 999, 1000, 5000, 9999, 10000, 1e6]) {
      const r = rank[speciesFor(usd)]
      expect(r).toBeGreaterThanOrEqual(prev)
      prev = r
    }
  })

  test('junk input degrades to the smallest creature, never throws', () => {
    expect(speciesFor(NaN)).toBe('dolphin')
    expect(speciesFor(-5)).toBe('dolphin')
    expect(speciesFor(undefined)).toBe('dolphin')
  })

  test('every species has a sprite footprint, larger with rank', () => {
    for (const s of SPECIES) expect(SEA_LIFE_SIZE[s].w).toBeGreaterThan(0)
    expect(SEA_LIFE_SIZE.orca.w).toBeGreaterThan(SEA_LIFE_SIZE.dolphin.w)
    expect(SEA_LIFE_SIZE.whale.w).toBeGreaterThan(SEA_LIFE_SIZE.orca.w)
  })
})

/** Every pair of creatures that share a pixel of water. */
function overlaps(pod) {
  const bad = []
  for (let i = 0; i < pod.length; i++) {
    for (let j = i + 1; j < pod.length; j++) {
      const a = pod[i]
      const b = pod[j]
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x
        || a.y + a.h <= b.y || b.y + b.h <= a.y
      if (!apart) bad.push([i, j])
    }
  }
  return bad
}

describe('separatePod', () => {
  const dolphin = (x, y) => ({ x, y, ...SEA_LIFE_SIZE.dolphin })

  test('breaks up a batch staged on one column', () => {
    // A single poll hands over every settled transfer at once, so without this
    // the whole batch enters on the same pixel and swims as one clump.
    const pod = [dolphin(300, 80), dolphin(300, 80), dolphin(300, 80)]
    separatePod(pod, 14)
    expect(overlaps(pod)).toEqual([])
  })

  test('holds a faster creature astern of the one it is closing on', () => {
    const whale = { x: 100, y: 80, ...SEA_LIFE_SIZE.whale }
    const chaser = dolphin(104, 82)
    separatePod([whale, chaser], 14)
    expect(chaser.x).toBeGreaterThanOrEqual(whale.x + whale.w + 14)
    expect(whale.x).toBe(100)
  })

  test('leaves separate swim lines alone however close their columns', () => {
    const top = dolphin(200, 60)
    const low = dolphin(202, 60 + SEA_LIFE_SIZE.dolphin.h)
    separatePod([top, low], 14)
    expect(top.x).toBe(200)
    expect(low.x).toBe(202)
  })

  test('never drags a creature forward, only back', () => {
    const pod = [dolphin(10, 80), dolphin(400, 80)]
    separatePod(pod, 14)
    expect(pod[0].x).toBe(10)
    expect(pod[1].x).toBe(400)
  })
})

/** Shape of a real Relay request, trimmed to the fields the app reads. */
const relayRequest = (over = {}) => ({
  id: over.id ?? '0xabc',
  status: over.status ?? 'success',
  data: {
    metadata: {
      currencyIn: {
        amountUsd: '6.29',
        currency: { chainId: over.fromChainId ?? 1, symbol: 'ETH' },
      },
      currencyOut: {
        amountUsd: over.usd ?? '5.78',
        currency: { chainId: over.toChainId ?? MONAD_CHAIN_ID, symbol: 'mUSD' },
      },
    },
    outTxs: [{ chainId: MONAD_CHAIN_ID, timestamp: 1785015988, hash: '0xdef' }],
  },
})

describe('normalizeInflow', () => {
  test('reads a real inbound bridge transfer', () => {
    const inflow = normalizeInflow(relayRequest())
    expect(inflow).toMatchObject({
      // Identity is the destination tx hash, so the same transfer seen through
      // two feeds collapses to one animal.
      id: '0xdef',
      usd: 5.78,
      symbol: 'mUSD',
      fromChainId: 1,
      fromChain: 'Ethereum',
      fromSymbol: 'ETH',
      bridge: 'Relay',
      txHash: '0xdef',
    })
  })

  test('rejects same-chain requests — a Monad-to-Monad swap is not a bridge', () => {
    expect(normalizeInflow(relayRequest({ fromChainId: MONAD_CHAIN_ID }))).toBeNull()
  })

  test('rejects requests that did not land on Monad', () => {
    expect(normalizeInflow(relayRequest({ toChainId: 8453 }))).toBeNull()
  })

  test('rejects unsettled requests and zero amounts', () => {
    expect(normalizeInflow(relayRequest({ status: 'pending' }))).toBeNull()
    expect(normalizeInflow(relayRequest({ usd: '0' }))).toBeNull()
    expect(normalizeInflow(null)).toBeNull()
  })
})

describe('chainName', () => {
  test('names the chains the live feed actually sends', () => {
    expect(chainName(1)).toBe('Ethereum')
    expect(chainName(8453)).toBe('Base')
    expect(chainName(792703809)).toBe('Solana')
  })

  test('never invents a name for an unknown id', () => {
    expect(chainName(999999)).toBe('chain 999999')
    expect(chainName(null)).toBe('unknown chain')
  })

  test('names Solana under both bridges\' numbering', () => {
    expect(chainName(792703809)).toBe('Solana')
    expect(chainName(1151111081099710)).toBe('Solana')
  })
})

/** Shape of a real LI.FI analytics transfer, trimmed to what the app reads. */
const lifiTransfer = (over = {}) => ({
  transactionId: over.transactionId ?? '0xlifi',
  status: over.status ?? 'DONE',
  tool: over.tool ?? 'relaydepository',
  sending: {
    chainId: over.fromChainId ?? 8453,
    token: { symbol: 'USDC' },
    amountUSD: '501.0',
  },
  receiving: {
    chainId: over.toChainId ?? MONAD_CHAIN_ID,
    token: { symbol: 'MON' },
    amountUSD: over.usd ?? '498.30',
    txHash: over.txHash ?? '0xdest',
    timestamp: 1785016623,
  },
})

describe('normalizeLifiTransfer', () => {
  test('reads an aggregator transfer and names the underlying bridge', () => {
    expect(normalizeLifiTransfer(lifiTransfer())).toMatchObject({
      id: '0xdest',
      usd: 498.3,
      symbol: 'MON',
      fromChain: 'Base',
      fromSymbol: 'USDC',
      bridge: 'Relay',
      txHash: '0xdest',
    })
  })

  test("drops LI.FI's same-chain swaps — toChain also matches them", () => {
    expect(normalizeLifiTransfer(lifiTransfer({ fromChainId: MONAD_CHAIN_ID }))).toBeNull()
  })

  test('drops unfinished transfers and anything not bound for Monad', () => {
    expect(normalizeLifiTransfer(lifiTransfer({ status: 'PENDING' }))).toBeNull()
    expect(normalizeLifiTransfer(lifiTransfer({ toChainId: 1 }))).toBeNull()
    expect(normalizeLifiTransfer(null)).toBeNull()
  })

  test('produces the same shape as the Relay normalizer', () => {
    const a = normalizeLifiTransfer(lifiTransfer())
    const b = normalizeInflow(relayRequest())
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())
  })
})

describe('bridgeName', () => {
  test('maps routing tools to their product names', () => {
    expect(bridgeName('relaydepository')).toBe('Relay')
    expect(bridgeName('mayanFastMCTP')).toBe('Mayan')
    expect(bridgeName('across')).toBe('Across')
  })

  test('passes an unknown tool through rather than guessing', () => {
    expect(bridgeName('somethingNew')).toBe('somethingNew')
    expect(bridgeName(null)).toBe('bridge')
  })
})

/** Shape of a real Wormholescan operation, trimmed to what the app reads. */
const wormholeOp = (over = {}) => ({
  id: over.id ?? '47/000abc/12',
  content: { standarizedProperties: { toChain: over.toChain ?? WORMHOLE_MONAD } },
  sourceChain: {
    chainId: over.fromChainId ?? 23,
    timestamp: '2026-07-25T16:18:42Z',
    status: 'confirmed',
  },
  data: { symbol: 'USDC', tokenAmount: '9.99', usdAmount: over.usd ?? '9.99' },
})

describe('normalizeWormholeOp', () => {
  test('reads a CCTP-style operation with Wormhole chain numbering', () => {
    const inflow = normalizeWormholeOp(wormholeOp())
    expect(inflow).toMatchObject({
      id: '47/000abc/12',
      usd: 9.99,
      symbol: 'USDC',
      fromChain: 'Arbitrum',
      bridge: 'Wormhole',
    })
    expect(inflow.at).toBeGreaterThan(1_700_000_000)
  })

  test('drops operations not bound for Monad (toChain 48)', () => {
    expect(normalizeWormholeOp(wormholeOp({ toChain: 30 }))).toBeNull()
    expect(normalizeWormholeOp(null)).toBeNull()
  })

  test('drops zero-value and same-chain operations', () => {
    expect(normalizeWormholeOp(wormholeOp({ usd: '0' }))).toBeNull()
    expect(normalizeWormholeOp(wormholeOp({ fromChainId: WORMHOLE_MONAD }))).toBeNull()
  })

  test('names an unlisted Wormhole chain honestly', () => {
    const inflow = normalizeWormholeOp(wormholeOp({ fromChainId: 47 }))
    expect(inflow.fromChain).toBe('Wormhole chain 47')
  })

  test('produces the same shape as the other normalizers', () => {
    const a = normalizeWormholeOp(wormholeOp())
    const b = normalizeInflow(relayRequest())
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())
  })
})

describe('freshInflows — each transfer crosses exactly once', () => {
  const inflow = (id, at) => ({ id, at, usd: 10 })

  test('first sight animates NOTHING and records the newest timestamp', () => {
    const { fresh, next } = freshInflows([inflow('a', 100), inflow('b', 250)], 0)
    expect(fresh).toEqual([])
    expect(next).toBe(250)
  })

  test('only strictly newer transfers are fresh on later polls', () => {
    const { fresh, next } = freshInflows(
      [inflow('c', 300), inflow('b', 250), inflow('a', 100)],
      250,
    )
    expect(fresh.map((i) => i.id)).toEqual(['c'])
    expect(next).toBe(300)
  })

  test('the rolling history window can never re-animate: a second identical poll is empty', () => {
    const batch = [inflow('c', 300), inflow('b', 250), inflow('a', 100)]
    const first = freshInflows(batch, 250)
    const second = freshInflows(batch, first.next)
    expect(second.fresh).toEqual([])
    expect(second.next).toBe(300)
  })

  test('entries without a timestamp are never staged', () => {
    const { fresh } = freshInflows([inflow('x', 0), inflow('y', 400)], 250)
    expect(fresh.map((i) => i.id)).toEqual(['y'])
  })

  test('an empty first poll stays unarmed so history cannot dump next tick', () => {
    const { fresh, next } = freshInflows([], 0)
    expect(fresh).toEqual([])
    expect(next).toBe(0)
    const later = freshInflows([inflow('a', 100), inflow('b', 250)], next)
    expect(later.fresh).toEqual([])
    expect(later.next).toBe(250)
  })

  test('page-open watermark rejects the entire pre-open history window', () => {
    const openedAt = 1_000_000
    const history = [inflow('a', openedAt - 10), inflow('b', openedAt - 1)]
    const { fresh, next } = freshInflows(history, openedAt)
    expect(fresh).toEqual([])
    expect(next).toBe(openedAt)
    const live = freshInflows([inflow('c', openedAt + 5), ...history], next)
    expect(live.fresh.map((i) => i.id)).toEqual(['c'])
    expect(live.next).toBe(openedAt + 5)
  })
})
