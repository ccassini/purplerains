import React, { useState } from 'react'
import { motion } from 'framer-motion'
import FlowMeter from './price/FlowMeter'
import LiveLineChart from './price/LiveLineChart'
import PriceIdentityBar from './price/PriceIdentityBar'
import PriceStats from './price/PriceStats'
import TradeTape from './price/TradeTape'
import VenueLadder from './price/VenueLadder'
import { useBtcPrice } from './price/useBtcPrice'
import {
  useDocumentPriceTitle,
  useHeaderOffset,
  usePremiumFonts,
  useSecondClock,
} from './price/useChrome'
import { usePriceFeed } from './price/usePriceFeed'
import { usePriceTelemetry } from './price/usePriceTelemetry'
import { useTradeSound } from './price/useTradeSound'
import './PricePage.css'

const MOBILE_TABS = [
  { id: 'chart', label: 'Chart' },
  { id: 'venues', label: 'Venues' },
  { id: 'tape', label: 'Tape' },
]

export default function PricePage({ embedded = false }) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mobileTab, setMobileTab] = useState('chart')

  const sound = useTradeSound()
  const feed = usePriceFeed({ soundRef: sound.playRef })
  const btc = useBtcPrice()
  const nowMs = useSecondClock()
  const topOffset = useHeaderOffset(!embedded)
  const { flash, sessionRange } = usePriceTelemetry(feed.lastPrice)

  usePremiumFonts()
  useDocumentPriceTitle(feed.lastPriceRef)

  return (
    <motion.div
      className={`price-page${embedded ? ' price-page--embedded' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={embedded ? undefined : { top: topOffset }}
    >
      <div className="pr-shell">
        <PriceIdentityBar
          symbol={feed.symbol}
          price={feed.aggregated.price}
          change={feed.aggregated.change}
          flash={flash}
          feedRate={feed.feedRate}
          liveCount={feed.liveCount}
          venueCount={feed.venueCount}
          soundEnabled={sound.enabled}
          onToggleSound={sound.toggle}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen((f) => !f)}
          onReconnect={feed.reconnectAll}
        />

        <PriceStats
          volume={feed.aggregated.volume}
          sessionRange={sessionRange}
          spread={feed.spread}
          btc={btc}
        />

        <nav className="pr-tabs" aria-label="Price sections">
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`pr-tab ${mobileTab === tab.id ? 'is-active' : ''}`}
              onClick={() => setMobileTab(tab.id)}
              aria-pressed={mobileTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className={`pr-body ${isFullscreen ? 'is-fullscreen' : ''}`} data-tab={mobileTab}>
          <section className="pr-panel pr-chart" aria-label="Live MON price chart">
            <LiveLineChart priceRef={feed.lastPriceRef} watermark="MON" />
            <FlowMeter trades={feed.trades} nowMs={nowMs} />
          </section>

          <div className="pr-rail">
            <VenueLadder sources={feed.sources} reference={feed.aggregated.price} />
            <TradeTape trades={feed.trades} nowMs={nowMs} />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
