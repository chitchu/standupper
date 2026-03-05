export const name = 'GitLab'

/**
 * @param {object} [config] Per-user credentials. Falls back to process.env.
 * @returns {Promise<import('../types.js').SourceResult | null>}
 */
export async function fetch(config = {}) {
  const GITLAB_TOKEN = config.gitlabToken ?? process.env.GITLAB_TOKEN
  const GITLAB_USER_ID = config.gitlabUserId ?? process.env.GITLAB_USER_ID
  const GITLAB_URL = config.gitlabUrl ?? process.env.GITLAB_URL
  if (!GITLAB_TOKEN || !GITLAB_USER_ID) return null

  const base = new URL(GITLAB_URL || 'https://gitlab.com').origin
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const headers = { 'PRIVATE-TOKEN': GITLAB_TOKEN }

  const items = []

  const get = async (path) => {
    const res = await globalThis.fetch(`${base}/api/v4${path}`, { headers })
    if (!res.ok) throw new Error(`GitLab ${path} → ${res.status}`)
    return res.json()
  }

  // MRs authored
  try {
    const mrs = await get(
      `/merge_requests?author_id=${GITLAB_USER_ID}&created_after=${since}&per_page=50`
    )
    for (const mr of mrs) {
      items.push({
        type: 'mr_opened',
        title: `!${mr.iid}: ${mr.title}`,
        url: mr.web_url,
        detail: mr.state,
        timestamp: new Date(mr.created_at),
      })
    }
  } catch (e) {
    console.warn('[GitLab] MR authored fetch failed:', e.message)
  }

  // MRs reviewed
  try {
    const reviewed = await get(
      `/merge_requests?reviewer_id=${GITLAB_USER_ID}&updated_after=${since}&per_page=50`
    )
    for (const mr of reviewed) {
      // Skip ones we authored (already captured above)
      if (String(mr.author?.id) === String(GITLAB_USER_ID)) continue
      items.push({
        type: 'mr_reviewed',
        title: `!${mr.iid}: ${mr.title}`,
        url: mr.web_url,
        detail: mr.state,
        timestamp: new Date(mr.updated_at),
      })
    }
  } catch (e) {
    console.warn('[GitLab] MR reviewed fetch failed:', e.message)
  }

  // Push events (commits)
  try {
    const pushEvents = await get(
      `/users/${GITLAB_USER_ID}/events?action=pushed&after=${since}&per_page=50`
    )
    for (const ev of pushEvents) {
      const branch = ev.push_data?.ref ?? '?'
      const count = ev.push_data?.commit_count ?? 1
      const project = ev.project_id
      items.push({
        type: 'commit',
        title: `Pushed ${count} commit${count !== 1 ? 's' : ''} to ${branch}`,
        detail: `project:${project}`,
        timestamp: new Date(ev.created_at),
      })
    }
  } catch (e) {
    console.warn('[GitLab] Push events fetch failed:', e.message)
  }

  // Comment events
  try {
    const commentEvents = await get(
      `/users/${GITLAB_USER_ID}/events?action=commented&after=${since}&per_page=50`
    )
    for (const ev of commentEvents) {
      const target = ev.note?.noteable_type ?? 'thread'
      const snippet = ev.note?.body?.slice(0, 80) ?? ''
      items.push({
        type: 'comment',
        title: `Commented on ${target}`,
        detail: snippet,
        timestamp: new Date(ev.created_at),
      })
    }
  } catch (e) {
    console.warn('[GitLab] Comment events fetch failed:', e.message)
  }

  return items.length > 0 ? { source: name, items, fetchedAt: new Date() } : null
}
