import 'dotenv/config'
import { App, ExpressReceiver } from '@slack/bolt'
import { google } from 'googleapis'
import { sources } from './src/sources/index.js'
import { summarize } from './src/summarize.js'
import { generateStandup } from './src/llm.js'
import { getUser, upsertUser, saveOAuthState, consumeOAuthState, cleanupOldStates } from './src/db.js'

const APP_URL = process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`

// ── Slack Bolt setup ────────────────────────────────────────────────────────
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET ?? '',
})

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
})

// ── OAuth helpers ────────────────────────────────────────────────────────────

function googleAuthClient(redirectPath = '/auth/google/callback') {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${APP_URL}${redirectPath}`
  )
}

function googleAuthUrl(state) {
  const client = googleAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
    state,
  })
}

function gitlabAuthUrl(state) {
  const base = process.env.GITLAB_URL ?? 'https://gitlab.com'
  const params = new URLSearchParams({
    client_id: process.env.GITLAB_CLIENT_ID ?? '',
    redirect_uri: `${APP_URL}/auth/gitlab/callback`,
    response_type: 'code',
    scope: 'read_api',
    state,
  })
  return `${base}/oauth/authorize?${params}`
}

function jiraAuthUrl(state) {
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: process.env.JIRA_CLIENT_ID ?? '',
    scope: 'read:jira-work offline_access',
    redirect_uri: `${APP_URL}/auth/jira/callback`,
    state,
    response_type: 'code',
    prompt: 'consent',
  })
  return `https://auth.atlassian.com/authorize?${params}`
}

// ── Build per-user source config from DB ────────────────────────────────────

function buildConfig(user) {
  if (!user) return {}
  return {
    gitlabToken: user.gitlab_token,
    gitlabUserId: user.gitlab_user_id,
    gitlabUrl: user.gitlab_url,
    jiraAccessToken: user.jira_access_token,
    jiraRefreshToken: user.jira_refresh_token,
    jiraCloudId: user.jira_cloud_id,
    jiraAccountId: user.jira_account_id,
    slackUserToken: user.slack_user_token,
    googleRefreshToken: user.google_refresh_token,
  }
}

// ── /standup slash command ───────────────────────────────────────────────────

app.command('/standup', async ({ command, ack, respond }) => {
  await ack()
  const [sub, ...rest] = (command.text ?? '').trim().split(/\s+/)
  const slackUserId = command.user_id

  if (!sub || sub === 'generate') {
    await respond({ response_type: 'ephemeral', text: '⏳ Generating your standup...' })
    try {
      const user = getUser(slackUserId)
      const config = buildConfig(user)
      const settled = await Promise.allSettled(
        sources.map((s) => s.fetch(config).then((r) => {
          if (r === null) console.log(`[${s.name}] Skipped`)
          return r
        }))
      )
      const results = settled.flatMap((o) => (o.status === 'fulfilled' && o.value ? [o.value] : []))
      const summary = results.length > 0 ? summarize(results) : 'No activity data available.'
      const standupText = await generateStandup(summary)
      await respond({ response_type: 'in_channel', text: standupText })
    } catch (e) {
      console.error('[standupper] generate error:', e)
      await respond({ response_type: 'ephemeral', text: `❌ Failed to generate standup: ${e.message}` })
    }
    return
  }

  if (sub === 'connect') {
    const service = rest[0]?.toLowerCase()
    cleanupOldStates()

    if (service === 'google') {
      const state = saveOAuthState(slackUserId, 'google')
      await respond({ response_type: 'ephemeral', text: `<${googleAuthUrl(state)}|🔗 Connect Google (Gmail + Calendar)>` })
    } else if (service === 'gitlab') {
      const state = saveOAuthState(slackUserId, 'gitlab')
      await respond({ response_type: 'ephemeral', text: `<${gitlabAuthUrl(state)}|🔗 Connect GitLab>` })
    } else if (service === 'jira') {
      const state = saveOAuthState(slackUserId, 'jira')
      await respond({ response_type: 'ephemeral', text: `<${jiraAuthUrl(state)}|🔗 Connect Jira>` })
    } else {
      await respond({
        response_type: 'ephemeral',
        text: 'Usage: `/standup connect google|gitlab|jira`',
      })
    }
    return
  }

  if (sub === 'status') {
    const user = getUser(slackUserId)
    const lines = [
      `Google: ${user?.google_refresh_token ? '✅' : '❌'}`,
      `GitLab: ${user?.gitlab_token ? '✅' : '❌'}`,
      `Jira: ${user?.jira_access_token ? '✅' : '❌'}`,
      `Slack: ${user?.slack_user_token ? '✅' : '❌ (optional)'}`,
    ]
    await respond({ response_type: 'ephemeral', text: lines.join('\n') })
    return
  }

  await respond({
    response_type: 'ephemeral',
    text: 'Usage: `/standup` · `/standup connect google|gitlab|jira` · `/standup status`',
  })
})

