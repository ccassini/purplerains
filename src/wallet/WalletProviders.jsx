import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from './wagmiConfig'

/**
 * Lazy-loaded wallet boundary — only mount on staking routes so wagmi/viem
 * wallet connectors stay out of the home/world bundles.
 */
export default function WalletProviders({ children }) {
  return <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
}
