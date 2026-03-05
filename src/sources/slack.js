export const name = 'Slack'

/**
 * @param {object} [config] Per-user credentials. Falls back to process.env.
 * @returns {Promise<import('../types.js').SourceResult | null>}
 */
export async function fetch(config = {}) {
  const SLACK_USER_TOKEN = config.slackUserToken ?? process.env.SLACK_USER_TOKEN
  const SLACK_USER_ID = config.slackUserId ?? process.env.SLACK_USER_ID
  if (!SLACK_USER_TOKEN || !SLACK_USER_ID) return null

  const since = Date.now() / 1000 - 24 * 60 * 60 // Unix timestamp 24h ago
  const headers = { Authorization: `Bearer ${SLACK_USER_TOKEN}` }

  const get = async (url) => {
    const res = await globalThis.fetch(url, { headers })
    if (!res.ok) throw new Error(`Slack ${url} → ${res.status}`)
    const data = await res.json()
    if (!data.ok) throw new Error(`Slack API error: ${data.error}`)
    return data
  }

  const items = []

  try {
    const url = new URL('https://slack.com/api/search.messages')
    url.searchParams.set('query', `from:<@${SLACK_USER_ID}>`)
    url.searchParams.set('sort', 'timestamp')
    url.searchParams.set('sort_dir', 'desc')
    url.searchParams.set('count', '100')

    const data = await get(url.toString())
    const messages = data.messages?.matches ?? []

    for (const msg of messages) {
      const ts = parseFloat(msg.ts)
      if (ts < since) continue
      const channel = msg.channel?.name ?? msg.channel?.id ?? 'unknown'
      const text = (msg.text ?? '').slice(0, 60)
      items.push({
        type: 'message_sent',
        title: text || '(no text)',
        detail: `#${channel}`,
        timestamp: new Date(ts * 1000),
      })
    }
  } catch (e) {
    console.warn('[Slack] Sent messages fetch failed:', e.message)
  }

  return items.length > 0 ? { source: name, items, fetchedAt: new Date() } : null
}
