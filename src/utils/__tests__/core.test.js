import { describe, expect, it } from 'vitest'
import { formatUsd, formatAmount, isStablecoin } from '../formatters.js'
import {
  encodeDelegateCalldata,
  encodeUndelegateCalldata,
  decodeGetEpochResult,
  SELECTOR,
} from '../stakingPrecompile.js'
import {
  decodeTokenAmount,
  isStableSymbol,
  normalizeBlockNumber,
  toNumberish,
} from '../txEnrichment.js'
import {
  parseMetricPage,
  hasUsefulMetrics,
} from '../validatorMetricsParse.js'
import { computeLiveTps, computeAvgBlockTimeMs } from '../monadUtils.js'

describe('formatters', () => {
  it('formats USD tiers', () => {
    expect(formatUsd(1_500_000)).toBe('$1.50M')
    expect(formatUsd(1500)).toBe('$1.50K')
    expect(formatUsd(1.23)).toBe('$1.23')
    expect(formatUsd(0)).toBe('—')
  })

  it('formats amounts', () => {
    expect(formatAmount(2500, 'MON')).toBe('2.50K MON')
  })

  it('detects stablecoins', () => {
    expect(isStablecoin('USDC')).toBe(true)
    expect(isStablecoin('aUSD')).toBe(true)
    expect(isStablecoin('MON')).toBe(false)
  })
})

describe('stakingPrecompile', () => {
  it('encodes delegate calldata with selector', () => {
    const data = encodeDelegateCalldata(42)
    expect(data.startsWith(SELECTOR.DELEGATE)).toBe(true)
    expect(data.length).toBeGreaterThan(10)
  })

  it('encodes undelegate calldata', () => {
    const data = encodeUndelegateCalldata(1, 10n ** 18n, 0)
    expect(data.startsWith(SELECTOR.UNDELEGATE)).toBe(true)
  })

  it('decodes epoch result', () => {
    const hex =
      '0x0000000000000000000000000000000000000000000000000000000000000007' +
      '0000000000000000000000000000000000000000000000000000000000000001'
    expect(decodeGetEpochResult(hex)).toEqual({ epoch: 7, inEpochDelayPeriod: true })
  })
})

describe('txEnrichment helpers', () => {
  it('decodes token amounts', () => {
    expect(decodeTokenAmount(1_000_000n, 6)).toBe(1)
    expect(decodeTokenAmount(10n ** 18n, 18)).toBe(1)
  })

  it('normalizes block numbers', () => {
    expect(normalizeBlockNumber(12n)).toBe(12)
    expect(normalizeBlockNumber('15')).toBe(15)
  })

  it('toNumberish handles hex and bigint', () => {
    expect(toNumberish(5n)).toBe(5)
    expect(toNumberish('0x10')).toBe(16)
  })

  it('isStableSymbol', () => {
    expect(isStableSymbol('AUSD')).toBe(true)
    expect(isStableSymbol('MON')).toBe(false)
  })
})

describe('validatorMetricsParse', () => {
  const sample = `
    Uptime 99.87%
    Total Stake 1.25M MON
    Commission 5%
    Commits 12,345
    Timeouts 3
    Success rate: 99.9%
    Miss rate: 0.1%
  `

  it('parses metric text', () => {
    const parsed = parseMetricPage(sample)
    expect(parsed.uptime24).toBe('99.87%')
    expect(parsed.totalStakeText).toMatch(/1\.25M\s*MON/)
    expect(parsed.commissionText).toBe('5%')
    expect(parsed.commitsText).toBe('12,345')
    expect(parsed.timeoutsText).toBe('3')
    expect(parsed.successRateText).toBe('99.9%')
    expect(hasUsefulMetrics(parsed)).toBe(true)
  })

  it('strips html before parse', () => {
    const html = `<div><b>Uptime</b> 98.1%</div><script>evil()</script>Commits 9`
    const parsed = parseMetricPage(html)
    expect(parsed.uptime24).toBe('98.1%')
    expect(parsed.commitsText).toBe('9')
  })
})

describe('computeLiveTps', () => {
  it('returns 0 for empty input', () => {
    expect(computeLiveTps([])).toBe(0)
    expect(computeLiveTps(null)).toBe(0)
  })

  it('estimates single-block TPS from fallback interval', () => {
    // 40 txs / 0.4s = 100 TPS
    expect(computeLiveTps([{ txCount: 40, timestamp: 1000 }], 400)).toBe(100)
  })

  it('computes TPS from chain timestamp span', () => {
    const blocks = [
      { txCount: 30, timestamp: 0 },
      { txCount: 30, timestamp: 400 },
      { txCount: 40, timestamp: 800 },
    ]
    // 100 txs / 0.8s = 125
    expect(computeLiveTps(blocks, 400)).toBe(125)
  })

  it('uses cadence fallback when timestamps collide', () => {
    const blocks = [
      { txCount: 20, timestamp: 1000 },
      { txCount: 20, timestamp: 1000 },
      { txCount: 20, timestamp: 1000 },
    ]
    // 60 txs / (2 * 0.4s) = 75
    expect(computeLiveTps(blocks, 400)).toBe(75)
  })

  it('prefers receivedAt wall-clock for instant RPC TPS', () => {
    const blocks = [
      { txCount: 10, timestamp: 1000, receivedAt: 0 },
      { txCount: 10, timestamp: 1000, receivedAt: 300 },
      { txCount: 10, timestamp: 1000, receivedAt: 600 },
    ]
    // 30 txs / 0.6s = 50
    expect(computeLiveTps(blocks, 400)).toBe(50)
  })
})

describe('computeAvgBlockTimeMs', () => {
  it('falls back when fewer than 2 blocks', () => {
    expect(computeAvgBlockTimeMs([], 400)).toBe(400)
    expect(computeAvgBlockTimeMs([{ timestamp: 1 }], 350)).toBe(350)
  })

  it('averages positive gaps', () => {
    const blocks = [
      { timestamp: 0 },
      { timestamp: 300 },
      { timestamp: 700 },
    ]
    // gaps 300, 400 → avg 350
    expect(computeAvgBlockTimeMs(blocks, 400)).toBe(350)
  })
})

describe('gmonads block time parse', () => {
  it('converts avg_block_time_s string to ms', () => {
    const sec = Number('0.29797979797979797980')
    expect(Math.round(sec * 1000)).toBe(298)
  })
})
