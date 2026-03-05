/**
 * One-time Google Calendar OAuth2 setup script.
 *
 * Usage:
 *   1. Download client-secret.json from GCP Console → Credentials → your OAuth2 client
 *   2. Place it in the project root (it's gitignored)
 *   3. Run: npm run gcal-setup
 *   4. Open the printed URL in your browser and approve access
 *   5. Copy the printed GCAL_REFRESH_TOKEN= line into your .env
 */

import 'dotenv/config'
import { readFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { google } from 'googleapis'

const PORT = 3000
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

// Load credentials from client-secret.json if present, otherwise fall back to env vars
let clientId, clientSecret

const secretPath = new URL('../client-secret.json', import.meta.url).pathname
if (existsSync(secretPath)) {
  const json = JSON.parse(readFileSync(secretPath, 'utf8'))
  const creds = json.web ?? json.installed
  if (!creds) {
    console.error('client-secret.json has unexpected format')
    process.exit(1)
  }
  clientId = creds.client_id
  clientSecret = creds.client_secret
  console.log(`Loaded credentials from client-secret.json (type: ${json.web ? 'web' : 'installed'})`)
} else {
  const { GCAL_CLIENT_ID, GCAL_CLIENT_SECRET } = process.env
  if (!GCAL_CLIENT_ID || !GCAL_CLIENT_SECRET) {
    console.error('Error: place client-secret.json in the project root, or set GCAL_CLIENT_ID and GCAL_CLIENT_SECRET in .env')
    process.exit(1)
  }
  clientId = GCAL_CLIENT_ID
  clientSecret = GCAL_CLIENT_SECRET
}

const redirectUri = `http://localhost:${PORT}/callback`
const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
})

console.log('\n=== Google Calendar OAuth2 Setup ===\n')
console.log('1. Open this URL in your browser:\n')
console.log(authUrl)
console.log('\n2. Approve access when prompted.')
console.log('3. You will be redirected to localhost. This script will capture the token.\n')
console.log('Waiting for OAuth2 callback on http://localhost:' + PORT + '...\n')

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname !== '/callback') {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end(`OAuth error: ${error}`)
    console.error('\nOAuth error:', error)
    server.close()
    process.exit(1)
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('Missing code parameter')
    server.close()
    return
  }

  try {
    const { tokens } = await oauth2Client.getToken(code)

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`
      <html><body style="font-family:sans-serif;padding:2rem">
        <h2>Success!</h2>
        <p>Your refresh token has been printed to the terminal. You can close this tab.</p>
      </body></html>
    `)

    console.log('\n=== SUCCESS ===\n')
    console.log('Add this line to your .env file:\n')
    console.log(`GCAL_REFRESH_TOKEN=${tokens.refresh_token}`)
    console.log('\nDone! You can now run: npm run standup')
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(`Token exchange failed: ${e.message}`)
    console.error('\nToken exchange failed:', e.message)
  } finally {
    server.close()
  }
})

server.listen(PORT)