// ── OAuth callbacks (on Express receiver) ───────────────────────────────────

receiver.router.get('/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query
  if (error) return res.send(`<h2>❌ Google auth error: ${error}</h2>`)
  const stateRow = consumeOAuthState(state)
  if (!stateRow) return res.send('<h2>❌ Invalid or expired state. Please try again from Slack.</h2>')

  try {
    const client = googleAuthClient()
    const { tokens } = await client.getToken(code)
    upsertUser(stateRow.slack_user_id, { google_refresh_token: tokens.refresh_token })
    res.send('<h2>✅ Google connected! You can close this tab and return to Slack.</h2>')
  } catch (e) {
    console.error('[OAuth] Google token exchange failed:', e.message)
    res.send('<h2>❌ Failed to exchange Google token. Please try again.</h2>')
  }
})

receiver.router.get('/auth/gitlab/callback', async (req, res) => {
  const { code, state, error } = req.query
  if (error) return res.send(`<h2>❌ GitLab auth error: ${error}</h2>`)
  const stateRow = consumeOAuthState(state)
  if (!stateRow) return res.send('<h2>❌ Invalid or expired state. Please try again from Slack.</h2>')

  const base = process.env.GITLAB_URL ?? 'https://gitlab.com'
  try {
    const tokenRes = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITLAB_CLIENT_ID,
        client_secret: process.env.GITLAB_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${APP_URL}/auth/gitlab/callback`,
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokenRes.ok) throw new Error(tokens.error_description ?? 'token exchange failed')

    // Fetch user ID from GitLab
    const userRes = await fetch(`${base}/api/v4/user`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const gitlabUser = await userRes.json()

    upsertUser(stateRow.slack_user_id, {
      gitlab_token: tokens.access_token,
      gitlab_user_id: String(gitlabUser.id),
      gitlab_url: base,
    })
    res.send('<h2>✅ GitLab connected! You can close this tab and return to Slack.</h2>')
  } catch (e) {
    console.error('[OAuth] GitLab token exchange failed:', e.message)
    res.send('<h2>❌ Failed to connect GitLab. Please try again.</h2>')
  }
})

receiver.router.get('/auth/jira/callback', async (req, res) => {
  const { code, state, error } = req.query
  if (error) return res.send(`<h2>❌ Jira auth error: ${error}</h2>`)
  const stateRow = consumeOAuthState(state)
  if (!stateRow) return res.send('<h2>❌ Invalid or expired state. Please try again from Slack.</h2>')

  try {
    const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.JIRA_CLIENT_ID,
        client_secret: process.env.JIRA_CLIENT_SECRET,
        code,
        redirect_uri: `${APP_URL}/auth/jira/callback`,
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokenRes.ok) throw new Error(tokens.error_description ?? 'token exchange failed')

    // Get the Jira cloud ID
    const resourcesRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
    })
    const resources = await resourcesRes.json()
    const cloudId = resources[0]?.id
    if (!cloudId) throw new Error('No Jira cloud resource found')

    // Get the user's account ID
    const meRes = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
    })
    const me = await meRes.json()

    upsertUser(stateRow.slack_user_id, {
      jira_access_token: tokens.access_token,
      jira_refresh_token: tokens.refresh_token,
      jira_cloud_id: cloudId,
      jira_account_id: me.accountId,
    })
    res.send('<h2>✅ Jira connected! You can close this tab and return to Slack.</h2>')
  } catch (e) {
    console.error('[OAuth] Jira token exchange failed:', e.message)
    res.send('<h2>❌ Failed to connect Jira. Please try again.</h2>')
  }
})

// Health check
receiver.router.get('/health', (_req, res) => res.json({ ok: true }))

// ── Start ────────────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3000', 10)
;(async () => {
  await app.start(port)
  console.log(`[standupper] Slack bot running on port ${port}`)
})()
