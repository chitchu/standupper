import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fetch } from './slack.js'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  process.env.SLACK_USER_TOKEN = 'xoxp-test-token'
  process.env.SLACK_USER_ID = 'U12345'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.SLACK_USER_TOKEN
  delete process.env.SLACK_USER_ID
})

describe('slack fetch', () => {
  it('returns null when SLACK_USER_TOKEN is missing', async () => {
    delete process.env.SLACK_USER_TOKEN
    expect(await fetch()).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns null when SLACK_USER_ID is missing', async () => {
    delete process.env.SLACK_USER_ID
    expect(await fetch()).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns null when no messages are found', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, messages: { matches: [] } }),
    })
    expect(await fetch()).toBeNull()
  })

  it('filters out messages older than 24 hours', async () => {
    const oldTs = (Date.now() / 1000 - 25 * 60 * 60).toString()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        messages: { matches: [{ ts: oldTs, text: 'old message', channel: { name: 'general' } }] },
      }),
    })
    expect(await fetch()).toBeNull()
  })

  it('includes messages within the last 24 hours', async () => {
    const recentTs = (Date.now() / 1000 - 60).toString() // 1 minute ago
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        messages: {
          matches: [{ ts: recentTs, text: 'Hello team', channel: { name: 'general' } }],
        },
      }),
    })
    const result = await fetch()
    expect(result).not.toBeNull()
    expect(result.items).toHaveLength(1)
  })

  it('maps message to message_sent type with #channel in detail', async () => {
    const recentTs = (Date.now() / 1000 - 60).toString()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        messages: {
          matches: [{ ts: recentTs, text: 'Hello team', channel: { name: 'general' } }],
        },
      }),
    })
    const result = await fetch()
    expect(result.items[0].type).toBe('message_sent')
    expect(result.items[0].detail).toBe('#general')
    expect(result.items[0].title).toBe('Hello team')
  })

  it('truncates message text to 60 characters', async () => {
    const recentTs = (Date.now() / 1000 - 60).toString()
    const longText = 'a'.repeat(100)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        messages: { matches: [{ ts: recentTs, text: longText, channel: { name: 'dev' } }] },
      }),
    })
    const result = await fetch()
    expect(result.items[0].title.length).toBe(60)
  })

  it('uses "(no text)" when message text is empty', async () => {
    const recentTs = (Date.now() / 1000 - 60).toString()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        messages: { matches: [{ ts: recentTs, text: '', channel: { name: 'dev' } }] },
      }),
    })
    const result = await fetch()
    expect(result.items[0].title).toBe('(no text)')
  })

  it('returns null when API returns ok: false', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: 'invalid_auth' }),
    })
    expect(await fetch()).toBeNull()
  })

  it('uses channel id as fallback when channel name is absent', async () => {
    const recentTs = (Date.now() / 1000 - 60).toString()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        messages: { matches: [{ ts: recentTs, text: 'hi', channel: { id: 'C123' } }] },
      }),
    })
    const result = await fetch()
    expect(result.items[0].detail).toBe('#C123')
  })
})
