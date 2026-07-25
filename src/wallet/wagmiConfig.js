import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { monad } from '../config/monadChain'
import { MONAD_RPC_ENDPOINTS } from '../config/monadNetwork'

export { monad }

export const wagmiConfig = createConfig({
  chains: [monad],
  connectors: [injected()],
  transports: {
    [monad.id]: http(MONAD_RPC_ENDPOINTS[0]),
  },
})
