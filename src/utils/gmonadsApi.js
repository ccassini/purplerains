import { getLocalLogoPath } from './validatorApi'

const BASE = 'https://www.gmonads.com/api/v1/public'

// ── Epoch validators (used by staking pages) ──

const epochCache = { data: null, meta: null, ts: 0 }
const EPOCH_TTL = 60 * 1000 // 1 min

export async function fetchGmonadsValidatorsEpoch(network = 'mainnet') {
  if (epochCache.data && Date.now() - epochCache.ts < EPOCH_TTL) {
    return { data: epochCache.data, meta: epochCache.meta }
  }

  const res = await fetch(`${BASE}/validators/epoch?network=${network}`)
  if (!res.ok) throw new Error(`gmonads epoch API error: ${res.status}`)

  const json = await res.json()
  if (!json.success) throw new Error('gmonads epoch API returned success=false')

  epochCache.data = json.data
  epochCache.meta = json.meta
  epochCache.ts = Date.now()

  return { data: json.data, meta: json.meta }
}

// ── Live block metrics (1-min buckets) ──
// Source: https://www.gmonads.com/api/v1/public/blocks/1m
// Fields: avg_block_time_s, avg_tps, avg_tx_per_block

const blockMetricsCache = { data: null, ts: 0 }
const BLOCK_METRICS_TTL = 30 * 1000 // 30s

/**
 * Latest network block metrics from gmonads 1-minute buckets.
 * @param {string} [network='mainnet']
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<{ avgBlockTimeMs: number, avgTps: number, avgTxPerBlock: number }>}
 */
export async function fetchGmonadsBlockMetrics(network = 'mainnet', forceRefresh = false) {
  if (!forceRefresh && blockMetricsCache.data && Date.now() - blockMetricsCache.ts < BLOCK_METRICS_TTL) {
    return blockMetricsCache.data
  }

  const res = await fetch(`${BASE}/blocks/1m?network=${network}`)
  if (!res.ok) throw new Error(`gmonads blocks/1m API error: ${res.status}`)

  const json = await res.json()
  if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
    throw new Error('gmonads blocks/1m returned no data')
  }

  const timeSamples = []
  const tpsSamples = []
  const txSamples = []
  for (let i = json.data.length - 1; i >= 0 && timeSamples.length < 5; i--) {
    const row = json.data[i]
    const sec = Number(row?.avg_block_time_s)
    if (Number.isFinite(sec) && sec > 0 && sec < 5) timeSamples.push(sec)
    const tps = Number(row?.avg_tps)
    if (Number.isFinite(tps) && tps >= 0) tpsSamples.push(tps)
    const txb = Number(row?.avg_tx_per_block)
    if (Number.isFinite(txb) && txb >= 0) txSamples.push(txb)
  }

  if (timeSamples.length === 0) throw new Error('gmonads blocks/1m missing avg_block_time_s')

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
  const data = {
    avgBlockTimeMs: Math.round(avg(timeSamples) * 1000),
    avgTps: tpsSamples.length ? Math.round(avg(tpsSamples)) : 0,
    avgTxPerBlock: txSamples.length ? Math.round(avg(txSamples)) : 0,
  }

  blockMetricsCache.data = data
  blockMetricsCache.ts = Date.now()
  return data
}

/** @deprecated use fetchGmonadsBlockMetrics */
export async function fetchGmonadsAvgBlockTimeMs(network = 'mainnet', forceRefresh = false) {
  const metrics = await fetchGmonadsBlockMetrics(network, forceRefresh)
  return metrics.avgBlockTimeMs
}

// ── World map validators (geolocations + metadata) ──

const worldCache = { data: null, ts: 0 }
const WORLD_TTL = 5 * 60 * 1000 // 5 min

function jitter(val, seed) {
  const r = ((seed * 9301 + 49297) % 233280) / 233280
  return val + (r - 0.5) * 0.35
}

export async function fetchWorldValidators() {
  if (worldCache.data && Date.now() - worldCache.ts < WORLD_TTL) {
    return worldCache.data
  }

  const [geoRes, metaRes, epochRes] = await Promise.all([
    fetch(`${BASE}/validators/geolocations?network=mainnet`),
    fetch(`${BASE}/validators/metadata?network=mainnet`),
    fetch(`${BASE}/validators/epoch?network=mainnet`),
  ])

  if (!geoRes.ok || !metaRes.ok || !epochRes.ok) {
    throw new Error(`gmonads API error: geo=${geoRes.status} meta=${metaRes.status} epoch=${epochRes.status}`)
  }

  const geoJson = await geoRes.json()
  const metaJson = await metaRes.json()
  const epochJson = await epochRes.json()

  if (!geoJson.success || !metaJson.success || !epochJson.success) {
    throw new Error('gmonads API returned success=false')
  }

  const metaById = new Map()
  for (const m of metaJson.data) {
    metaById.set(m.id, m)
  }

  const geoById = new Map()
  for (const g of geoJson.data) {
    if (!geoById.has(g.val_index)) {
      geoById.set(g.val_index, g)
    }
  }

  const epochById = new Map()
  for (const e of epochJson.data) {
    if (!epochById.has(e.val_index)) {
      epochById.set(e.val_index, e)
    }
  }

  const validators = []

  for (const [id, meta] of metaById) {
    const geo = geoById.get(id)
    const epoch = epochById.get(id)
    if (!geo) continue

    validators.push({
      id,
      name: meta.name || `Validator #${id}`,
      logo: meta.logo || '',
      localLogo: getLocalLogoPath(id),
      secp: meta.secp || '',
      website: meta.website || '',
      description: meta.description || '',
      lat: jitter(geo.lat, id * 13),
      lon: jitter(geo.lon, id * 7),
      city: geo.city || '',
      country: geo.country || '',
      countryCode: geo.countryCode || '',
      stake: geo.stake || 0,
      commission: Number(epoch?.commission ?? 0),
      authAddress: epoch?.auth_address || '',
      validatorSetType: epoch?.validator_set_type || geo.validator_set_type || '',
      connected: Boolean(geo.connected),
      nodeId: geo.node_id || '',
      isp: geo.isp || '',
    })
  }

  validators.sort((a, b) => b.stake - a.stake)

  worldCache.data = validators
  worldCache.ts = Date.now()
  return validators
}
