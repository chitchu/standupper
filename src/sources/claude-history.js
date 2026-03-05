/**
 * Claude conversation history source — stub.
 *
 * The Anthropic API does not provide a public endpoint for retrieving
 * conversation history as of February 2026. This module is intentionally
 * left as a no-op so that the rest of the pipeline is unaffected.
 *
 * If Anthropic adds such an API in the future, implement fetch() here and
 * add the relevant env vars to .env.example.
 */

export const name = 'Claude History'

export async function fetch() {
  return null
}
