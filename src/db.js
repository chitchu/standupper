import { DatabaseSync } from 'node:sqlite'
import crypto from 'crypto'

const DB_PATH = process.env.SQLITE_DB_PATH ?? 'standupper.db'

const db = new DatabaseSync(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    slack_user_id TEXT PRIMARY KEY,
    gitlab_token TEXT,
    gitlab_user_id TEXT,
    gitlab_url TEXT,
    jira_access_token TEXT,
    jira_refresh_token TEXT,
    jira_cloud_id TEXT,
    jira_account_id TEXT,
    slack_user_token TEXT,
    google_refresh_token TEXT,
    updated_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    slack_user_id TEXT NOT NULL,
    service TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
`)

export function getUser(slackUserId) {
  return db.prepare('SELECT * FROM users WHERE slack_user_id = ?').get(slackUserId) ?? null
}

export function upsertUser(slackUserId, fields) {
  const allowed = [
    'gitlab_token', 'gitlab_user_id', 'gitlab_url',
    'jira_access_token', 'jira_refresh_token', 'jira_cloud_id', 'jira_account_id',
    'slack_user_token', 'google_refresh_token',
  ]
  const updates = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)))
  updates.updated_at = Math.floor(Date.now() / 1000)

  const existing = getUser(slackUserId)
  if (!existing) {
    const cols = ['slack_user_id', ...Object.keys(updates)].join(', ')
    const placeholders = ['?', ...Object.keys(updates).map(() => '?')].join(', ')
    db.prepare(`INSERT INTO users (${cols}) VALUES (${placeholders})`)
      .run(slackUserId, ...Object.values(updates))
  } else {
    const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ')
    db.prepare(`UPDATE users SET ${setClauses} WHERE slack_user_id = ?`)
      .run(...Object.values(updates), slackUserId)
  }
}

export function saveOAuthState(slackUserId, service) {
  const state = crypto.randomBytes(16).toString('hex')
  db.prepare('INSERT INTO oauth_states (state, slack_user_id, service) VALUES (?, ?, ?)').run(state, slackUserId, service)
  return state
}

export function consumeOAuthState(state, expectedService) {
  const row = db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(state)
  if (!row) return null
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state)
  if (expectedService && row.service !== expectedService) return null
  return row
}

export function cleanupOldStates() {
  db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(Math.floor(Date.now() / 1000) - 600)
}
