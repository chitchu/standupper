import { GoogleGenerativeAI } from '@google/generative-ai'

const SYSTEM_PROMPT = `You are writing a daily standup entry on behalf of a software engineer. Match their natural writing style exactly.

Style rules (strictly follow these):
- all lowercase — no capital letters anywhere, including MR titles, ticket names, proper nouns
- very short, punchy bullets — lead with the action word: "merged X", "deployed Y", "continue Z"
- no periods at the end of bullets
- no "i" subject pronoun — omit it entirely, e.g. "merged X" not "i merged X"
- use parenthetical context for brief notes — e.g. "(behind a flag)", "(resuming)", "(with hiccups)"
- abbreviate meetings: "1:1 w dan" not "1-on-1 with Dan"
- for MRs, use the MR title as the link label, not "opened/continued MR !X"
- for jira tickets, format as a markdown link using the ticket id + title as the label: [PROJ-123: title](url)
- when a URL is available, format as a markdown link: [label](url)
- never escape underscores or other characters — output plain unescaped markdown

Format:

### what i did yesterday / last standup

* one bullet per task, merged MR, or meeting attended

### what i will do today

* one bullet per planned item or scheduled work meeting, inferred from open/in-progress work

Additional rules:
- one bullet per distinct item — no sub-bullets
- do not invent work not in the activity summary
- do not repeat the same item in both sections
- describe MR comments as "code review on [mr title](url)"
- include work meetings (1:1s, syncs) as standup items
- exclude social or non-work events (lunch, gaming, happy hour)
- omit commit counts — they are implied by the MR work
- omit "discussed X" items unless there is a clear decision or outcome worth surfacing
- omit routine email/message replies (e.g. "responded to X emails") unless it represents significant external coordination
- today bullets must be specific — never write generic catch-alls like "continue reacting to MR comments" or "work on open items"
- output only the two sections, no preamble, no extra headings`

/**
 * @param {string} activitySummary - Plain text summary from summarize()
 * @returns {Promise<string>} - Formatted standup text
 */
export async function generateStandup(activitySummary) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const models = (process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite').split(',').map((m) => m.trim())
  const genAI = new GoogleGenerativeAI(apiKey)

  const userMessage = `Here is my activity from the past 24 hours:\n\n${activitySummary}\n\nPlease write my standup entry.`

  let lastErr
  for (const modelName of models) {
    const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: SYSTEM_PROMPT })
    const maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await model.generateContent(userMessage)
        return result.response.text()
      } catch (err) {
        lastErr = err
        if (err.status === 429) {
          console.warn(`[LLM] 429 on ${modelName} — trying next model`)
          break
        }
        if (err.status === 503 && attempt < maxAttempts) {
          const delay = 5000 * attempt
          console.warn(`[LLM] 503 — retrying in ${delay / 1000}s (attempt ${attempt}/${maxAttempts})...`)
          await new Promise((r) => setTimeout(r, delay))
        } else {
          throw err
        }
      }
    }
  }
  throw lastErr
}
