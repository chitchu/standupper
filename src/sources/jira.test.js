import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fetch } from './jira.js'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  process.env.JIRA_BASE_URL = 'https://jira.example.com'
  process.env.JIRA_EMAIL = 'user@example.com'
  process.env.JIRA_API_TOKEN = 'token123'
  process.env.JIRA_ACCOUNT_ID = 'account456'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.JIRA_BASE_URL
  delete process.env.JIRA_EMAIL
  delete process.env.JIRA_API_TOKEN
  delete process.env.JIRA_ACCOUNT_ID
})

describe('jira fetch', () => {
  it('returns null when JIRA_BASE_URL is missing', async () => {
    delete process.env.JIRA_BASE_URL
    expect(await fetch()).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns null when JIRA_EMAIL is missing', async () => {
    delete process.env.JIRA_EMAIL
    expect(await fetch()).toBeNull()
  })

  it('returns null when JIRA_API_TOKEN is missing', async () => {
    delete process.env.JIRA_API_TOKEN
    expect(await fetch()).toBeNull()
  })

  it('returns null when JIRA_ACCOUNT_ID is missing', async () => {
    delete process.env.JIRA_ACCOUNT_ID
    expect(await fetch()).toBeNull()
  })

  it('returns null on non-ok API response (e.g. 401)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    })
    expect(await fetch()).toBeNull()
  })

  it('returns null when no issues are found', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [] }),
    })
    expect(await fetch()).toBeNull()
  })

  it('maps issue to correct title format', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        issues: [
          {
            key: 'PROJ-123',
            fields: {
              summary: 'Fix the bug',
              status: { name: 'In Progress' },
              updated: new Date().toISOString(),
            },
          },
        ],
      }),
    })

    const result = await fetch()
    expect(result).not.toBeNull()
    expect(result.items[0].title).toContain('PROJ-123: Fix the bug')
    expect(result.items[0].title).toContain('[In Progress]')
  })

  it('constructs the correct browse URL for each issue', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        issues: [
          {
            key: 'PROJ-456',
            fields: {
              summary: 'Another task',
              status: { name: 'Done' },
              updated: new Date().toISOString(),
            },
          },
        ],
      }),
    })

    const result = await fetch()
    expect(result.items[0].url).toBe('https://jira.example.com/browse/PROJ-456')
  })

  it('sets type to "issue" for each item', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        issues: [
          {
            key: 'X-1',
            fields: { summary: 'Task', status: { name: 'Open' }, updated: new Date().toISOString() },
          },
        ],
      }),
    })

    const result = await fetch()
    expect(result.items[0].type).toBe('issue')
  })

  it('sends Authorization header with Basic auth', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [] }),
    })

    await fetch()
    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers.Authorization).toMatch(/^Basic /)
  })
})
