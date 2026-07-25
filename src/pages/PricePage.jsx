import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3,
  LineChart,
  RefreshCw,
  Maximize2,
  Minimize2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { AreaSeries, CandlestickSeries, ColorType, CrosshairMode, LineSeries, LineType, createChart } from 'lightweight-charts'
import { siBinance, siCoinbase, siOkx } from 'simple-icons'
import { formatUsdExact, formatUsdCompact } from '../utils/formatters'
import {
  BINANCE_FSTREAM_WS,
  CANDLE_STYLE,
  LINE_SMOOTH_ALPHA,
  LINE_TICK_MS,
  SNAKE_PAD_Y,
  SNAKE_POINTS,
  SNAKE_RIGHT_INSET,
  SPEED,
  UI_FLUSH_MS,
} from './price/constants'
import { clamp, formatPrice } from './price/priceFormatters'
import { SparklineSVG, TapeVenueLogo } from './price/PriceUi'
import { VENUES, fetchDexscreener, resolveBinanceSymbol } from './price/venues'
import './PricePage.css'

export default function PricePage() {
  const [symbol, setSymbol] = useState(null)
  const [lastPrice, setLastPrice] = useState(null)
  const [btcPrice, setBtcPrice] = useState(null)
  const [candleIntervalMs] = useState(1000)
  const [chartType] = useState('line') // 'candles' | 'line' — default line-only snake mode
  const [trades, setTrades] = useState([]) // newest first
  const [candles, setCandles] = useState([]) // { t, o, h, l, c, v }
  const candlesMax = 600 // 10 minutes @ 1s
  const lastPriceRef = useRef(null)
  const currentCandleRef = useRef(null) // { bucket, o,h,l,c,v }

  // TradingView-like candle chart (aggr style)
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const lineGlowSeriesRef = useRef(null)
  const lineHaloSeriesRef = useRef(null)
  const lineSeriesRef = useRef(null)
  const lineSmoothedRef = useRef(null)
  const lineHeadInnerRef = useRef(null)
  const lineHeadPriceRef = useRef(null)
  const snakeCanvasRef = useRef(null)
  const snakeShellRef = useRef(null)
  const snakeValuesRef = useRef([])
  const snakeMinMaxRef = useRef({ min: 0, max: 1 })
  const snakePhaseRef = useRef(0)
  const snakeSizeRef = useRef({ w: 0, h: 0 })
  const snakeReadyRef = useRef(false)
  const snakeLogoImgRef = useRef(null)
  const positionLineHeadRef = useRef(() => {})
  const lastBarRef = useRef(null) // { time, open, high, low, close }
  const didHydrateSeriesRef = useRef(false)
  const [, setChartError] = useState(null)
  const [topOffset, setTopOffset] = useState(90)
  const chartTypeRef = useRef('line')
  useEffect(() => { chartTypeRef.current = chartType }, [chartType])

  const [priceFlash, setPriceFlash] = useState({ dir: '', n: 0 })
  const [sparkData, setSparkData] = useState([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mobileTab, setMobileTab] = useState('chart')
  const [soundEnabled, setSoundEnabled] = useState(false)
  const prevPriceRef = useRef(null)
  const sessionRangeRef = useRef({ high: -Infinity, low: Infinity })
  const priceDirTimerRef = useRef(null)
  const audioCtxRef = useRef(null)
  const soundFnRef = useRef(null)

  const wsRefs = useRef({})
  const reconnectRefs = useRef({})
  const btcWsRef = useRef(null)
  const btcReconnectRef = useRef(null)

  // UI batching: keep chart updates realtime, but batch React updates (trade tape + last price)
  // to avoid jank when trades are very frequent.
  const tradesBufferRef = useRef([])
  const uiFlushRef = useRef({ timer: null })
  const pendingLastPriceUiRef = useRef(null)

  const flushUi = useCallback(() => {
    uiFlushRef.current.timer = null
    setTrades(tradesBufferRef.current.slice(0, 120))
    if (Number.isFinite(pendingLastPriceUiRef.current)) {
      setLastPrice(pendingLastPriceUiRef.current)
    }
  }, [])

  const positionLineHead = useCallback(() => {
    const inner = lineHeadInnerRef.current
    const priceEl = lineHeadPriceRef.current
    if (!inner || !priceEl) return
    if (chartTypeRef.current !== 'line') {
      inner.style.opacity = '0'
      return
    }

    const v = lineSmoothedRef.current
    const { w, h } = snakeSizeRef.current
    const { min, max } = snakeMinMaxRef.current
    if (!Number.isFinite(v) || !w || !h) {
      inner.style.opacity = '0'
      return
    }

    const range = max - min || 1
    const pad = SNAKE_PAD_Y
    const yNorm = (max - v) / range
    const values = snakeValuesRef.current
    const headIndex = values.length - 1
    const slopeAbs = values.length >= 2
      ? Math.min(1, Math.abs(values[headIndex] - values[0]) / (range || 1))
      : 0
    const wobblePx = 1.5 + 6 * slopeAbs
    const wobble = Math.sin(snakePhaseRef.current + headIndex * 0.45) * wobblePx
    const y = pad + yNorm * (h - pad * 2) + wobble
    // Anchor near the right edge; pill extends left automatically.
    const x = Math.max(0, w - SNAKE_RIGHT_INSET)

    inner.style.opacity = '1'
    priceEl.textContent = `$${formatPrice(v)}`
    inner.style.transform = `translate3d(${x}px, ${y}px, 0) translate(0, -50%)`
  }, [])

  positionLineHeadRef.current = positionLineHead

  const syncSnakeCanvasSize = useCallback(() => {
    const canvas = snakeCanvasRef.current
    const shell = snakeShellRef.current
    if (!canvas || !shell) return
    const w = shell.clientWidth
    const h = shell.clientHeight
    if (!w || !h) return
    const dpr = window.devicePixelRatio || 1
    snakeSizeRef.current = { w, h }
    canvas.width = Math.max(1, Math.floor(w * dpr))
    canvas.height = Math.max(1, Math.floor(h * dpr))
    snakeReadyRef.current = true
  }, [])

  const drawSnake = useCallback(() => {
    const canvas = snakeCanvasRef.current
    const ctx = canvas?.getContext?.('2d')
    if (!canvas || !ctx) return
    const { w, h } = snakeSizeRef.current
    if (!w || !h) return

    const values = snakeValuesRef.current
    if (!values || values.length < 2) return

    let min = Infinity
    let max = -Infinity
    for (const val of values) {
      if (!Number.isFinite(val)) continue
      if (val < min) min = val
      if (val > max) max = val
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return

    // Breathing room: add 8% padding above & below so price movement feels
    // smooth rather than pinned to the chart edges.
    const rawRange = (max - min) || Math.max(1e-6, Math.abs(max) * 0.001)
    const breath = rawRange * 0.08
    max = max + breath
    min = min - breath

    snakeMinMaxRef.current = { min, max }
    const range = max - min || 1

    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const pad = SNAKE_PAD_Y
    const usableH = h - pad * 2
    const usableW = Math.max(30, w - SNAKE_RIGHT_INSET)
    const step = usableW / (values.length - 1)
    const phase = snakePhaseRef.current

    const slopeAbs = Math.min(1, Math.abs(values[values.length - 1] - values[0]) / (range || 1))
    const wobblePx = 1.5 + 6 * slopeAbs

    const points = new Array(values.length)
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i]
      const yNorm = (max - v) / range
      const yBase = pad + yNorm * usableH
      const wobble = Math.sin(phase + i * 0.45) * wobblePx
      const y = yBase + wobble
      points[i] = { x: i * step, y: Math.max(-50, Math.min(h + 50, y)) }
    }

    // Price axis (right side) — horizontal grid + right-side labels.
    {
      const axisX = w - SNAKE_RIGHT_INSET + 12
      const labelRight = w - 14
      const ticks = 5
      ctx.save()
      ctx.font = '600 11px JetBrains Mono, ui-monospace, monospace'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'right'
      ctx.lineWidth = 1
      for (let i = 0; i <= ticks; i += 1) {
        const t = i / ticks
        const price = max - t * range
        const y = pad + t * usableH
        // Grid line across chart area.
        ctx.strokeStyle = i === 0 || i === ticks
          ? 'rgba(167,139,250,0.10)'
          : 'rgba(167,139,250,0.06)'
        ctx.beginPath()
        ctx.setLineDash([])
        ctx.moveTo(0, y + 0.5)
        ctx.lineTo(axisX - 4, y + 0.5)
        ctx.stroke()
        // Price label (right).
        ctx.fillStyle = 'rgba(203,191,232,0.55)'
        ctx.shadowBlur = 0
        ctx.fillText(`$${formatPrice(price)}`, labelRight, y)
      }
      // Vertical separator between chart and axis.
      ctx.strokeStyle = 'rgba(167,139,250,0.08)'
      ctx.beginPath()
      ctx.moveTo(axisX - 4, pad - 4)
      ctx.lineTo(axisX - 4, pad + usableH + 4)
      ctx.stroke()
      ctx.restore()
    }

    // Dashed line at current price (follows the head).
    const headVal = values[values.length - 1]
    if (Number.isFinite(headVal)) {
      const yNormH = (max - headVal) / range
      const yHead = pad + yNormH * usableH
      ctx.save()
      ctx.strokeStyle = 'rgba(167,139,250,0.55)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(0, yHead + 0.5)
      ctx.lineTo(w - SNAKE_RIGHT_INSET + 8, yHead + 0.5)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Smoothed path (quadratic via midpoints).
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 0; i < points.length - 2; i += 1) {
      const midX = (points[i].x + points[i + 1].x) / 2
      const midY = (points[i].y + points[i + 1].y) / 2
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY)
    }
    const last = points[points.length - 1]
    ctx.lineTo(last.x, last.y)

    // Depth gradient fill (area under the curve).
    ctx.save()
    const areaBottom = pad + usableH
    ctx.beginPath()
    ctx.moveTo(points[0].x, areaBottom)
    ctx.lineTo(points[0].x, points[0].y)
    for (let i = 0; i < points.length - 2; i += 1) {
      const midX = (points[i].x + points[i + 1].x) / 2
      const midY = (points[i].y + points[i + 1].y) / 2
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY)
    }
    ctx.lineTo(last.x, last.y)
    ctx.lineTo(last.x, areaBottom)
    ctx.closePath()
    const depthGrad = ctx.createLinearGradient(0, pad, 0, areaBottom)
    depthGrad.addColorStop(0, 'rgba(167, 139, 250, 0.32)')
    depthGrad.addColorStop(0.55, 'rgba(139, 92, 246, 0.14)')
    depthGrad.addColorStop(1, 'rgba(88, 28, 135, 0.02)')
    ctx.fillStyle = depthGrad
    ctx.fill()
    ctx.restore()

    // Restart stroke path (depth fill consumed the previous one).
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 0; i < points.length - 2; i += 1) {
      const midX = (points[i].x + points[i + 1].x) / 2
      const midY = (points[i].y + points[i + 1].y) / 2
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY)
    }
    ctx.lineTo(last.x, last.y)

    // Outer glow pass.
    ctx.save()
    ctx.shadowColor = SPEED.purple
    ctx.shadowBlur = 22
    ctx.strokeStyle = 'rgba(167,139,250,0.18)'
    ctx.lineWidth = 6
    ctx.stroke()
    ctx.restore()

    // Inner bright pass.
    ctx.save()
    ctx.shadowBlur = 0
    ctx.strokeStyle = SPEED.purpleLine
    ctx.lineWidth = 2.6
    ctx.stroke()
    ctx.restore()

    // Depth line.
    ctx.save()
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(167,139,250,0.55)'
    ctx.lineWidth = 1.4
    ctx.globalAlpha = 0.65
    ctx.stroke()
    ctx.restore()

    // Head marker (Monade logo + price pill) - drawn in canvas to avoid layout drift.
    const headV = values[values.length - 1]
    if (Number.isFinite(headV)) {
      const r = 14
      const logo = snakeLogoImgRef.current
      const headX = last.x
      const headY = last.y

      // Marker outer glow
      ctx.save()
      ctx.shadowColor = SPEED.purple
      ctx.shadowBlur = 18
      ctx.fillStyle = '#0a0a0a'
      ctx.strokeStyle = 'rgba(167,139,250,0.9)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(headX, headY, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      if (logo && logo.complete) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(headX, headY, r - 2, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(logo, headX - 10, headY - 10, 20, 20)
        ctx.restore()
      }
      ctx.restore()

      // Price pill
      const text = `$${formatPrice(headV)}`
      ctx.save()
      ctx.font = '900 12px JetBrains Mono, ui-monospace, monospace'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      const m = ctx.measureText(text)
      const textW =
        typeof m.actualBoundingBoxLeft === 'number' && typeof m.actualBoundingBoxRight === 'number'
          ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight
          : m.width
      const pillH = 22
      const pillW = Math.ceil(textW) + 26
      let pillX = headX + 12
      const maxX = w - 10 - pillW
      pillX = Math.min(pillX, Math.max(10, maxX))
      const pillOffset = 34
      const x = pillX

      // Keep pill fully visible: if it would go above the canvas, render it below the head.
      let y = headY - pillOffset
      const minY = pillH / 2 + 6
      const maxY = h - (pillH / 2 + 6)
      if (y < minY) y = Math.min(maxY, headY + pillOffset)
      y = Math.max(minY, Math.min(maxY, y))
      // Pill background
      ctx.save()
      ctx.fillStyle = 'rgba(88,28,135,0.68)'
      ctx.strokeStyle = 'rgba(167,139,250,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      const r2 = 11
      ctx.moveTo(x + r2, y - pillH / 2)
      ctx.arcTo(x + pillW, y - pillH / 2, x + pillW, y + pillH / 2, r2)
      ctx.arcTo(x + pillW, y + pillH / 2, x, y + pillH / 2, r2)
      ctx.arcTo(x, y + pillH / 2, x, y - pillH / 2, r2)
      ctx.arcTo(x, y - pillH / 2, x + pillW, y - pillH / 2, r2)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()

      ctx.fillStyle = '#e8f4ff'
      ctx.shadowColor = 'rgba(167,139,250,0.25)'
      ctx.shadowBlur = 8
      ctx.fillText(text, x + pillW / 2, y)
      ctx.restore()
    }
  }, [])

  const advanceSnake = useCallback((nextValue) => {
    if (!Number.isFinite(nextValue)) return
    if (!snakeReadyRef.current) syncSnakeCanvasSize()
    const { w, h } = snakeSizeRef.current
    if (!w || !h) return

    const values = snakeValuesRef.current
    if (!values.length) {
      snakeValuesRef.current = Array.from({ length: SNAKE_POINTS }, () => nextValue)
    } else {
      values.push(nextValue)
      if (values.length > SNAKE_POINTS) values.shift()
    }

    snakePhaseRef.current += (LINE_TICK_MS / 1000) * 2.4
    drawSnake()
  }, [drawSnake, syncSnakeCanvasSize])

  useEffect(() => {
    // Lazy-load monad logo for the snake head marker.
    const img = new Image()
    img.src = '/monad_logo.png'
    img.onload = () => {
      snakeLogoImgRef.current = img
      drawSnake()
    }
    img.onerror = () => {
      // Keep going without the logo.
      snakeLogoImgRef.current = null
    }
  }, [drawSnake])

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const venueMeta = useMemo(() => {
    const map = {}
    VENUES.forEach((v) => {
      map[v.key] = { label: v.label, color: v.color }
    })
    return map
  }, [])

  const venueIcons = useMemo(() => ({
    binanceFutures: siBinance,
    coinbaseSpot: siCoinbase,
    okxFutures: siOkx,
  }), [])

  const venueLogoSrc = useMemo(() => ({
    // Prefer locally bundled assets (aggr-style) for best quality/consistency.
    hyperliquid: '/img/exchanges/hyperliquid.png',
    gate: '/img/exchanges/gateio.svg',
    bybitSpot: [
      '/img/exchanges/bybit.svg',
      '/img/exchanges/bybit.png',
      '/img/exchanges/bybit.webp',
      '/img/exchanges/bybit.jpg',
      '/img/exchanges/bybit.jpeg',
      '/img/exchanges/BYBIT.webp',
    ],
    coinbaseSpot: [
      '/img/exchanges/coinbase.svg',
      '/img/exchanges/coinbase.png',
      '/img/exchanges/coinbase.webp',
      '/img/exchanges/coinbase.jpg',
      '/img/exchanges/coinbase.jpeg',
      '/img/exchanges/COINBASE.webp',
      '/img/exchanges/COINBASE.png',
      '/img/exchanges/COINBASE.jpg',
      '/img/exchanges/COINBASE.jpeg',
    ],
    lbank: [
      '/img/exchanges/lbank.svg',
      '/img/exchanges/lbank.png',
      '/img/exchanges/lbank.webp',
      '/img/exchanges/lbank.jpg',
      '/img/exchanges/lbank.jpeg',
    ],
    // User-provided: drop `okx.svg` (or `okex.svg`) into `public/img/exchanges/`
    okxFutures: [
      '/img/exchanges/okx.svg',
      '/img/exchanges/okx.png',
      '/img/exchanges/okx.webp',
      '/img/exchanges/OKX.png',
      '/img/exchanges/OKX.webp',
      '/img/exchanges/okex.svg',
      '/img/exchanges/okex.png',
      '/img/exchanges/okex.webp',
      '/img/exchanges/OKEX.webp',
      '/img/exchanges/OKEX.png',
    ],
  }), [])

  const getVenueShort = useCallback((key) => {
    const lbl = venueMeta[key]?.label || String(key || '')
    const parts = String(lbl).trim().split(/\s+/g)
    const s = parts.length >= 2 ? (parts[0][0] + parts[1][0]) : (parts[0]?.slice(0, 3) || lbl.slice(0, 3))
    return String(s || '').toUpperCase()
  }, [venueMeta])

  /** Tape row emphasis tier (large notionals get an extra flash animation). */
  const getTapeTier = useCallback((notional) => {
    if (!Number.isFinite(notional)) return 0
    if (notional >= 1_000_000) return 4
    if (notional >= 250_000) return 3
    if (notional >= 100_000) return 2
    if (notional >= 25_000) return 1
    return 0
  }, [])

  useEffect(() => {
    const ui = uiFlushRef.current
    return () => {
      if (ui.timer) window.clearTimeout(ui.timer)
      ui.timer = null
    }
  }, [])

  useEffect(() => {
    if (!Number.isFinite(lastPrice)) return
    const prev = prevPriceRef.current
    prevPriceRef.current = lastPrice
    if (Number.isFinite(prev) && prev !== lastPrice) {
      const dir = lastPrice > prev ? 'up' : 'down'
      setPriceFlash(p => ({ dir, n: p.n + 1 }))
      if (priceDirTimerRef.current) clearTimeout(priceDirTimerRef.current)
      priceDirTimerRef.current = setTimeout(() => setPriceFlash(p => ({ ...p, dir: '' })), 800)
    }
    setSparkData(prev => {
      const next = [...prev, lastPrice]
      return next.length > 60 ? next.slice(-60) : next
    })
    const sr = sessionRangeRef.current
    if (lastPrice > sr.high) sr.high = lastPrice
    if (lastPrice < sr.low) sr.low = lastPrice
  }, [lastPrice])

  useEffect(() => {
    return () => { if (priceDirTimerRef.current) clearTimeout(priceDirTimerRef.current) }
  }, [])

  useEffect(() => {
    if (!soundEnabled) { soundFnRef.current = null; return }
    soundFnRef.current = (notional) => {
      if (notional < 100_000) return
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
        const ctx = audioCtxRef.current
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = notional >= 1_000_000 ? 880 : notional >= 250_000 ? 660 : 440
        gain.gain.value = 0.05
        osc.start()
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
        osc.stop(ctx.currentTime + 0.12)
      } catch { /* ignore */ }
    }
    return () => { soundFnRef.current = null }
  }, [soundEnabled])

  // When tab is not active, show live MON price in the browser tab title.
  useEffect(() => {
    const originalTitle = document.title
    let timer = null

    const renderTitle = () => {
      const p = lastPriceRef.current
      document.title = Number.isFinite(p) ? `MON $${formatPrice(p)}` : 'MON'
    }

    const onVisibility = () => {
      if (document.hidden) {
        renderTitle()
        if (!timer) timer = window.setInterval(renderTitle, 250)
      } else {
        if (timer) window.clearInterval(timer)
        timer = null
        document.title = originalTitle
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    onVisibility()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (timer) window.clearInterval(timer)
      document.title = originalTitle
    }
  }, [])

  useEffect(() => {
    const clampPx = (n, min, max) => Math.max(min, Math.min(max, n))
    const update = () => {
      const header = document.querySelector('.app-header')
      const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 78
      // Keep a little breathing room below the header.
      setTopOffset(clampPx(headerH + 12, 64, 220))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // BTC price (single purpose: show BTC only, no other metrics)
  useEffect(() => {
    let cancelled = false

    const connect = () => {
      if (cancelled) return
      try {
        btcWsRef.current?.close()
      } catch {
        // ignore
      }

      const ws = new WebSocket(`${BINANCE_FSTREAM_WS}/btcusdt@aggTrade`)
      btcWsRef.current = ws

      ws.onmessage = (evt) => {
        try {
          if (typeof evt.data !== 'string') return
          const msg = JSON.parse(evt.data)
          const p = Number(msg?.p)
          if (Number.isFinite(p)) setBtcPrice(p)
        } catch {
          // ignore
        }
      }

      ws.onclose = () => {
        if (cancelled) return
        const tries = (btcReconnectRef.current?.tries || 0) + 1
        const delay = clamp(400 * tries, 400, 5000)
        const timer = window.setTimeout(() => {
          btcReconnectRef.current = { tries, timer: null }
          connect()
        }, delay)
        btcReconnectRef.current = { tries, timer }
      }
    }

    connect()
    return () => {
      cancelled = true
      if (btcReconnectRef.current?.timer) window.clearTimeout(btcReconnectRef.current.timer)
      btcReconnectRef.current = null
      try {
        btcWsRef.current?.close()
      } catch {
        // ignore
      }
      btcWsRef.current = null
    }
  }, [])

  const [sources, setSources] = useState(() => {
    const init = {}
    VENUES.forEach((v) => {
      init[v.key] = {
        key: v.key,
        label: v.label,
        status: 'connecting',
        last: null,
        change: null,
        volume: null,
        symbol: null
      }
    })
    return init
  })

  const updateSource = useCallback((key, patch) => {
    setSources((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch }
    }))
  }, [])

  const pushTrade = useCallback((venueKey, price, qty, time, side, affectsChart = true) => {
    if (!Number.isFinite(price)) return
    const now = Date.now()
    const tsRaw = Number.isFinite(time) ? time : now
    // Clamp exchange timestamps near "now" to avoid visible lag from slow servers.
    const ts = Math.max(now - 900, Math.min(now + 300, tsRaw))

    const safeQty = Number.isFinite(qty) ? qty : 0
    const trade = { t: ts, p: price, q: safeQty, side, venue: venueKey }
    tradesBufferRef.current = [trade, ...tradesBufferRef.current].slice(0, 240)
    if (!affectsChart) return

    lastPriceRef.current = price
    pendingLastPriceUiRef.current = price
    soundFnRef.current?.(price * safeQty)
    if (!uiFlushRef.current.timer) {
      uiFlushRef.current.timer = window.setTimeout(flushUi, UI_FLUSH_MS)
    }

    if (chartTypeRef.current !== 'candles') return

    let bucket = Math.floor(ts / candleIntervalMs) * candleIntervalMs
    const cur = currentCandleRef.current
    if (cur && bucket < cur.bucket) {
      bucket = cur.bucket // keep timeline monotonic; ignore stale timestamp drift
    }

    const pending = []
    if (cur && cur.bucket !== bucket) {
      if (Number.isFinite(cur.o)) {
        pending.push({ t: cur.bucket, o: cur.o, h: cur.h, l: cur.l, c: cur.c, v: cur.v })
      }
      if (bucket > cur.bucket + candleIntervalMs && Number.isFinite(cur.c)) {
        let gap = cur.bucket + candleIntervalMs
        while (gap < bucket) {
          pending.push({ t: gap, o: cur.c, h: cur.c, l: cur.c, c: cur.c, v: 0 })
          gap += candleIntervalMs
        }
      }
    }

    if (pending.length) {
      setCandles((prev) => [...prev, ...pending].slice(-candlesMax))
      const series = candleSeriesRef.current
      if (series) {
        pending.forEach((c) => {
          const bar = {
            time: Math.floor(c.t / 1000),
            open: c.o,
            high: c.h,
            low: c.l,
            close: c.c
          }
          try {
            series.update(bar)
            lastBarRef.current = bar
          } catch {
            // ignore chart update hiccups
          }
        })
      }
    }

    if (!cur || cur.bucket !== bucket) {
      currentCandleRef.current = {
        bucket,
        o: price,
        h: price,
        l: price,
        c: price,
        v: safeQty
      }
    } else {
      cur.h = Math.max(cur.h, price)
      cur.l = Math.min(cur.l, price)
      cur.c = price
      cur.v += safeQty
      currentCandleRef.current = cur
    }

    // Update lightweight-charts candle series (use 1s bars)
    if (candleSeriesRef.current) {
      const snap = currentCandleRef.current
      const bar = {
        time: Math.floor(snap.bucket / 1000),
        open: snap.o,
        high: snap.h,
        low: snap.l,
        close: snap.c
      }
      try {
        candleSeriesRef.current.update(bar)
        lastBarRef.current = bar
      } catch {
        // ignore chart update hiccups
      }
    }
  }, [candleIntervalMs, flushUi])

  // When interval changes, reset candle history and chart series.
  useEffect(() => {
    didHydrateSeriesRef.current = false
    lastBarRef.current = null
    currentCandleRef.current = null
    setCandles([])
    try {
      candleSeriesRef.current?.setData([])
    } catch {
      // ignore
    }
    try {
      lineHaloSeriesRef.current?.setData([])
      lineGlowSeriesRef.current?.setData([])
      lineSeriesRef.current?.setData([])
    } catch {
      // ignore
    }
    lineSmoothedRef.current = null
    try {
      chartRef.current?.applyOptions?.({
        timeScale: {
          secondsVisible: candleIntervalMs < 60_000,
          timeVisible: true,
        },
      })
    } catch {
      // ignore
    }
  }, [candleIntervalMs])

  // Create TradingView-like chart (aggr-style candlestick)
  useEffect(() => {
    const el = chartContainerRef.current
    if (!el) return
    let ro = null
    let raf = null
    let cancelled = false

    setChartError(null)

    const init = () => {
      if (cancelled) return
      if (chartRef.current) return

      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h || w < 50 || h < 50) {
        raf = window.requestAnimationFrame(init)
        return
      }

      try {
        const chart = createChart(el, {
          width: w,
          height: h,
          layout: {
            background: { type: ColorType.Solid, color: SPEED.bg },
            textColor: SPEED.text,
            fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: 12,
          },
          localization: {
            locale: 'en-US',
            priceFormatter: (price) => {
              const p = Number(price)
              if (!Number.isFinite(p)) return '—'
              return `$${formatPrice(p)}`
            },
          },
          rightPriceScale: {
            visible: true,
            borderColor: SPEED.scaleBorder,
            textColor: SPEED.textMuted,
            scaleMargins: { top: 0.1, bottom: 0.12 },
            entireTextOnly: true,
            minimumWidth: 76,
          },
          leftPriceScale: { visible: false },
          timeScale: {
            borderColor: SPEED.scaleBorder,
            timeVisible: true,
            secondsVisible: true,
            rightOffset: 6,
            barSpacing: 5.5,
            minBarSpacing: 2.5,
            fixLeftEdge: true,
          },
          grid: {
            vertLines: { color: SPEED.grid, style: 0 },
            horzLines: { color: SPEED.grid, style: 0 },
          },
          crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: {
              color: SPEED.crosshair,
              style: 2,
              width: 1,
              labelBackgroundColor: SPEED.crosshairLabel,
            },
            horzLine: {
              color: SPEED.crosshair,
              style: 2,
              width: 1,
              labelBackgroundColor: SPEED.crosshairLabel,
            },
          },
          handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
          handleScale: { axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true }, mouseWheel: true, pinch: true },
        })

        const series = chart.addSeries(CandlestickSeries, {
          ...CANDLE_STYLE,
          priceFormat: { type: 'price', precision: 6, minMove: 0.000001 },
        })

        const halo = chart.addSeries(LineSeries, {
          color: SPEED.purpleHalo,
          lineWidth: 9,
          lineType: LineType.Curved,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          priceFormat: { type: 'price', precision: 6, minMove: 0.000001 },
        })

        const glow = chart.addSeries(AreaSeries, {
          topColor: SPEED.areaTop,
          bottomColor: SPEED.areaBot,
          lineColor: 'rgba(88, 166, 255, 0.22)',
          lineWidth: 1,
          lineType: LineType.Curved,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })

        const line = chart.addSeries(LineSeries, {
          color: SPEED.purpleLine,
          lineWidth: 2,
          lineType: LineType.Curved,
          priceLineVisible: true,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
          priceFormat: { type: 'price', precision: 6, minMove: 0.000001 },
        })

        chartRef.current = chart
        candleSeriesRef.current = series
        lineHaloSeriesRef.current = halo
        lineGlowSeriesRef.current = glow
        lineSeriesRef.current = line

        ro = new ResizeObserver(() => {
          if (cancelled) return
          const nextW = el.clientWidth
          const nextH = el.clientHeight
          if (!nextW || !nextH) return
          try {
            chart.resize(nextW, nextH)
          } catch {
            // ignore resize errors (can happen during teardown)
          }
          requestAnimationFrame(() => positionLineHeadRef.current?.())
        })
        ro.observe(el)

        // show data from the start
        chart.timeScale().fitContent()
        requestAnimationFrame(() => positionLineHeadRef.current?.())
      } catch (e) {
        setChartError(e?.message || String(e))
      }
    }

    init()

    return () => {
      cancelled = true
      if (raf) window.cancelAnimationFrame(raf)
      if (ro) ro.disconnect()
      try {
        chartRef.current?.remove()
      } catch {
        // ignore
      }
      chartRef.current = null
      candleSeriesRef.current = null
      lineHaloSeriesRef.current = null
      lineGlowSeriesRef.current = null
      lineSeriesRef.current = null
      lastBarRef.current = null
    }
  }, [])

  // Toggle chart series visibility (candles vs glow line)
  useEffect(() => {
    const candle = candleSeriesRef.current
    const halo = lineHaloSeriesRef.current
    const glow = lineGlowSeriesRef.current
    const line = lineSeriesRef.current
    if (!candle || !glow || !line) return
    try {
      if (chartType === 'line') {
        // Hide candles + show line.
        didHydrateSeriesRef.current = false
        try { candle.setData([]) } catch { /* ignore */ }
        try {
          candle.applyOptions({
            upColor: 'rgba(0,0,0,0)',
            downColor: 'rgba(0,0,0,0)',
            wickUpColor: 'rgba(0,0,0,0)',
            wickDownColor: 'rgba(0,0,0,0)',
            borderUpColor: 'rgba(0,0,0,0)',
            borderDownColor: 'rgba(0,0,0,0)',
            priceLineVisible: false,
            lastValueVisible: false,
          })
        } catch { /* ignore */ }
        try {
          halo?.applyOptions({
            color: 'rgba(0,0,0,0)',
            lineWidth: 0,
            lineType: LineType.Curved,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
          glow.applyOptions({
            topColor: 'rgba(0,0,0,0)',
            bottomColor: 'rgba(0,0,0,0)',
            lineColor: 'rgba(0,0,0,0)',
            lineWidth: 0,
            lineType: LineType.Curved,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
          line.applyOptions({
            color: 'rgba(0,0,0,0)',
            lineWidth: 0,
            lineType: LineType.Curved,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
        } catch { /* ignore */ }
      } else {
        // Hide line + show candles.
        try { halo?.setData([]) } catch { /* ignore */ }
        try { glow.setData([]) } catch { /* ignore */ }
        try { line.setData([]) } catch { /* ignore */ }
        try {
          halo?.applyOptions({
            color: 'rgba(0,0,0,0)',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
          glow.applyOptions({
            topColor: 'rgba(0,0,0,0)',
            bottomColor: 'rgba(0,0,0,0)',
            lineColor: 'rgba(0,0,0,0)',
            lineWidth: 0,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
          line.applyOptions({
            color: 'rgba(0,0,0,0)',
            lineWidth: 0,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
        } catch { /* ignore */ }
        try {
          candle.applyOptions({
            ...CANDLE_STYLE,
          })
        } catch { /* ignore */ }
      }
    } catch {
      // ignore (fallback: they may overlap if visibility isn't supported)
    }
  }, [chartType])

  useEffect(() => {
    let cancelled = false
    resolveBinanceSymbol().then((s) => {
      if (cancelled) return
      setSymbol(s)
    })
    return () => { cancelled = true }
  }, [])

  // 24h ticker snapshots (ws venues)
  useEffect(() => {
    if (!symbol) return () => {}
    let cancelled = false
    const timers = []

    VENUES.filter(v => v.type === 'ws').forEach((venue) => {
      if (typeof venue.fetch24h !== 'function' || typeof venue.mapTicker !== 'function') return
      const fetch24h = async () => {
        const targetSymbol = venue.mapSymbol ? venue.mapSymbol(symbol) : symbol
        if (!targetSymbol) {
          updateSource(venue.key, { symbol: null })
          return
        }
        try {
          const raw = await venue.fetch24h(targetSymbol)
          if (cancelled) return
          if (!raw) return
          const mapped = venue.mapTicker(raw)
          updateSource(venue.key, {
            last: Number.isFinite(mapped.price) ? mapped.price : null,
            change: Number.isFinite(mapped.change) ? mapped.change : null,
            volume: Number.isFinite(mapped.volume) ? mapped.volume : null,
            symbol: targetSymbol
          })
          if (Number.isFinite(mapped.price) && !Number.isFinite(lastPriceRef.current)) {
            lastPriceRef.current = mapped.price
            setLastPrice(mapped.price)
          }
        } catch {
          // ignore ticker failures (WS may still be live; also CORS differs by venue)
        }
      }
      fetch24h()
      timers.push(window.setInterval(fetch24h, 15000))
    })

    return () => {
      cancelled = true
      timers.forEach((id) => window.clearInterval(id))
    }
  }, [symbol, updateSource])

  // Rest-only sources (DexScreener)
  useEffect(() => {
    let cancelled = false
    const runDex = async () => {
      try {
        updateSource('dexscreener', { status: 'connecting' })
        const data = await fetchDexscreener()
        if (cancelled) return
        if (data) {
          updateSource('dexscreener', {
            status: 'live',
            last: data.price,
            change: data.change,
            volume: data.volume
          })
          // allow chart clock to start even if WS venues are slow
          if (Number.isFinite(data.price) && !Number.isFinite(lastPriceRef.current)) {
            lastPriceRef.current = data.price
            pendingLastPriceUiRef.current = data.price
            if (!uiFlushRef.current.timer) {
              uiFlushRef.current.timer = window.setTimeout(flushUi, 0)
            }
          }
        } else {
          updateSource('dexscreener', { status: 'fallback' })
        }
      } catch {
        if (!cancelled) updateSource('dexscreener', { status: 'fallback' })
      }
    }

    runDex()
    const dexTimer = window.setInterval(runDex, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(dexTimer)
    }
  }, [flushUi, updateSource])

  // Chart clock: advance 1s candles even if no trades arrive.
  // Uses latest known LIVE price (from any venue snapshot / WS trade).
  useEffect(() => {
    let cancelled = false
    const tick = () => {
      if (cancelled) return

      if (chartTypeRef.current !== 'candles') {
        const target = Number.isFinite(lastPriceRef.current)
          ? lastPriceRef.current
          : Number.isFinite(currentCandleRef.current?.c)
            ? currentCandleRef.current.c
            : null
        if (!Number.isFinite(target)) return
        if (!Number.isFinite(lineSmoothedRef.current)) {
          lineSmoothedRef.current = target
        } else {
          lineSmoothedRef.current += (target - lineSmoothedRef.current) * LINE_SMOOTH_ALPHA
        }
        advanceSnake(lineSmoothedRef.current)
        return
      }

      const p = Number.isFinite(lastPriceRef.current)
        ? lastPriceRef.current
        : Number.isFinite(currentCandleRef.current?.c)
          ? currentCandleRef.current.c
          : null
      if (!Number.isFinite(p)) return

      const nowBucket = Math.floor(Date.now() / candleIntervalMs) * candleIntervalMs
      const series = candleSeriesRef.current
      if (!series) return
      const cur = currentCandleRef.current
        if (!cur || !Number.isFinite(cur.o)) {
        currentCandleRef.current = { bucket: nowBucket, o: p, h: p, l: p, c: p, v: 0 }
        const bar = { time: Math.floor(nowBucket / 1000), open: p, high: p, low: p, close: p }
        try {
          series.update(bar)
          lastBarRef.current = bar
          didHydrateSeriesRef.current = true
        } catch {
          // ignore
        }
        return
      }

      if (nowBucket <= cur.bucket) return

      const pending = []
      // finalize current candle
      pending.push({ t: cur.bucket, o: cur.o, h: cur.h, l: cur.l, c: cur.c, v: cur.v })
      // fill gaps with flat bars at last close
      let gap = cur.bucket + candleIntervalMs
      while (gap < nowBucket) {
        pending.push({ t: gap, o: cur.c, h: cur.c, l: cur.c, c: cur.c, v: 0 })
        gap += candleIntervalMs
      }

      // push pending finalized/gap candles to state (history)
      if (pending.length) {
        setCandles((prev) => [...prev, ...pending].slice(-candlesMax))
        pending.forEach((c) => {
          const bar = { time: Math.floor(c.t / 1000), open: c.o, high: c.h, low: c.l, close: c.c }
          try {
            series.update(bar)
            lastBarRef.current = bar
          } catch {
            // ignore
          }
        })
      }

      // start new candle at nowBucket with flat price
      currentCandleRef.current = { bucket: nowBucket, o: p, h: p, l: p, c: p, v: 0 }
      const nextBar = { time: Math.floor(nowBucket / 1000), open: p, high: p, low: p, close: p }
      try {
        series.update(nextBar)
        lastBarRef.current = nextBar
        didHydrateSeriesRef.current = true
        chartRef.current?.timeScale()?.scrollToRealTime?.()
      } catch {
        // ignore
      }
    }

    const timer = window.setInterval(tick, chartTypeRef.current === 'line' ? LINE_TICK_MS : 1000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [candleIntervalMs, chartType, flushUi, advanceSnake])

  useEffect(() => {
    if (chartType !== 'line') {
      const inner = lineHeadInnerRef.current
      if (inner) inner.style.opacity = '0'
      return
    }
    const p = lastPriceRef.current
    if (Number.isFinite(p)) lineSmoothedRef.current = p
    requestAnimationFrame(() => positionLineHeadRef.current?.())
  }, [chartType])

  // WebSocket trade streams
  useEffect(() => {
    if (!symbol) return () => {}

    const wsMap = wsRefs.current
    const reconnectMap = reconnectRefs.current

    const connectVenue = (venue) => {
      const targetSymbol = venue.mapSymbol ? venue.mapSymbol(symbol) : symbol
      if (!targetSymbol) {
        updateSource(venue.key, { status: 'fallback', symbol: null })
        return
      }
      const streamDef = venue.buildStream(targetSymbol)
      const streamUrl = typeof streamDef === 'string' ? streamDef : streamDef?.url
      const subscribe = typeof streamDef === 'object' ? streamDef?.subscribe : null
      if (!streamUrl) {
        updateSource(venue.key, { status: 'fallback', symbol: targetSymbol })
        return
      }

      updateSource(venue.key, { status: 'connecting', symbol: targetSymbol })
      const ws = new WebSocket(streamUrl)
      if (venue.binaryType) {
        try {
          ws.binaryType = venue.binaryType
        } catch {
          // ignore
        }
      }
      wsRefs.current[venue.key] = ws

      ws.onopen = () => {
        const ref = reconnectRefs.current[venue.key] || {}
        reconnectRefs.current[venue.key] = { ...ref, tries: 0, timer: null }
        updateSource(venue.key, { status: 'live' })
        if (subscribe) {
          try {
            subscribe(ws, targetSymbol)
          } catch {
            // swallow subscription errors
          }
        }
      }

      ws.onmessage = (evt) => {
        const handleMsg = (msg) => {
          try {
            const trade = venue.parseTrade?.(msg)
            if (trade) {
              const affectsChart = trade.affectsChart !== false
              if (affectsChart) updateSource(venue.key, { last: trade.price })
              pushTrade(venue.key, trade.price, trade.qty, trade.time, trade.side, affectsChart)
            }
          } catch {
            // ignore
          }
        }

        try {
          if (venue.parseEventData) {
            venue.parseEventData(evt.data, handleMsg)
            return
          }
          if (typeof evt.data !== 'string') return
          if (evt.data === 'pong' || evt.data === 'ping') return
          const parsed = JSON.parse(evt.data)
          // LBank requires responding to ping frames to keep stream healthy.
          if (venue.key === 'lbank' && parsed?.action === 'ping' && parsed?.ping) {
            try {
              ws.send(JSON.stringify({ action: 'pong', pong: parsed.ping }))
            } catch {
              // ignore
            }
            return
          }
          handleMsg(parsed)
        } catch {
          // ignore malformed messages
        }
      }

      ws.onerror = () => {
        updateSource(venue.key, { status: 'fallback' })
      }

      ws.onclose = () => {
        const ref = reconnectMap[venue.key] || { tries: 0, timer: null }
        if (ref.timer) return
        const tries = (ref.tries || 0) + 1
        const delay = clamp(400 * tries, 400, 5000)
        const timer = window.setTimeout(() => {
          reconnectMap[venue.key] = { tries, timer: null }
          connectVenue(venue)
        }, delay)
        reconnectMap[venue.key] = { tries, timer }
      }
    }

    VENUES.filter(v => v.type === 'ws').forEach(connectVenue)

    return () => {
      VENUES.filter(v => v.type === 'ws').forEach((venue) => {
        const ref = reconnectMap[venue.key]
        if (ref?.timer) window.clearTimeout(ref.timer)
        reconnectMap[venue.key] = null
        try {
          wsMap[venue.key]?.close()
        } catch {
          // ignore close errors
        }
        wsMap[venue.key] = null
      })
    }
  }, [symbol, pushTrade, updateSource])

  // keep latest candle visible even before it closes
  const candleView = useMemo(() => {
    const list = [...candles]
    const cur = currentCandleRef.current
    if (cur && Number.isFinite(cur.o)) {
      list.push({ t: cur.bucket, o: cur.o, h: cur.h, l: cur.l, c: cur.c, v: cur.v })
    }
    return list.slice(-candlesMax)
  }, [candles])

  // Feed last N candles to chart on mount / reconnect
  useEffect(() => {
    const series = candleSeriesRef.current
    if (!series) return
    if (!candleView.length) return
    if (didHydrateSeriesRef.current) return

    const byTime = new Map()
    for (const c of candleView) {
      const t = Math.floor(c.t / 1000)
      if (!Number.isFinite(t)) continue
      byTime.set(t, {
        time: t,
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c
      })
    }
    const data = Array.from(byTime.values()).sort((a, b) => a.time - b.time)
    if (!data.length) return

    try {
      series.setData(data)
      lastBarRef.current = data[data.length - 1] || null
      chartRef.current?.timeScale().fitContent()
      didHydrateSeriesRef.current = true
    } catch (e) {
      setChartError(e?.message || String(e))
    }
  }, [candleView])

  // Seed the chart with a short flat history so the candle area never looks "empty"
  // while streams are connecting (especially on first load).
  useEffect(() => {
    const series = candleSeriesRef.current
    if (!series) return
    if (candles.length) return
    if (currentCandleRef.current?.bucket) return

    const p = lastPriceRef.current
    if (!Number.isFinite(p)) return

    const nowSec = Math.floor(Date.now() / 1000)
    const seedBars = Math.min(60, Math.max(3, Math.ceil(30_000 / candleIntervalMs)))
    const seed = []
    const step = Math.floor(candleIntervalMs / 1000)
    for (let i = seedBars; i > 0; i -= 1) {
      seed.push({ time: nowSec - (i * step), open: p, high: p, low: p, close: p })
    }

    try {
      series.setData(seed)
      chartRef.current?.timeScale().fitContent()
      didHydrateSeriesRef.current = true
    } catch {
      // ignore
    }

    setCandles(seed.map((b) => ({ t: b.time * 1000, o: p, h: p, l: p, c: p, v: 0 })))
    currentCandleRef.current = { bucket: Math.floor((nowSec * 1000) / candleIntervalMs) * candleIntervalMs, o: p, h: p, l: p, c: p, v: 0 }
    lastBarRef.current = seed[seed.length - 1] || null
  }, [lastPrice, candles.length, candleIntervalMs])

  const aggregated = useMemo(() => {
    const list = VENUES.map(v => ({ key: v.key, ...sources[v.key] || {} }))
      .filter(s => Number.isFinite(s.last))
    if (!list.length) {
      return {
        price: lastPrice ?? null,
        change: null,
        volume: null,
        liveCount: 0,
        best: null
      }
    }
    const volSum = list.reduce((sum, s) => sum + (Number.isFinite(s.volume) ? s.volume : 0), 0)
    const price = volSum > 0
      ? list.reduce((sum, s) => sum + s.last * (Number.isFinite(s.volume) ? s.volume : 0), 0) / volSum
      : list.reduce((sum, s) => sum + s.last, 0) / list.length
    const changeList = list.filter(s => Number.isFinite(s.change))
    const change = changeList.length
      ? changeList.reduce((sum, s) => sum + s.change, 0) / changeList.length
      : null
    const best = list.reduce((cur, s) => {
      if (!cur) return s
      const curVol = Number.isFinite(cur.volume) ? cur.volume : 0
      const vol = Number.isFinite(s.volume) ? s.volume : 0
      return vol > curVol ? s : cur
    }, null)
    return {
      price,
      change,
      volume: volSum || null,
      liveCount: list.length,
      best
    }
  }, [sources, lastPrice])

  const isUp = aggregated.change !== null && aggregated.change >= 0

  const spread = useMemo(() => {
    const prices = Object.values(sources).filter(s => Number.isFinite(s.last)).map(s => s.last)
    if (prices.length < 2) return null
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    if (min <= 0) return null
    return { min, max, pct: ((max - min) / min) * 100, count: prices.length }
  }, [sources])

  const sessionRange = useMemo(() => {
    const { high, low } = sessionRangeRef.current
    if (high === -Infinity || low === Infinity || high <= low) return null
    if (!Number.isFinite(aggregated.price)) return null
    const pos = ((aggregated.price - low) / (high - low)) * 100
    return { high, low, pos: Math.max(0, Math.min(100, pos)) }
  }, [aggregated.price])

  const liveCount = useMemo(() => {
    return Object.values(sources).filter(s => s.status === 'live').length
  }, [sources])

  const handleReconnect = () => {
    VENUES.filter(v => v.type === 'ws').forEach((venue) => {
      try {
        wsRefs.current[venue.key]?.close()
      } catch {
        // ignore
      }
    })
  }

  return (
    <motion.div
      className="price-page"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{ top: topOffset }}
    >
      <div className="price-panel">
        <div className="price-panel-header">
          <div className="price-title">
            <BarChart3 size={16} />
            <span>MON Price</span>
            <div className="venue-dots" title={`${liveCount} exchanges live`}>
              {Object.values(sources).map(s => (
                <span key={s.key} className={`venue-dot ${s.status}`} title={`${s.label}: ${s.status}`} />
              ))}
            </div>
          </div>
          <div className="price-symbol">
            <span>{symbol || '—'}</span>
            <button
              className="sound-toggle"
              type="button"
              title={soundEnabled ? 'Mute trade alerts' : 'Enable trade alerts'}
              onClick={() => setSoundEnabled(s => !s)}
              aria-pressed={soundEnabled}
            >
              {soundEnabled ? '🔔' : '🔕'}
            </button>
            <button
              className="price-reconnect"
              type="button"
              title="Reconnect all"
              onClick={handleReconnect}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="price-top">
          <div className="price-last">
            <div className="label">MON</div>
            <div className="value">
              <span className={`price-flash ${priceFlash.dir}`} key={priceFlash.n}>
                ${formatPrice(aggregated.price)}
              </span>
            </div>
            <SparklineSVG data={sparkData} />
          </div>
          <div className="price-btc">
            <div className="label">BTC</div>
            <div className="value">${formatUsdExact(btcPrice)}</div>
          </div>
          <div className="price-change">
            <div className="label">24h Change</div>
            <div className={`value ${isUp ? 'up' : 'down'}`}>
              {aggregated.change === null ? '—' : `${isUp ? '+' : ''}${aggregated.change.toFixed(2)}%`}
            </div>
            {sessionRange && (
              <div className="range-bar-wrap">
                <span className="range-lo">${formatPrice(sessionRange.low)}</span>
                <div className="range-track">
                  <div className="range-fill" style={{ width: `${sessionRange.pos}%` }} />
                  <div className="range-dot" style={{ left: `${sessionRange.pos}%` }} />
                </div>
                <span className="range-hi">${formatPrice(sessionRange.high)}</span>
              </div>
            )}
          </div>
          <div className="price-vol">
            <div className="label">TOTAL VOL 24H</div>
            <div className="value">{aggregated.volume === null ? '—' : `$${formatUsdCompact(aggregated.volume)}`}</div>
            {spread && (
              <div className="spread-badge">
                <span className="spread-label">Spread</span>
                <span className="spread-value">{spread.pct.toFixed(3)}%</span>
                <span className="spread-count">({spread.count})</span>
              </div>
            )}
          </div>
        </div>

        <div className={`price-body ${isFullscreen ? 'fullscreen-mode' : ''}`}>
          <div className="mobile-chart-tabs">
            <button type="button" className={`mct-btn ${mobileTab === 'chart' ? 'active' : ''}`} onClick={() => setMobileTab('chart')}>Chart</button>
            <button type="button" className={`mct-btn ${mobileTab === 'tape' ? 'active' : ''}`} onClick={() => setMobileTab('tape')}>Trades</button>
          </div>
          <div className={`price-chart price-chart--speed ${mobileTab === 'tape' ? 'mobile-hidden' : ''}`}>
            <div className="speed-chart-hero">
              <div className="speed-chart-hero__pair">
                <span className="speed-chart-hero__icon" aria-hidden="true">
                  <img src="/monad_logo.png" alt="" className="speed-chart-hero__logo" width={28} height={28} />
                </span>
                <div className="speed-chart-hero__pair-text">
                  <span className="speed-chart-hero__symbol">{symbol || 'MON'}</span>
                  <span className="speed-chart-hero__sub muted">aggregated</span>
                </div>
              </div>
              <div className="speed-chart-hero__mid">
                <span className={`speed-chart-hero__price price-flash ${priceFlash.dir}`} key={priceFlash.n}>
                  {aggregated.price === null ? '—' : `$${formatPrice(aggregated.price)}`}
                </span>
                {aggregated.change !== null && Number.isFinite(aggregated.change) && (
                  <>
                    <span className={`speed-chart-hero__trend ${isUp ? 'up' : 'down'}`} aria-hidden="true">
                      {isUp ? <TrendingUp size={18} strokeWidth={2.5} /> : <TrendingDown size={18} strokeWidth={2.5} />}
                    </span>
                    <span className={`speed-chart-hero__chg ${isUp ? 'up' : 'down'}`}>
                      {`${isUp ? '+' : ''}${aggregated.change.toFixed(2)}%`}
                    </span>
                  </>
                )}
              </div>
              <div className="speed-chart-hero__types" role="tablist" aria-label="Chart type">
                <span className="speed-chart-hero__type-label muted">Type</span>
                <span className="speed-type-btn active" aria-hidden="true">
                  <LineChart size={18} strokeWidth={2.25} />
                </span>
                <button
                  className="speed-type-btn speed-type-btn--fs"
                  type="button"
                  onClick={() => setIsFullscreen(f => !f)}
                  title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                </button>
              </div>
            </div>
            <div className="chart-toolbar">
              <div className="chart-toolbar__left">
                {/* Intentionally removed: live venue badge (user preference) */}
              </div>
              <div className="chart-toolbar__right" />
            </div>
            <div
              ref={snakeShellRef}
              className="tv-chart-shell tv-chart-shell--line"
            >
              <div className="tv-chart-watermark" aria-hidden="true">
                <span className="tv-chart-watermark__pair">MON</span>
                <span className="tv-chart-watermark__sub">/ USD</span>
              </div>
              <canvas ref={snakeCanvasRef} className="snake-canvas" aria-hidden="true" />
            </div>
          </div>

          <div className={`price-right ${isFullscreen ? 'fullscreen-hidden' : ''} ${mobileTab === 'chart' ? 'mobile-hidden' : ''}`}>
            <div className="price-tape price-tape--chain-flow">
              <div className="tape-chainlist-head">
                <div className="tape-chainlist-title">Trades</div>
                {trades.length > 0 ? (
                  <span className="tape-chainlist-sub">{trades.length} live</span>
                ) : (
                  <span className="tape-chainlist-sub">listening</span>
                )}
              </div>
              <div className="tape-chainlist-inner">
                {trades.length === 0 ? (
                  <div className="tape-chainfeed-empty">Waiting for trades…</div>
                ) : (
                  trades.map((tr, idx) => {
                    const notional = Number(tr.p) * Number(tr.q)
                    const tier = getTapeTier(notional)
                    const ageS = Math.max(0, Math.floor((nowMs - Number(tr.t)) / 1000))
                    const ageTxt = ageS < 60 ? `${ageS}s` : `${Math.floor(ageS / 60)}m`
                    const isBuy = tr.side === 'BUY'
                    return (
                      <div
                        key={`${tr.t}-${idx}`}
                        className={`tape-chainfeed-row ${isBuy ? 'tape-chainfeed-row--buy' : 'tape-chainfeed-row--sell'}${tier >= 3 ? ' tape-chainfeed-row--flash' : ''}`}
                      >
                        <span className={`tape-kind ${isBuy ? 'tape-kind-buy' : 'tape-kind-sell'}`}>
                          {tr.side}
                        </span>
                        <span className="tape-chain-amount">
                          ${formatPrice(tr.p)} · {formatUsdCompact(notional)}
                        </span>
                        <span className="tape-chain-logo-cell">
                          <TapeVenueLogo
                            srcs={venueLogoSrc[tr.venue]}
                            title={venueMeta[tr.venue]?.label || tr.venue}
                            fallbackIcon={venueIcons[tr.venue]}
                            fallbackHexColor={venueIcons[tr.venue]?.hex || 'e5e7eb'}
                            fallbackBadge={(
                              <span
                                className="tape-logo-badge"
                                title={venueMeta[tr.venue]?.label || tr.venue}
                                style={{ '--badge-accent': (venueMeta[tr.venue]?.color || '#a78bfa') }}
                              >
                                <span className="tape-logo-text">{getVenueShort(tr.venue)}</span>
                              </span>
                            )}
                          />
                        </span>
                        <span className="tape-chain-hash">{ageTxt}</span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
