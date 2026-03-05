import { google } from 'googleapis'

/**
 * Returns an OAuth2 client with a valid access token.
 * @param {object} [config] Optional per-user credentials.
 *   Falls back to GMAIL_* env vars for CLI compatibility.
 */
export async function getAuthClient(config = {}) {
  const clientId = config.clientId ?? process.env.GMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID
  const clientSecret = config.clientSecret ?? process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = config.refreshToken ?? process.env.GMAIL_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth credentials')
  }

  const client = new google.auth.OAuth2(clientId, clientSecret)
  client.setCredentials({ refresh_token: refreshToken })
  await client.getAccessToken()
  return client
}
