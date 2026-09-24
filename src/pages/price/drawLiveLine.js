import { formatPrice } from './priceFormatters'
import {
  AXIS_TICKS,
  CHART_PAD_BOTTOM,
  HEAD_RADIUS,
  LINE_TICK_MS,
  SNAKE_PAD_Y,
  SNAKE_POINTS,
  SPEED,
  WOBBLE_BASE_PX,
  WOBBLE_SLOPE_PX,
  WOBBLE_VELOCITY_REF,
} from './constants'

const MONO = 'JetBrains Mono, ui-monospace, monospace'
/** Vertical padding added above/below the extremes so motion never pins to an edge. */
const BREATHING_ROOM = 0.08

/**
 * @typedef {{ w: number, h: number, padTop: number, padBottom: number, usableH: number,
 *   plotW: number, axisSepX: number, labelRight: number, axisFont: string,
 *   ticks: number }} ChartGeometry
 */

const AXIS_LABEL_PAD = 10
const AXIS_GAP = 8
/** Below this canvas width the axis switches to its compact type size. */
const NARROW_CANVAS_PX = 520
const SHORT_CANVAS_PX = 260

/**
 * Geometry, with the right-hand axis gutter measured from the real label rather
 * than assumed. A fixed gutter either wasted plot width on desktop or crushed
 * it on a phone — and the head marker collided with the labels at small sizes.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ min: number, max: number }} scale
 * @returns {ChartGeometry}
 */
function buildGeometry(ctx, w, h, scale) {
  const narrow = w < NARROW_CANVAS_PX
  const axisFont = `600 ${narrow ? 10 : 11}px ${MONO}`

  ctx.save()
  ctx.font = axisFont
  // The widest label the axis will print for this scale.
  const sample = `$${formatPrice(Math.abs(scale.max) > Math.abs(scale.min) ? scale.max : scale.min)}`
  const labelW = Math.ceil(ctx.measureText(sample).width)
  ctx.restore()

  const gutter = Math.min(
    Math.max(60, labelW + AXIS_LABEL_PAD + AXIS_GAP + HEAD_RADIUS),
    Math.max(60, w * 0.34),
  )
  const plotW = Math.max(30, w - gutter)
  const padTop = SNAKE_PAD_Y
  const padBottom = CHART_PAD_BOTTOM

  return {
    w,
    h,
    padTop,
    padBottom,
    usableH: Math.max(20, h - padTop - padBottom),
    plotW,
    axisSepX: plotW + AXIS_GAP,
    labelRight: w - AXIS_LABEL_PAD,
    axisFont,
    ticks: h < SHORT_CANVAS_PX ? 3 : AXIS_TICKS,
  }
}

function computeScale(values) {
  let min = Infinity
  let max = -Infinity
  for (const val of values) {
    if (!Number.isFinite(val)) continue
    if (val < min) min = val
    if (val > max) max = val
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null

  const rawRange = (max - min) || Math.max(1e-6, Math.abs(max) * 0.001)
  const breath = rawRange * BREATHING_ROOM
  const paddedMin = min - breath
  const paddedMax = max + breath
  return { min: paddedMin, max: paddedMax, range: (paddedMax - paddedMin) || 1 }
}

/**
 * Wobble amplitude per point, from that point's own tick-to-tick velocity.
 *
 * A single global slope factor meant one spike anywhere in the window made the
 * whole line ripple — a genuinely flat price rendered as a decorative sine wave.
 * Scaling locally keeps quiet stretches flat and lets fast moves shimmer.
 */
function buildWobble(values, range) {
  const reference = (range || 1) * WOBBLE_VELOCITY_REF
  const raw = new Array(values.length)
  for (let i = 0; i < values.length; i += 1) {
    const prev = values[i - 1] ?? values[i]
    raw[i] = Math.min(1, Math.abs(values[i] - prev) / reference)
  }

  // Smooth across neighbours so the amplitude envelope reads as motion blur
  // rather than isolated spikes.
  const amp = new Array(values.length)
  for (let i = 0; i < values.length; i += 1) {
    const a = raw[i - 1] ?? raw[i]
    const b = raw[i]
    const c = raw[i + 1] ?? raw[i]
    amp[i] = WOBBLE_BASE_PX + WOBBLE_SLOPE_PX * ((a + b + c) / 3)
  }
  return amp
}

function buildPoints(values, geom, scale, phase) {
  const step = geom.plotW / (values.length - 1)
  const wobble = buildWobble(values, scale.range)

  const points = new Array(values.length)
  for (let i = 0; i < values.length; i += 1) {
    const yNorm = (scale.max - values[i]) / scale.range
    const y = geom.padTop + yNorm * geom.usableH + Math.sin(phase + i * 0.45) * wobble[i]
    points[i] = { x: i * step, y: Math.max(-50, Math.min(geom.h + 50, y)) }
  }
  return points
}

/** Quadratic-through-midpoints path; shared by the fill and all stroke passes. */
function tracePath(ctx, points) {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 0; i < points.length - 2; i += 1) {
    const midX = (points[i].x + points[i + 1].x) / 2
    const midY = (points[i].y + points[i + 1].y) / 2
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY)
  }
  const last = points[points.length - 1]
  ctx.lineTo(last.x, last.y)
}

