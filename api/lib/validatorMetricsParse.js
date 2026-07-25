/**
 * Shared validator performance HTML/text parser.
 * Used by the Vercel API and unit tests.
 */

export function pick(regex, text) {
  const m = text.match(regex)
  return m ? m[1].trim() : null
}

export function normalizePercent(s) {
  if (!s) return null
  return s.replace(/\s+/g, '')
}

export function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseMetricPage(input) {
  const text = input.includes('<') ? stripHtml(input) : input
  const pct = '([0-9]+(?:\\.[0-9]+)?\\s*%)'
  return {
    uptime24: normalizePercent(pick(new RegExp(`Uptime\\s+${pct}`, 'i'), text)),
    totalStakeText: pick(/Total Stake\s+([0-9][0-9.,]*\s*[KMBT]?\s*MON)/i, text),
    commissionText: normalizePercent(pick(new RegExp(`Commission\\s+${pct}`, 'i'), text)),
    commitsText: pick(/Commits\s+([0-9][0-9,]*)/i, text),
    timeoutsText: pick(/Timeouts\s+([0-9][0-9,]*)/i, text),
    successRateText: normalizePercent(pick(new RegExp(`Success rate:\\s*${pct}`, 'i'), text)),
    missRateText: normalizePercent(pick(new RegExp(`Miss rate:\\s*${pct}`, 'i'), text)),
  }
}

export function hasUsefulMetrics(parsed) {
  if (!parsed) return false
  return Boolean(
    parsed.uptime24 ||
      parsed.commitsText ||
      parsed.timeoutsText ||
      parsed.successRateText ||
      parsed.totalStakeText,
  )
}
