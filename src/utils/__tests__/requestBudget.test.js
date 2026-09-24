import { describe, expect, test } from 'vitest'
import { createBudgetedEnrichmentClient, createRequestBudget } from '../requestBudget'

describe('live request priority', () => {
  test('heavy optional enrichment cannot starve 300ms proposer updates over two complete minutes', () => {
    let now = 0
    const budget = createRequestBudget({ now: () => now })
    const missedProposers = []
    let optionalRequests = 0

    for (let height = 0; height < 400; height++) {
      now = height * 300
      if (budget.hasBudget('proposer')) budget.track('proposer')
      else missedProposers.push(height)
      // WS full-block requests are essential and already happen for each head.
      budget.track('block')
      for (let receipt = 0; receipt < 5; receipt++) {
        if (!budget.hasBudget('enrichment')) break
        budget.track('enrichment')
        optionalRequests++
      }
    }

    expect(missedProposers).toEqual([])
    expect(optionalRequests).toBeGreaterThan(0)
    expect(optionalRequests).toBeLessThanOrEqual(200)
  })

  test('an early enrichment burst preserves the next minute of real block and proposer requests', () => {
    let now = 0
    const budget = createRequestBudget({ now: () => now })
    let acceptedEnrichment = 0
    for (let request = 0; request < 500; request++) {
      if (!budget.hasBudget('enrichment')) break
      budget.track('enrichment')
      acceptedEnrichment++
    }

    expect(acceptedEnrichment).toBeGreaterThan(0)
    expect(acceptedEnrichment).toBeLessThanOrEqual(100)
    for (let height = 0; height < 200; height++) {
      now = height * 300
      expect(budget.hasBudget('proposer'), `proposer for block ${height}`).toBe(true)
      budget.track('proposer')
      expect(budget.hasBudget('block'), `payload for block ${height}`).toBe(true)
      budget.track('block')
    }
  })

  test('optional allowance resets with the minute without accumulating earlier demand', () => {
    let now = 0
    const budget = createRequestBudget({ now: () => now })
    let firstWindow = 0
    while (budget.hasBudget('enrichment')) {
      budget.track('enrichment')
      firstWindow++
      if (firstWindow > 600) throw new Error('Optional requests must remain bounded')
    }
    now = 60_000
    expect(budget.hasBudget('enrichment')).toBe(true)
    let secondWindow = 0
    while (budget.hasBudget('enrichment')) {
      budget.track('enrichment')
      secondWindow++
      if (secondWindow > 600) throw new Error('Optional requests must remain bounded')
    }
    expect(secondWindow).toBe(firstWindow)
  })

  test('retry traffic still consumes the overall provider protection budget', () => {
    const budget = createRequestBudget({ now: () => 0 })
    for (let retry = 0; retry < 600; retry++) budget.track('block')
    expect(budget.hasBudget('block')).toBe(false)
    expect(budget.hasBudget('proposer')).toBe(false)
    expect(budget.hasBudget('enrichment')).toBe(false)
  })

  test('charges each receipt and metadata call separately and never dispatches denied calls', async () => {
    const budget = createRequestBudget({ now: () => 0, optionalLimit: 3 })
    const dispatched = []
    const client = createBudgetedEnrichmentClient({
      async getTransactionReceipt(args) { dispatched.push(['receipt', args]); return { logs: [] } },
      async readContract(args) { dispatched.push(['contract', args]); return args.functionName },
    }, () => {
      if (!budget.hasBudget('enrichment')) return false
      budget.track('enrichment')
      return true
    })

    await client.getTransactionReceipt({ hash: '0x123' })
    await Promise.all([
      client.readContract({ functionName: 'decimals' }),
      client.readContract({ functionName: 'symbol' }),
    ])
    await expect(client.getTransactionReceipt({ hash: '0x456' })).rejects.toMatchObject({ name: 'RequestBudgetError' })
    expect(dispatched).toHaveLength(3)
    expect(budget.getSnapshot()).toMatchObject({ count: 3, optionalCount: 3 })
  })
})
