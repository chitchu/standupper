/**
 * Test a single source module in isolation.
 * Usage: node scripts/test-source.js <source>
 * Or via npm: npm run test:gitlab / test:jira / test:slack / test:gmail
 */

import 'dotenv/config'
import { sources } from '../src/sources/index.js'

const arg = process.argv[2]?.toLowerCase().replace(/-/g, ' ')

if (!arg) {
  console.error('Usage: node scripts/test-source.js <source>')
  console.error('Available:', sources.map(s => s.name.toLowerCase()).join(', '))
  process.exit(1)
}

const source = sources.find(s => s.name.toLowerCase() === arg)

if (!source) {
  console.error(`Unknown source: "${arg}"`)
  console.error('Available:', sources.map(s => s.name.toLowerCase()).join(', '))
  process.exit(1)
}

console.log(`Testing source: ${source.name}\n`)

try {
  const result = await source.fetch()
  if (result === null) {
    console.log('Result: null (source disabled or no activity — check your .env)')
  } else {
    console.log(`Fetched ${result.items.length} item(s):\n`)
    for (const item of result.items) {
      const ts = item.timestamp.toISOString().slice(0, 16).replace('T', ' ')
      const detail = item.detail ? ` [${item.detail}]` : ''
      const url = item.url ? `\n    ${item.url}` : ''
      console.log(`  [${item.type}] ${ts}  ${item.title}${detail}${url}`)
    }
  }
} catch (err) {
  console.error('Error:', err.message)
  process.exit(1)
}
