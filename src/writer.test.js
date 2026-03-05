import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

vi.mock('node:fs/promises')
vi.mock('node:fs')

import { writeEntry } from './writer.js'

beforeEach(() => {
  vi.resetAllMocks()
  writeFile.mockResolvedValue(undefined)
})

describe('writeEntry', () => {
  it('creates a new file when standup.md does not exist', async () => {
    existsSync.mockReturnValue(false)
    await writeEntry(new Date('2026-02-27'), 'My standup text')
    expect(writeFile).toHaveBeenCalledOnce()
    const [, content] = writeFile.mock.calls[0]
    expect(content).toContain('## 2026-02-27')
    expect(content).toContain('My standup text')
  })

  it('prepends before existing content', async () => {
    existsSync.mockReturnValue(true)
    readFile.mockResolvedValue('## 2026-02-26\n\nOld entry\n\n')
    await writeEntry(new Date('2026-02-27'), 'New entry')
    const [, content] = writeFile.mock.calls[0]
    expect(content.indexOf('## 2026-02-27')).toBeLessThan(content.indexOf('## 2026-02-26'))
    expect(content).toContain('Old entry')
  })

  it('trims whitespace from input text', async () => {
    existsSync.mockReturnValue(false)
    await writeEntry(new Date('2026-02-27'), '  padded text  ')
    const [, content] = writeFile.mock.calls[0]
    expect(content).toContain('padded text')
    expect(content).not.toContain('  padded text  ')
  })

  it('uses utf8 encoding', async () => {
    existsSync.mockReturnValue(false)
    await writeEntry(new Date('2026-02-27'), 'text')
    const encoding = writeFile.mock.calls[0][2]
    expect(encoding).toBe('utf8')
  })

  it('formats date as YYYY-MM-DD heading', async () => {
    existsSync.mockReturnValue(false)
    await writeEntry(new Date('2026-02-27T15:30:00.000Z'), 'entry')
    const [, content] = writeFile.mock.calls[0]
    expect(content).toMatch(/^## \d{4}-\d{2}-\d{2}/)
  })
})
