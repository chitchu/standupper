import 'dotenv/config'
import { sources } from './src/sources/index.js'
import { summarize } from './src/summarize.js'
import { generateStandup } from './src/llm.js'
import { writeEntry } from './src/writer.js'
import { loadCache, saveCache } from './src/cache.js'

async function main() {
  const today = new Date()
  console.log(`[standupper] Generating standup for ${today.toISOString().slice(0, 10)}...`)

  if (!process.env.GEMINI_API_KEY) {
    console.error('[standupper] Error: GEMINI_API_KEY is required. See .env.example for setup.')
    process.exit(1)
  }

  // Use cached results if fresh (< 1 hour old)
  let results = loadCache()
  if (results) {
    console.log('[cache] Using cached source results (less than 1 hour old)')
  } else {
    // Fetch all sources concurrently; failed sources are skipped with a warning
    const settled = await Promise.allSettled(
      sources.map((source) =>
        source.fetch().then((result) => {
          if (result === null) {
            console.log(`[${source.name}] Skipped (not configured or no activity)`)
          } else {
            console.log(`[${source.name}] Fetched ${result.items.length} item(s)`)
          }
          return result
        })
      )
    )

    results = []
    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i]
      const sourceName = sources[i].name
      if (outcome.status === 'rejected') {
        console.warn(`[${sourceName}] Fetch error:`, outcome.reason?.message ?? outcome.reason)
      } else if (outcome.value !== null) {
        results.push(outcome.value)
      }
    }

    saveCache(results)
  }

  if (results.length === 0) {
    console.warn('[standupper] No activity found from any source.')
    console.warn('[standupper] Configure at least one source in .env to get activity data.')
    console.warn('[standupper] Continuing with empty summary — LLM will note the lack of data.')
  }

  const summary = results.length > 0
    ? summarize(results)
    : 'No activity data available from configured sources.'

  console.log('\n[standupper] Activity summary:\n')
  console.log(summary)
  console.log('\n[standupper] Generating standup via Gemini...')

  const standupText = await generateStandup(summary)

  console.log('\n[standupper] Generated standup:\n')
  console.log(standupText)

  await writeEntry(today, standupText)
  console.log('\n[standupper] Done. Check standup.md.')
}

main().catch((err) => {
  console.error('[standupper] Fatal error:', err)
  process.exit(1)
})
