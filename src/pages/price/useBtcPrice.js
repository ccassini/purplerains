import { useEffect, useState } from 'react'
import { fetchBtcUsdChange24h, fetchBtcUsdPrice, subscribeBtcSpotTrades } from './btcPrice'
import { BTC_CHANGE_POLL_MS, BTC_PRICE_POLL_MS } from './constants'

/**
 * BTC macro reference.
 *
 * Sourcing is spot-only and multi-venue on purpose: the Binance *futures*
 * endpoints this page uses for MON (`fstream.binance.com`, `fapi`) are
 * geo-blocked in many regions, which is what left the BTC cell showing "—".
 * A REST poll guarantees a value, and the spot websocket adds live ticks where
 * it is reachable.
 *
 * @returns {{ price: number | null, change: number | null }}
 */
export function useBtcPrice() {
  const [price, setPrice] = useState(null)
  const [change, setChange] = useState(null)

  useEffect(() => {
    let cancelled = false

    const pull = async () => {
      const next = await fetchBtcUsdPrice()
      if (!cancelled && next != null) setPrice(next)
    }

    pull()
    const pollId = window.setInterval(pull, BTC_PRICE_POLL_MS)
    const unsubscribe = subscribeBtcSpotTrades((next) => {
      if (!cancelled) setPrice(next)
    })

    return () => {
      cancelled = true
      window.clearInterval(pollId)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const pull = async () => {
      const next = await fetchBtcUsdChange24h()
      if (!cancelled && next != null) setChange(next)
    }

    pull()
    const id = window.setInterval(pull, BTC_CHANGE_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return { price, change }
}
