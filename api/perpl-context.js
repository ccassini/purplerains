import { jsonResponse, loadPerplContext } from './_lib/perplRelay.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'Method not allowed' })
  try {
    const context = await loadPerplContext()
    res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=10')
    return jsonResponse(res, 200, context)
  } catch {
    return jsonResponse(res, 502, { error: 'Perpl market source is temporarily unavailable' })
  }
}
