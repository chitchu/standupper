import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fetch } from './gitlab.js'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  process.env.GITLAB_TOKEN = 'test-token'
  process.env.GITLAB_USER_ID = '123'
  delete process.env.GITLAB_URL
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.GITLAB_TOKEN
  delete process.env.GITLAB_USER_ID
})

/** Returns a minimal ok response resolving to the given data */
const okJson = (data) => Promise.resolve({ ok: true, json: async () => data })

describe('gitlab fetch', () => {
  it('returns null when GITLAB_TOKEN is missing', async () => {
    delete process.env.GITLAB_TOKEN
    expect(await fetch()).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns null when GITLAB_USER_ID is missing', async () => {
    delete process.env.GITLAB_USER_ID
    expect(await fetch()).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns null when all API calls return empty arrays', async () => {
    mockFetch.mockResolvedValue(okJson([]))
    expect(await fetch()).toBeNull()
  })

  it('maps authored MR to mr_opened type with !IID: title format', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('merge_requests?author_id')) {
        return okJson([
          {
            iid: 42,
            title: 'My feature',
            web_url: 'https://gitlab.com/mr/42',
            state: 'opened',
            created_at: new Date().toISOString(),
            author: { id: 999 },
          },
        ])
      }
      return okJson([])
    })

    const result = await fetch()
    expect(result).not.toBeNull()
    expect(result.source).toBe('GitLab')
    expect(result.items[0].type).toBe('mr_opened')
    expect(result.items[0].title).toBe('!42: My feature')
    expect(result.items[0].url).toBe('https://gitlab.com/mr/42')
  })

  it('maps reviewed MR to mr_reviewed type', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('merge_requests?reviewer_id')) {
        return okJson([
          {
            iid: 7,
            title: 'Colleague feature',
            web_url: 'https://gitlab.com/mr/7',
            state: 'opened',
            updated_at: new Date().toISOString(),
            author: { id: 999 }, // different from GITLAB_USER_ID=123
          },
        ])
      }
      return okJson([])
    })

    const result = await fetch()
    expect(result).not.toBeNull()
    expect(result.items[0].type).toBe('mr_reviewed')
    expect(result.items[0].title).toBe('!7: Colleague feature')
  })

  it('skips reviewed MRs authored by the same user (self-review)', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('merge_requests?reviewer_id')) {
        return okJson([
          {
            iid: 10,
            title: 'Own MR',
            web_url: 'https://x.com',
            state: 'opened',
            updated_at: new Date().toISOString(),
            author: { id: 123 }, // same as GITLAB_USER_ID
          },
        ])
      }
      return okJson([])
    })

    expect(await fetch()).toBeNull()
  })

  it('maps push events to commit type', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('action=pushed')) {
        return okJson([
          {
            push_data: { ref: 'main', commit_count: 2 },
            project_id: 55,
            created_at: new Date().toISOString(),
          },
        ])
      }
      return okJson([])
    })

    const result = await fetch()
    expect(result).not.toBeNull()
    expect(result.items[0].type).toBe('commit')
    expect(result.items[0].title).toBe('Pushed 2 commits to main')
  })

  it('uses singular "commit" in push event title when count is 1', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('action=pushed')) {
        return okJson([
          {
            push_data: { ref: 'feature', commit_count: 1 },
            project_id: 1,
            created_at: new Date().toISOString(),
          },
        ])
      }
      return okJson([])
    })

    const result = await fetch()
    expect(result.items[0].title).toBe('Pushed 1 commit to feature')
  })

  it('maps comment events to comment type', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('action=commented')) {
        return okJson([
          {
            note: { noteable_type: 'MergeRequest', body: 'Looks good' },
            created_at: new Date().toISOString(),
          },
        ])
      }
      return okJson([])
    })

    const result = await fetch()
    expect(result).not.toBeNull()
    expect(result.items[0].type).toBe('comment')
  })

  it('fetchedAt is a Date instance', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('merge_requests?author_id')) {
        return okJson([
          {
            iid: 1,
            title: 'Test',
            web_url: 'https://x.com',
            state: 'opened',
            created_at: new Date().toISOString(),
            author: { id: 999 },
          },
        ])
      }
      return okJson([])
    })

    const result = await fetch()
    expect(result.fetchedAt).toBeInstanceOf(Date)
  })

  it('continues fetching other types when one API call fails', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('merge_requests?author_id')) {
        return Promise.resolve({ ok: false, status: 500 })
      }
      if (url.includes('action=pushed')) {
        return okJson([
          {
            push_data: { ref: 'main', commit_count: 1 },
            project_id: 1,
            created_at: new Date().toISOString(),
          },
        ])
      }
      return okJson([])
    })

    const result = await fetch()
    expect(result).not.toBeNull()
    expect(result.items.some((i) => i.type === 'commit')).toBe(true)
  })
})
