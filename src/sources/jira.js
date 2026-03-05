export const name = 'Jira'

/**
 * @param {object} [config] Per-user credentials. Falls back to process.env.
 *   Basic auth: { jiraBaseUrl, jiraEmail, jiraApiToken, jiraAccountId }
 *   OAuth 2.0:  { jiraAccessToken, jiraCloudId, jiraAccountId }
 * @returns {Promise<import('../types.js').SourceResult | null>}
 */
export async function fetch(config = {}) {
  const jiraAccessToken = config.jiraAccessToken
  const jiraCloudId = config.jiraCloudId

  // OAuth 2.0 mode (bot-connected users)
  if (jiraAccessToken && jiraCloudId) {
    const base = `https://api.atlassian.com/ex/jira/${jiraCloudId}/rest/api/3`
    const headers = {
      Authorization: `Bearer ${jiraAccessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    return fetchIssues(base, headers, config.jiraAccountId)
  }

  // Basic auth mode (env vars / CLI)
  const JIRA_BASE_URL = config.jiraBaseUrl ?? process.env.JIRA_BASE_URL
  const JIRA_EMAIL = config.jiraEmail ?? process.env.JIRA_EMAIL
  const JIRA_API_TOKEN = config.jiraApiToken ?? process.env.JIRA_API_TOKEN
  const JIRA_ACCOUNT_ID = config.jiraAccountId ?? process.env.JIRA_ACCOUNT_ID
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_ACCOUNT_ID) return null

  const base = new URL(JIRA_BASE_URL).origin
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')
  const headers = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  return fetchIssues(`${base}/rest/api/3`, headers, JIRA_ACCOUNT_ID)
}

async function fetchIssues(apiBase, headers, accountId) {
  if (!accountId) return null

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  // JQL datetime format: "YYYY-MM-DD HH:mm"
  const jqlDate = since.toISOString().slice(0, 16).replace('T', ' ')

  const jql = [
    `(assignee = "${accountId}" OR reporter = "${accountId}")`,
    `AND updated >= "${jqlDate}"`,
  ].join(' ')

  const body = JSON.stringify({
    jql,
    maxResults: 50,
    fields: ['summary', 'status', 'issuetype', 'assignee', 'reporter', 'updated'],
  })

  let issues = []
  try {
    const res = await globalThis.fetch(`${apiBase}/search/jql`, {
      method: 'POST',
      headers,
      body,
    })
    if (!res.ok) throw new Error(`Jira search → ${res.status}: ${await res.text()}`)
    const data = await res.json()
    issues = data.issues ?? []
  } catch (e) {
    console.warn('[Jira] Search failed:', e.message)
    return null
  }

  const items = []
  for (const issue of issues) {
    const key = issue.key
    const title = issue.fields.summary
    const currentStatus = issue.fields.status?.name ?? '?'
    const baseUrl = new URL(apiBase).origin.replace('api.atlassian.com', 'atlassian.net')

    items.push({
      type: 'issue',
      title: `${key}: ${title} [${currentStatus}]`,
      url: `${baseUrl}/browse/${key}`,
      timestamp: new Date(issue.fields.updated ?? Date.now()),
    })
  }

  return items.length > 0 ? { source: name, items, fetchedAt: new Date() } : null
}
