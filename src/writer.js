import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const STANDUP_FILE = join(process.cwd(), 'standup.md')

/**
 * Prepends a dated standup entry to standup.md (newest entries appear first).
 *
 * @param {Date} date
 * @param {string} text - The generated standup content
 */
export async function writeEntry(date, text) {
  const dateStr = date.toISOString().slice(0, 10)
  const entry = `## ${dateStr}\n\n${text.trim()}\n\n`

  let existing = ''
  if (existsSync(STANDUP_FILE)) {
    existing = await readFile(STANDUP_FILE, 'utf8')
  }

  await writeFile(STANDUP_FILE, entry + existing, 'utf8')
  console.log(`[writer] Prepended entry for ${dateStr} to standup.md`)
}
