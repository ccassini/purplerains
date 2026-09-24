/**
 * Multicall3 batching for staking precompile reads.
 *
 * The staking precompile only exposes `getDelegator(valId, addr)` — there is no
 * "list my delegations". Scanning ~200 validators one call at a time would both
 * be slow and trip the public RPC rate limits, so every scan goes through
 * Multicall3's `aggregate3`, which is deployed at the canonical address on
 * Monad mainnet.
 */

export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11'

/** aggregate3((address,bool,bytes)[]) returns (bool,bytes)[] */
export const AGGREGATE3_ABI = [
  {
    name: 'aggregate3',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
]

/**
 * Chunk size per aggregate3 call.
 *
 * Public RPCs cap response size and execution time; ~120 precompile reads per
 * batch keeps each response comfortably small while still collapsing a
 * 200-validator scan into two round trips.
 */
export const MULTICALL_CHUNK = 120

function chunk(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Run raw calldata against one target through Multicall3, tolerating per-call
 * reverts (a validator the delegator has never touched simply returns empty).
 *
 * @param {import('viem').PublicClient} publicClient
 * @param {string} target contract the calldata is aimed at
 * @param {Array<{ key: any, data: `0x${string}` }>} calls
 * @returns {Promise<Array<{ key: any, success: boolean, data: `0x${string}`|null }>>}
 */
export async function multicallRaw(publicClient, target, calls) {
  if (!publicClient || !calls?.length) return []

  const batches = chunk(calls, MULTICALL_CHUNK)
  const results = []

  for (const batch of batches) {
    const returned = await publicClient.readContract({
      address: MULTICALL3_ADDRESS,
      abi: AGGREGATE3_ABI,
      functionName: 'aggregate3',
      args: [batch.map((c) => ({ target, allowFailure: true, callData: c.data }))],
    })

    batch.forEach((call, i) => {
      const row = returned?.[i]
      const data = row?.returnData
      results.push({
        key: call.key,
        success: Boolean(row?.success),
        data: data && data !== '0x' ? data : null,
      })
    })
  }

  return results
}
