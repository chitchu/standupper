import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// vi.hoisted ensures these are available inside the vi.mock factory (which is hoisted)
const { mockGetAccessToken, mockSetCredentials, mockEventsList, OAuth2Mock } = vi.hoisted(() => {
  const mockGetAccessToken = vi.fn()
  const mockSetCredentials = vi.fn()
  const mockEventsList = vi.fn()
  const OAuth2Mock = vi.fn()
  return { mockGetAccessToken, mockSetCredentials, mockEventsList, OAuth2Mock }
})

vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: OAuth2Mock },
    calendar: vi.fn(() => ({ events: { list: mockEventsList } })),
  },
}))

import { fetch } from './google-calendar.js'

beforeEach(() => {
  vi.resetAllMocks()
  // Re-add OAuth2 implementation after resetAllMocks clears it
  OAuth2Mock.mockImplementation(() => ({
    setCredentials: mockSetCredentials,
    getAccessToken: mockGetAccessToken,
  }))
  process.env.GCAL_CLIENT_ID = 'client-id'
  process.env.GCAL_CLIENT_SECRET = 'client-secret'
  process.env.GCAL_REFRESH_TOKEN = 'refresh-token'
  mockGetAccessToken.mockResolvedValue({ token: 'access-token' })
  mockEventsList.mockResolvedValue({ data: { items: [] } })
})

afterEach(() => {
  delete process.env.GCAL_CLIENT_ID
  delete process.env.GCAL_CLIENT_SECRET
  delete process.env.GCAL_REFRESH_TOKEN
})

/** Build a minimal calendar event object */
const makeEvent = (overrides = {}) => ({
  summary: 'Test meeting',
  start: { dateTime: new Date().toISOString() },
  end: { dateTime: new Date().toISOString() },
  attendees: [],
  ...overrides,
})

describe('google-calendar fetch', () => {
  it('returns null when GCAL_CLIENT_ID is missing', async () => {
    delete process.env.GCAL_CLIENT_ID
    expect(await fetch()).toBeNull()
    expect(mockGetAccessToken).not.toHaveBeenCalled()
  })

  it('returns null when GCAL_CLIENT_SECRET is missing', async () => {
    delete process.env.GCAL_CLIENT_SECRET
    expect(await fetch()).toBeNull()
  })

  it('returns null when GCAL_REFRESH_TOKEN is missing', async () => {
    delete process.env.GCAL_REFRESH_TOKEN
    expect(await fetch()).toBeNull()
  })

  it('returns null on auth failure', async () => {
    mockGetAccessToken.mockRejectedValue(new Error('invalid_grant'))
    expect(await fetch()).toBeNull()
  })

  it('returns null when no events found', async () => {
    mockEventsList.mockResolvedValue({ data: { items: [] } })
    expect(await fetch()).toBeNull()
  })

  it('skips declined events', async () => {
    mockEventsList.mockResolvedValue({
      data: {
        items: [makeEvent({ attendees: [{ self: true, responseStatus: 'declined' }] })],
      },
    })
    expect(await fetch()).toBeNull()
  })

  it('skips all-day events (no dateTime)', async () => {
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          {
            summary: 'All-day event',
            start: { date: '2026-02-27' },
            end: { date: '2026-02-27' },
            attendees: [],
          },
        ],
      },
    })
    expect(await fetch()).toBeNull()
  })

  it('assigns event_past type for first call (yesterday) and event_upcoming for second (today)', async () => {
    const dt = new Date().toISOString()
    const event = makeEvent({ summary: 'Meeting', start: { dateTime: dt }, end: { dateTime: dt } })

    // First call = yesterdayStart/End = event_past, second = todayStart/End = event_upcoming
    mockEventsList
      .mockResolvedValueOnce({ data: { items: [event] } })
      .mockResolvedValueOnce({ data: { items: [event] } })

    const result = await fetch()
    expect(result).not.toBeNull()
    const types = result.items.map((i) => i.type)
    expect(types).toContain('event_past')
    expect(types).toContain('event_upcoming')
  })

  it('includes accepted events', async () => {
    mockEventsList
      .mockResolvedValueOnce({ data: { items: [] } })
      .mockResolvedValueOnce({
        data: {
          items: [
            makeEvent({
              summary: 'Sprint review',
              attendees: [{ self: true, responseStatus: 'accepted' }],
            }),
          ],
        },
      })

    const result = await fetch()
    expect(result).not.toBeNull()
    expect(result.items[0].title).toBe('Sprint review')
    expect(result.items[0].type).toBe('event_upcoming')
  })

  it('includes events with no attendees list', async () => {
    mockEventsList
      .mockResolvedValueOnce({ data: { items: [] } })
      .mockResolvedValueOnce({
        data: { items: [makeEvent({ summary: 'Solo block', attendees: undefined })] },
      })

    const result = await fetch()
    expect(result).not.toBeNull()
    expect(result.items[0].title).toBe('Solo block')
  })

  it('sets fetchedAt as a Date on the result', async () => {
    const dt = new Date().toISOString()
    mockEventsList.mockResolvedValueOnce({
      data: { items: [makeEvent({ start: { dateTime: dt }, end: { dateTime: dt } })] },
    })

    const result = await fetch()
    expect(result.fetchedAt).toBeInstanceOf(Date)
  })
})
