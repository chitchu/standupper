import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const mockMessagesList = vi.fn()
const mockMessagesGet = vi.fn()

vi.mock('googleapis', () => ({
  google: {
    gmail: vi.fn(() => ({
      users: { messages: { list: mockMessagesList, get: mockMessagesGet } },
    })),
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
        getAccessToken: vi.fn().mockResolvedValue({ token: 'token' }),
      })),
    },
  },
}))

vi.mock('../gmail-auth.js', () => ({
  getAuthClient: vi.fn(),
}))

import { getAuthClient } from '../gmail-auth.js'
import { fetch } from './gmail.js'

beforeEach(() => {
  vi.resetAllMocks()
  process.env.GMAIL_CLIENT_ID = 'client-id'
  process.env.GMAIL_CLIENT_SECRET = 'client-secret'
  process.env.GMAIL_REFRESH_TOKEN = 'refresh-token'
})

afterEach(() => {
  delete process.env.GMAIL_CLIENT_ID
  delete process.env.GMAIL_CLIENT_SECRET
  delete process.env.GMAIL_REFRESH_TOKEN
})

describe('gmail fetch', () => {
  it('returns null when GMAIL_CLIENT_ID is missing', async () => {
    delete process.env.GMAIL_CLIENT_ID
    expect(await fetch()).toBeNull()
    expect(getAuthClient).not.toHaveBeenCalled()
  })

  it('returns null when GMAIL_CLIENT_SECRET is missing', async () => {
    delete process.env.GMAIL_CLIENT_SECRET
    expect(await fetch()).toBeNull()
  })

  it('returns null when GMAIL_REFRESH_TOKEN is missing', async () => {
    delete process.env.GMAIL_REFRESH_TOKEN
    expect(await fetch()).toBeNull()
  })

  it('returns null on auth failure', async () => {
    getAuthClient.mockRejectedValue(new Error('invalid_grant'))
    expect(await fetch()).toBeNull()
  })

  it('returns null when no messages are found', async () => {
    getAuthClient.mockResolvedValue({})
    mockMessagesList.mockResolvedValue({ data: { messages: [] } })
    expect(await fetch()).toBeNull()
  })

  it('maps sent message with stripped Re: prefix and recipient', async () => {
    getAuthClient.mockResolvedValue({})
    mockMessagesList.mockImplementation(({ q }) => {
      if (q.startsWith('in:sent')) {
        return Promise.resolve({ data: { messages: [{ id: 'msg-sent-1' }] } })
      }
      return Promise.resolve({ data: { messages: [] } })
    })
    mockMessagesGet.mockResolvedValue({
      data: {
        internalDate: '1700000000000',
        payload: {
          headers: [
            { name: 'Subject', value: 'Re: Project update' },
            { name: 'To', value: 'boss@example.com' },
          ],
        },
      },
    })

    const result = await fetch()
    expect(result).not.toBeNull()
    const sentItem = result.items.find((i) => i.type === 'email_sent')
    expect(sentItem).toBeDefined()
    expect(sentItem.title).toContain('Project update')
    expect(sentItem.title).not.toContain('Re:')
    expect(sentItem.title).toContain('boss@example.com')
  })

  it('maps received message with stripped Fwd: prefix and sender', async () => {
    getAuthClient.mockResolvedValue({})
    mockMessagesList.mockImplementation(({ q }) => {
      if (q.startsWith('in:inbox')) {
        return Promise.resolve({ data: { messages: [{ id: 'msg-recv-1' }] } })
      }
      return Promise.resolve({ data: { messages: [] } })
    })
    mockMessagesGet.mockResolvedValue({
      data: {
        internalDate: '1700000000000',
        payload: {
          headers: [
            { name: 'Subject', value: 'Fwd: Team announcement' },
            { name: 'From', value: 'sender@example.com' },
          ],
        },
      },
    })

    const result = await fetch()
    expect(result).not.toBeNull()
    const recvItem = result.items.find((i) => i.type === 'email_received')
    expect(recvItem).toBeDefined()
    expect(recvItem.title).toContain('Team announcement')
    expect(recvItem.title).not.toContain('Fwd:')
  })

  it('skips messages with List-Unsubscribe header (newsletters)', async () => {
    getAuthClient.mockResolvedValue({})
    mockMessagesList.mockResolvedValue({ data: { messages: [{ id: 'newsletter-1' }] } })
    mockMessagesGet.mockResolvedValue({
      data: {
        internalDate: '1700000000000',
        payload: {
          headers: [
            { name: 'Subject', value: 'Weekly digest' },
            { name: 'List-Unsubscribe', value: '<mailto:unsub@list.com>' },
          ],
        },
      },
    })

    expect(await fetch()).toBeNull()
  })

  it('caps results at 10 items', async () => {
    getAuthClient.mockResolvedValue({})
    // Return 6 sent messages
    mockMessagesList.mockImplementation(({ q }) => {
      const ids = Array.from({ length: 6 }, (_, i) => ({ id: `msg-${i}` }))
      return Promise.resolve({ data: { messages: ids } })
    })
    mockMessagesGet.mockResolvedValue({
      data: {
        internalDate: '1700000000000',
        payload: {
          headers: [
            { name: 'Subject', value: 'Test subject' },
            { name: 'To', value: 'to@example.com' },
            { name: 'From', value: 'from@example.com' },
          ],
        },
      },
    })

    const result = await fetch()
    expect(result).not.toBeNull()
    expect(result.items.length).toBeLessThanOrEqual(10)
  })
})
