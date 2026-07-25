import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { defineChain } from 'viem'
import { MONAD_RPC_ENDPOINTS } from '../config/monadNetwork'

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

export const wagmiConfig = createConfig({
  chains: [monad],
  connectors: [injected()],
  transports: {
    [monad.id]: http(MONAD_RPC_ENDPOINTS[0]),
  },
})