function drawPriceAxis(ctx, geom, scale) {
  ctx.save()
  ctx.font = geom.axisFont
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  ctx.lineWidth = 1
  ctx.setLineDash([])

  for (let i = 0; i <= geom.ticks; i += 1) {
    const t = i / geom.ticks
    const y = geom.padTop + t * geom.usableH
    ctx.strokeStyle = i === 0 || i === geom.ticks
      ? 'rgba(167,139,250,0.10)'
      : 'rgba(167,139,250,0.05)'
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(geom.axisSepX - 4, y + 0.5)
    ctx.stroke()

    ctx.fillStyle = 'rgba(203,191,232,0.5)'
    ctx.fillText(`$${formatPrice(scale.max - t * scale.range)}`, geom.labelRight, y)
  }

  ctx.strokeStyle = 'rgba(167,139,250,0.08)'
  ctx.beginPath()
  ctx.moveTo(geom.axisSepX - 4, geom.padTop - 4)
  ctx.lineTo(geom.axisSepX - 4, geom.padTop + geom.usableH + 4)
  ctx.stroke()
  ctx.restore()
}

/** Rolling window footer — makes the sub-second resolution of the feed legible. */
function drawTimeAxis(ctx, geom) {
  const windowS = (SNAKE_POINTS * LINE_TICK_MS) / 1000
  const baseY = geom.padTop + geom.usableH
  const steps = geom.plotW < 300 ? 2 : 4

  ctx.save()
  ctx.font = `600 10px ${MONO}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(203,191,232,0.34)'
  ctx.strokeStyle = 'rgba(167,139,250,0.12)'
  ctx.lineWidth = 1

  ctx.beginPath()
  ctx.moveTo(0, baseY + 0.5)
  ctx.lineTo(geom.plotW, baseY + 0.5)
  ctx.stroke()

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const x = t * geom.plotW
    const secondsAgo = windowS * (1 - t)

    ctx.beginPath()
    ctx.moveTo(x + 0.5, baseY)
    ctx.lineTo(x + 0.5, baseY + 4)
    ctx.stroke()

    ctx.textAlign = i === 0 ? 'left' : i === steps ? 'right' : 'center'
    ctx.fillText(secondsAgo < 0.05 ? 'now' : `−${secondsAgo.toFixed(1)}s`, x, baseY + 8)
  }
  ctx.restore()
}

function drawCurrentPriceLine(ctx, geom, scale, headValue) {
  if (!Number.isFinite(headValue)) return
  const y = geom.padTop + ((scale.max - headValue) / scale.range) * geom.usableH
  ctx.save()
  ctx.strokeStyle = 'rgba(167,139,250,0.5)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(0, y + 0.5)
  ctx.lineTo(geom.axisSepX - 4, y + 0.5)
  ctx.stroke()
  ctx.restore()
}

function drawArea(ctx, points, geom) {
  const areaBottom = geom.padTop + geom.usableH
  const last = points[points.length - 1]

  ctx.save()
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

  const grad = ctx.createLinearGradient(0, geom.padTop, 0, areaBottom)
  grad.addColorStop(0, 'rgba(167, 139, 250, 0.32)')
  grad.addColorStop(0.55, 'rgba(139, 92, 246, 0.14)')
  grad.addColorStop(1, 'rgba(88, 28, 135, 0.02)')
  ctx.fillStyle = grad
  ctx.fill()
  ctx.restore()
}

/** Three stacked strokes: outer halo, bright core, dim depth line. */
function drawLine(ctx, points) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  tracePath(ctx, points)

  ctx.save()
  ctx.shadowColor = SPEED.purple
  ctx.shadowBlur = 22
  ctx.strokeStyle = 'rgba(167,139,250,0.18)'
  ctx.lineWidth = 6
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.shadowBlur = 0
  ctx.strokeStyle = SPEED.purpleLine
  ctx.lineWidth = 2.6
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(167,139,250,0.55)'
  ctx.lineWidth = 1.4
  ctx.globalAlpha = 0.65
  ctx.stroke()
  ctx.restore()
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Head marker (Monad mark) plus the live price pill. The pill is anchored to the
 * LEFT of the marker: the head always sits against the axis gutter, so opening
 * rightwards would print it straight over the price labels.
 */
function drawHead(ctx, points, value, geom, logo) {
  if (!Number.isFinite(value)) return
  const { x: headX, y: headY } = points[points.length - 1]

  ctx.save()
  ctx.shadowColor = SPEED.purple
  ctx.shadowBlur = 18
  ctx.fillStyle = '#0a0a0a'
  ctx.strokeStyle = 'rgba(167,139,250,0.9)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(headX, headY, HEAD_RADIUS, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  if (logo && logo.complete) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(headX, headY, HEAD_RADIUS - 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(logo, headX - 10, headY - 10, 20, 20)
    ctx.restore()
  }
  ctx.restore()

  const text = `$${formatPrice(value)}`
  ctx.save()
  ctx.font = `900 12px ${MONO}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'

  const pillH = 22
  const pillW = Math.ceil(ctx.measureText(text).width) + 24
  const pillX = Math.max(6, headX - HEAD_RADIUS - 8 - pillW)
  const pillY = Math.max(
    pillH / 2 + 4,
    Math.min(geom.h - (pillH / 2 + 4), headY),
  )

  ctx.fillStyle = 'rgba(88,28,135,0.72)'
  ctx.strokeStyle = 'rgba(167,139,250,0.55)'
  ctx.lineWidth = 1
  roundRectPath(ctx, pillX, pillY - pillH / 2, pillW, pillH, 11)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#e8f4ff'
  ctx.shadowColor = 'rgba(167,139,250,0.25)'
  ctx.shadowBlur = 8
  ctx.fillText(text, pillX + pillW / 2, pillY)
  ctx.restore()
}

/**
 * Repaint the live line. Called from the 100ms feed loop, so it allocates only
 * the point array and never touches the DOM.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ values: number[], w: number, h: number, phase: number, dpr: number,
 *   logo: HTMLImageElement | null }} params
 * @returns {boolean} whether anything was drawn
 */
export function drawLiveLine(ctx, { values, w, h, phase, dpr, logo }) {
  if (!values || values.length < 2 || !w || !h) return false
  const scale = computeScale(values)
  if (!scale) return false

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w * dpr, h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const geom = buildGeometry(ctx, w, h, scale)
  const points = buildPoints(values, geom, scale, phase)
  const headValue = values[values.length - 1]

  drawPriceAxis(ctx, geom, scale)
  drawTimeAxis(ctx, geom)
  drawCurrentPriceLine(ctx, geom, scale, headValue)
  drawArea(ctx, points, geom)
  drawLine(ctx, points)
  drawHead(ctx, points, headValue, geom, logo)

  return true
}
