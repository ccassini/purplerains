import { useSyncExternalStore } from 'react'
import { createAgoraPoller, fetchAgoraData } from '../../utils/agoraApi'
import { acceptTransfers, BATCH_LIMIT, HISTORY_LIMIT, makeNodes } from './agoraModel'

const EMPTY = { nodes: [], chains: [], history: [], batch: { id: 0, transfers: [] }, chainStatus: [], loading: true, error: '', updatedAt: 0 }
let snapshot = EMPTY
const listeners = new Set()
let stopTimer, pollTimer, flushTimer, controller, poller
let running = false
let generation = 0
let polling = false
let seen = new Set()
let pendingTransfers = []

function publish(update) {
  snapshot = { ...snapshot, ...update }
  listeners.forEach((notify) => notify())
}

function flushTransfers() {
  clearTimeout(flushTimer)
  flushTimer = null
  if (!pendingTransfers.length) return
  const fresh = pendingTransfers.sort((a, b) => b.receivedAt - a.receivedAt)
  pendingTransfers = []
  publish({ history: [...fresh, ...snapshot.history].sort((a, b) => b.receivedAt - a.receivedAt || (a.chainId === b.chainId ? b.blockNumber - a.blockNumber || b.logIndex - a.logIndex : 0)).slice(0, HISTORY_LIMIT),
    batch: { id: snapshot.batch.id + 1, transfers: fresh.slice(0, BATCH_LIMIT) } })
}

function receive(result) {
  const now = Date.now()
  const fresh = acceptTransfers(result.transfers || [], snapshot.nodes, seen, now)
  pendingTransfers.push(...fresh)
  // Network responses arriving in one frame become one batch, not a queue.
  if (fresh.length && !flushTimer) flushTimer = setTimeout(flushTransfers, 16)
  const statuses = new Map(snapshot.chainStatus.map((status) => [status.chainId, status]))
  for (const status of result.chainStatus || []) statuses.set(status.chainId, status)
  publish({ chainStatus: [...statuses.values()], loading: false, error: '', updatedAt: now })
}

async function poll() {
  if (!running || polling || !poller || document.hidden) return
  const current = generation
  polling = true
  clearTimeout(pollTimer)
  controller = new AbortController()
  try {
    const result = await poller.poll({ signal: controller.signal, onChainResult: (partial) => {
      if (running && current === generation) receive(partial)
    } })
    if (!running || current !== generation) return
    receive(result)
    flushTransfers()
  } catch (error) {
    if (current === generation && running && error.name !== 'AbortError') publish({ error: 'The live feed is temporarily unavailable. Retrying automatically.', loading: false })
  } finally {
    if (current === generation) {
      polling = false
      if (running && !document.hidden) pollTimer = setTimeout(poll, 1200)
    }
  }
}

function onVisibility() {
  clearTimeout(pollTimer)
  flushTransfers()
  if (!document.hidden) poll()
}

async function start() {
  running = true
  const current = ++generation
  seen = new Set()
  controller = new AbortController()
  document.addEventListener('visibilitychange', onVisibility)
  try {
    const data = await fetchAgoraData(controller.signal)
    if (!running || current !== generation) return
    publish({ ...EMPTY, nodes: makeNodes(data.cities), chains: data.chains,
      chainStatus: data.chains.map((chain) => ({ chainId: chain.chainId, chainName: chain.chainName, status: 'connecting' })), loading: false })
    poller = createAgoraPoller(data.chains)
    poll()
  } catch (error) {
    if (current === generation && error.name !== 'AbortError') publish({ loading: false, error: 'Unable to initialize AUSD network data.' })
  }
}

function stop() {
  running = false
  generation++
  polling = false
  clearTimeout(pollTimer)
  clearTimeout(flushTimer)
  flushTimer = null
  pendingTransfers = []
  controller?.abort()
  poller = null
  document.removeEventListener('visibilitychange', onVisibility)
  snapshot = EMPTY
}

function subscribe(listener) {
  clearTimeout(stopTimer)
  listeners.add(listener)
  if (!running) start()
  return () => {
    listeners.delete(listener)
    // Keep a single feed alive across the 2D/3D route transition and StrictMode.
    if (!listeners.size) stopTimer = setTimeout(stop, 1500)
  }
}

export function refreshAgoraFeed() {
  if (poller) poll()
  else if (running && !polling) { stop(); start() }
}

export function useAgoraFeed() {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY)
}

if (import.meta.hot) import.meta.hot.dispose(stop)
