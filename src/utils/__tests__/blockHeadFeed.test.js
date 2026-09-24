import { describe, expect, test } from 'vitest'
import { createBlockHeadFeed } from '../blockHeadFeed'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup() {
  const heads = []
  const feed = createBlockHeadFeed(
    head => heads.push(head),
    id => ({ id, name: `Validator ${id}` }),
  )
  return { heads, feed }
}

describe('block head feed', () => {
  test('publishes a verified header as soon as its own proposer arrives', async () => {
    const { heads, feed } = setup()
    const attribution = deferred()
    const header = { number: 101, hash: '0x101', receivedAt: 1000 }
    const published = feed.push(header, attribution.promise)

    expect(heads).toEqual([])
    attribution.resolve(7)
    await published

    expect(heads).toEqual([{
      ...header,
      proposerId: 7,
      proposerValidator: { id: 7, name: 'Validator 7' },
    }])
    expect(heads[0]).not.toHaveProperty('transactionCount')
  })

  test('an older slow proposer response never overwrites a newer live head', async () => {
    const { heads, feed } = setup()
    const olderAttribution = deferred()
    const older = feed.push({ number: 101 }, olderAttribution.promise)
    await feed.push({ number: 102 }, Promise.resolve(8))
    olderAttribution.resolve(7)
    await older

    expect(heads.map(head => [head.number, head.proposerId])).toEqual([[102, 8]])
  })

  test('each distinct head can publish while later attribution is still pending', async () => {
    const { heads, feed } = setup()
    const newerAttribution = deferred()
    const newer = feed.push({ number: 102 }, newerAttribution.promise)
    await feed.push({ number: 101 }, Promise.resolve(7))
    newerAttribution.resolve(8)
    await newer

    expect(heads.map(head => head.number)).toEqual([101, 102])
  })

  test('duplicate height from the full payload does not replay its header', async () => {
    const { heads, feed } = setup()
    await feed.push({ number: 101, receivedAt: 1000 }, Promise.resolve(7))
    await feed.push({ number: 101, receivedAt: 1240 }, Promise.resolve(7))
    expect(heads).toHaveLength(1)
    expect(heads[0].receivedAt).toBe(1000)
  })

  test('failed attribution never publishes a new head with a borrowed proposer', async () => {
    const { heads, feed } = setup()
    await feed.push({ number: 101 }, Promise.resolve(7))
    await feed.push({ number: 102 }, Promise.reject(new Error('RPC unavailable')))
    expect(heads.map(head => [head.number, head.proposerId])).toEqual([[101, 7]])
  })

  test('a newer unknown head cannot discard a pending verified proposer', async () => {
    const { heads, feed } = setup()
    const olderAttribution = deferred()
    const older = feed.push({ number: 101, receivedAt: 1000 }, olderAttribution.promise)
    await feed.push({ number: 102, receivedAt: 1300 }, Promise.resolve(null))
    expect(heads).toEqual([])
    olderAttribution.resolve(7)
    await older
    expect(heads.map(head => [head.number, head.proposerId])).toEqual([[101, 7]])
    await feed.push({ number: 102, receivedAt: 1800 }, Promise.resolve(8))
    expect(heads[1]).toMatchObject({ number: 102, receivedAt: 1300, proposerId: 8 })
  })

  test('a later real attribution can fill an unknown proposer at the same height', async () => {
    const { heads, feed } = setup()
    await feed.push({ number: 101, receivedAt: 1000 }, Promise.resolve(null))
    await feed.push({ number: 101, receivedAt: 1400 }, Promise.resolve(7))
    expect(heads).toHaveLength(1)
    expect(heads[0]).toMatchObject({ number: 101, receivedAt: 1000, proposerId: 7 })
  })

  test('keeps original receipt times for more than one unknown head', async () => {
    const { heads, feed } = setup()
    await feed.push({ number: 101, receivedAt: 1000 }, Promise.resolve(null))
    await feed.push({ number: 102, receivedAt: 1300 }, Promise.resolve(null))
    await feed.push({ number: 101, receivedAt: 1600 }, Promise.resolve(7))
    await feed.push({ number: 102, receivedAt: 1900 }, Promise.resolve(8))
    expect(heads.map(head => [head.number, head.receivedAt])).toEqual([[101, 1000], [102, 1300]])
  })

  test('waits for usable validator metadata before consuming a verified height', async () => {
    const heads = []
    let metadataReady = false
    const feed = createBlockHeadFeed(head => heads.push(head), id => metadataReady ? { id } : { id: null })
    await feed.push({ number: 101, receivedAt: 1000 }, Promise.resolve(7))
    expect(heads).toEqual([])
    metadataReady = true
    await feed.push({ number: 101, receivedAt: 1400 }, Promise.resolve(7))
    expect(heads[0]).toMatchObject({ number: 101, receivedAt: 1000, proposerId: 7, proposerValidator: { id: 7 } })
  })

  test('an unknown duplicate cannot erase verified attribution', async () => {
    const { heads, feed } = setup()
    await feed.push({ number: 101 }, Promise.resolve(7))
    await feed.push({ number: 101 }, Promise.resolve(null))
    expect(heads).toHaveLength(1)
    expect(heads[0].proposerId).toBe(7)
  })

  test('closing a stream suppresses attribution still in flight', async () => {
    const { heads, feed } = setup()
    const attribution = deferred()
    const pending = feed.push({ number: 101 }, attribution.promise)
    feed.close()
    attribution.resolve(7)
    await pending
    await feed.push({ number: 102 }, Promise.resolve(8))
    expect(heads).toEqual([])
  })

  test('rejects invalid heights and preserves a real zero validator id', async () => {
    const { heads, feed } = setup()
    await feed.push({ number: NaN }, Promise.resolve(7))
    await feed.push({ number: -1 }, Promise.resolve(7))
    await feed.push({ number: 101 }, Promise.resolve(0))
    expect(heads).toEqual([{
      number: 101,
      proposerId: 0,
      proposerValidator: { id: 0, name: 'Validator 0' },
    }])
  })
})
