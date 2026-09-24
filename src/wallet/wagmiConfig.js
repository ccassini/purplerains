import { createConfig, fallback, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { monad } from '../config/monadChain'
import { MONAD_RPC_ENDPOINTS } from '../config/monadNetwork'

export { monad }

/**
 * Every endpoint in the list, not just the first.
 *
 * The previous `http(MONAD_RPC_ENDPOINTS[0])` pinned all staking reads to
 * `rpc-mainnet.monadinfra.com`, which rate-limits aggressively — the staking
 * precompile calls were returning "429 Rate limit exceeded" and silently
 * falling back to empty positions. `fallback` rotates to the next endpoint on
 * failure and ranks them by observed latency.
 */
const stakingTransport = fallback(
  MONAD_RPC_ENDPOINTS.map((url) => http(url, {
    // A rate-limited endpoint should be abandoned quickly, not retried on itself.
    retryCount: 1,
    timeout: 8_000,
  })),
  { rank: { interval: 60_000 } },
)

export const wagmiConfig = createConfig({
  chains: [monad],
  connectors: [injected()],
  transports: {
    [monad.id]: stakingTransport,
  },
})
