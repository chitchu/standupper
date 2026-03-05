import { getAuthClient } from '../gmail-auth.js'
import { google } from 'googleapis'

export const name = 'Gmail'

/**
 * @param {object} [config] Per-user credentials. Falls back to process.env.
 *   { googleRefreshToken } — client ID/secret are app-level env vars.
 * @returns {Promise<import('../types.js').SourceResult | null>}
 */
export async function fetch(config = {}) {
  const clientId = process.env.GMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = config.googleRefreshToken ?? process.env.GMAIL_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return null

  let auth
  try {
    auth = await getAuthClient({ clientId, clientSecret, refreshToken })
  } catch (e) {
    console.warn('[Gmail] Auth failed:', e.message)
    return null
  }

  const gmail = google.gmail({ version: 'v1', auth })
  const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)
  const items = []

  const fetchMessages = async (query, direction) => {
    try {
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: `${query} after:${since}`,
        maxResults: 50,
      })
      const msgs = listRes.data.messages ?? []

      for (const { id } of msgs) {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'To', 'From', 'List-Unsubscribe'],
        })

        const headers = Object.fromEntries(
          (msg.data.payload?.headers ?? []).map((h) => [h.name, h.value])
        )

        // Skip newsletters/mailing lists
        if (headers['List-Unsubscribe']) continue

        let subject = headers['Subject'] ?? '(no subject)'
        // Strip Re:/Fwd: prefixes
        subject = subject.replace(/^(Re:|Fwd?:)\s*/i, '').trim()

        if (direction === 'sent') {
          const to = (headers['To'] ?? '').split(',')[0].trim()
          items.push({
            type: 'email_sent',
            title: `[sent] ${subject} → ${to}`,
            timestamp: new Date(parseInt(msg.data.internalDate ?? '0')),
          })
        } else {
          const from = headers['From'] ?? '?'
          items.push({
            type: 'email_received',
            title: `[received] ${subject} ← ${from}`,
            timestamp: new Date(parseInt(msg.data.internalDate ?? '0')),
          })
        }
      }
    } catch (e) {
      console.warn(`[Gmail] ${direction} fetch failed:`, e.message)
    }
  }

  await Promise.all([
    fetchMessages('in:sent', 'sent'),
    fetchMessages('in:inbox -in:sent', 'received'),
  ])

  // Cap at 10 items, newest first
  items.sort((a, b) => b.timestamp - a.timestamp)
  const capped = items.slice(0, 10)

  return capped.length > 0 ? { source: name, items: capped, fetchedAt: new Date() } : null
}
