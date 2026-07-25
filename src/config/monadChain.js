import { defineChain } from 'viem'
import { MONAD_RPC_ENDPOINTS } from './monadNetwork'

/** Shared Monad mainnet chain — viem-only (no wagmi) so home bundle stays light. */
export const monad = defineChain({
  id: 143,
  name: 'Monad Mainnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: MONAD_RPC_ENDPOINTS },
    public: { http: MONAD_RPC_ENDPOINTS },
  },
  blockExplorers: {
    default: { name: 'MonadVision', url: 'https://monadvision.com' },
  },
})
