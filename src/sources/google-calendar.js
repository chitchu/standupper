import { google } from 'googleapis'

export const name = 'Google Calendar'

/**
 * @param {object} [config] Per-user credentials. Falls back to process.env.
 *   { googleRefreshToken } — client ID/secret are app-level env vars.
 * @returns {Promise<import('../types.js').SourceResult | null>}
 */
export async function fetch(config = {}) {
  const clientId = process.env.GCAL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GCAL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = config.googleRefreshToken ?? process.env.GCAL_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return null

  let auth
  try {
    const client = new google.auth.OAuth2(clientId, clientSecret)
    client.setCredentials({ refresh_token: refreshToken })
    await client.getAccessToken()
    auth = client
  } catch (e) {
    console.warn('[Google Calendar] Auth failed:', e.message)
    return null
  }

  const calendar = google.calendar({ version: 'v3', auth })

  // Calendar-day boundaries in local timezone
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const yesterdayStart = new Date(todayStart - 24 * 60 * 60 * 1000)
  const yesterdayEnd = new Date(todayStart - 1)

  const items = []

  const fetchEvents = async (timeMin, timeMax, type) => {
    try {
      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
      })

      for (const event of res.data.items ?? []) {
        // Skip declined events
        const selfAttendee = (event.attendees ?? []).find((a) => a.self)
        if (selfAttendee?.responseStatus === 'declined') continue

        // Skip all-day events (no dateTime means date-only)
        const start = event.start
        const end = event.end
        if (!start?.dateTime) continue

        const startDt = new Date(start.dateTime)
        const endDt = new Date(end.dateTime)

        items.push({
          type,
          title: event.summary ?? '(no title)',
          timestamp: startDt,
          detail: formatTimeRange(startDt, endDt),
        })
      }
    } catch (e) {
      console.warn(`[Google Calendar] ${type} fetch failed:`, e.message)
    }
  }

  await Promise.all([
    fetchEvents(yesterdayStart, yesterdayEnd, 'event_past'),
    fetchEvents(todayStart, todayEnd, 'event_upcoming'),
  ])

  return items.length > 0 ? { source: name, items, fetchedAt: new Date() } : null
}

function formatTimeRange(start, end) {
  const fmt = (d) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${fmt(start)}–${fmt(end)}`
}
