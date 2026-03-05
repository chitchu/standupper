import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// vi.hoisted ensures these are available inside the vi.mock factory (which is hoisted)
const { mockGenerateContent, mockGetGenerativeModel, mockGoogleGenerativeAI } = vi.hoisted(() => {
  const mockGenerateContent = vi.fn()
  const mockGetGenerativeModel = vi.fn(() => ({ generateContent: mockGenerateContent }))
  const mockGoogleGenerativeAI = vi.fn(() => ({ getGenerativeModel: mockGetGenerativeModel }))
  return { mockGenerateContent, mockGetGenerativeModel, mockGoogleGenerativeAI }
})

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: mockGoogleGenerativeAI,
}))

import { generateStandup } from './llm.js'

describe('generateStandup', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGoogleGenerativeAI.mockImplementation(() => ({ getGenerativeModel: mockGetGenerativeModel }))
    mockGetGenerativeModel.mockImplementation(() => ({ generateContent: mockGenerateContent }))
    process.env.GEMINI_API_KEY = 'test-api-key'
    delete process.env.GEMINI_MODEL
  })

  afterEach(() => {
    delete process.env.GEMINI_API_KEY
    delete process.env.GEMINI_MODEL
  })

  it('throws when GEMINI_API_KEY is not set', async () => {
    delete process.env.GEMINI_API_KEY
    await expect(generateStandup('summary')).rejects.toThrow('GEMINI_API_KEY is not set')
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })

  it('returns response text', async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => 'standup output' } })
    const result = await generateStandup('my activity')
    expect(result).toBe('standup output')
  })

  it('passes summary in the user message', async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => '' } })
    await generateStandup('specific activity summary')
    const [userMessage] = mockGenerateContent.mock.calls[0]
    expect(userMessage).toContain('specific activity summary')
  })

  it('uses default model when GEMINI_MODEL is not set', async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => '' } })
    await generateStandup('activity')
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.5-flash-lite' })
    )
  })

  it('uses GEMINI_MODEL env var when set', async () => {
    process.env.GEMINI_MODEL = 'gemini-pro'
    mockGenerateContent.mockResolvedValue({ response: { text: () => '' } })
    await generateStandup('activity')
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-pro' })
    )
  })

  it('retries on 503 and succeeds on third attempt', async () => {
    vi.useFakeTimers()
    mockGenerateContent
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ response: { text: () => 'success after retries' } })

    const promise = generateStandup('activity')
    await vi.runAllTimersAsync()
    const result = await promise
    vi.useRealTimers()

    expect(result).toBe('success after retries')
    expect(mockGenerateContent).toHaveBeenCalledTimes(3)
  })

  it('falls back to next model on 429', async () => {
    process.env.GEMINI_MODEL = 'model-a,model-b'
    mockGenerateContent
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ response: { text: () => 'ok after 429' } })

    const result = await generateStandup('activity')

    expect(result).toBe('ok after 429')
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: 'model-a' }))
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: 'model-b' }))
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  })

  it('does not retry on 400 and throws immediately', async () => {
    const err = { status: 400, message: 'Bad request' }
    mockGenerateContent.mockRejectedValue(err)
    await expect(generateStandup('activity')).rejects.toEqual(err)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it('throws after exhausting all 3 retries', async () => {
    vi.useFakeTimers()
    const err = { status: 503 }
    mockGenerateContent.mockRejectedValue(err)

    // Attach the rejects handler immediately so the rejection is never "unhandled"
    const expectRejects = expect(generateStandup('activity')).rejects.toEqual(err)
    await vi.runAllTimersAsync()
    await expectRejects
    vi.useRealTimers()

    expect(mockGenerateContent).toHaveBeenCalledTimes(3)
  })
})
