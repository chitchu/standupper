import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CACHE_PATH = resolve(process.cwd(), '.standup-cache.json')
const STALE_MS = 60 * 60 * 1000 // 1 hour

/**
 * Returns cached SourceResults if they exist and are less than 1 hour old.
 * Returns null if cache is missing, unreadable, or stale.
 *
 * @returns {import('./types.js').SourceResult[] | null}
 */
export function loadCache() {
  try {
    const raw = readFileSync(CACHE_PATH, 'utf8')
    const { cachedAt, results } = JSON.parse(raw)
    if (Date.now() - new Date(cachedAt).getTime() > STALE_MS) return null
    // Re-hydrate Date fields
    for (const result of results) {
      result.fetchedAt = new Date(result.fetchedAt)
      for (const item of result.items) {
        if (item.timestamp) item.timestamp = new Date(item.timestamp)
      }
    }
    return results
  } catch {
    return null
  }
}

/**
 * Persists SourceResults to the cache file with the current timestamp.
 *
 * @param {import('./types.js').SourceResult[]} results
 */
export function saveCache(results) {
  try {
    writeFileSync(CACHE_PATH, JSON.stringify({ cachedAt: new Date(), results }, null, 2))
  } catch (e) {
    console.warn('[cache] Failed to write cache:', e.message)
  }
}
