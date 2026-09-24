import { useEffect, useState } from 'react'
import { fetchMonPrice } from '../../utils/priceApi'

const REFRESH_MS = 120_000

/**
 * MON/USD, used only to put a dollar figure next to the reward projection.
 * Failures are silent — the projection falls back to MON-only.
 *
 * @returns {number|null}
 */
export function useMonPrice() {
  const [price, setPrice] = useState(null)

  useEffect(() => {
    let cancelled = false

    const pull = async () => {
      try {
        const data = await fetchMonPrice()
        const next = Number(data?.price)
        if (!cancelled && Number.isFinite(next) && next > 0) setPrice(next)
      } catch {
        // Non-fatal: USD columns just stay hidden.
      }
    }

    pull()
    const id = window.setInterval(pull, REFRESH_MS)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [])

  return price
}
