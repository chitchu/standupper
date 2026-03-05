import { describe, it, expect } from 'vitest'
import { summarize } from './summarize.js'

describe('summarize', () => {
  it('returns empty string for empty results array', () => {
    expect(summarize([])).toBe('')
  })

  describe('GitLab', () => {
    it('renders mr_opened items with link format', () => {
      const result = {
        source: 'GitLab',
        items: [{ type: 'mr_opened', title: '!42: My feature', url: 'https://gitlab.com/mr/42' }],
        fetchedAt: new Date(),
      }
      const out = summarize([result])
      expect(out).toContain('MRs opened/updated')
      expect(out).toContain('[!42](https://gitlab.com/mr/42): My feature')
    })

    it('renders mr_reviewed items', () => {
      const result = {
        source: 'GitLab',
        items: [{ type: 'mr_reviewed', title: '!10: Someone else MR', url: 'https://gitlab.com/mr/10' }],
        fetchedAt: new Date(),
      }
      const out = summarize([result])
      expect(out).toContain('MRs reviewed')
      expect(out).toContain('[!10](https://gitlab.com/mr/10): Someone else MR')
    })

    it('collapses commits when more than 5 push events', () => {
      const commits = Array.from({ length: 6 }, (_, i) => ({
        type: 'commit',
        title: `Pushed 3 commits to branch-${i}`,
      }))
      const result = { source: 'GitLab', items: commits, fetchedAt: new Date() }
      const out = summarize([result])
      expect(out).toContain('18 commits pushed across 6 push events')
    })

    it('renders commits individually when 5 or fewer', () => {
      const commits = Array.from({ length: 3 }, (_, i) => ({
        type: 'commit',
        title: `Pushed 1 commit to branch-${i}`,
      }))
      const result = { source: 'GitLab', items: commits, fetchedAt: new Date() }
      const out = summarize([result])
      expect(out).toContain('- Pushed 1 commit to branch-0')
    })

    it('uses singular "comment" when count is 1', () => {
      const result = {
        source: 'GitLab',
        items: [{ type: 'comment', title: 'Commented on MergeRequest' }],
        fetchedAt: new Date(),
      }
      const out = summarize([result])
      expect(out).toContain('left 1 comment')
      expect(out).not.toMatch(/left 1 comments/)
    })

    it('uses plural "comments" when count is more than 1', () => {
      const result = {
        source: 'GitLab',
        items: [
          { type: 'comment', title: 'Commented on MergeRequest' },
          { type: 'comment', title: 'Commented on MergeRequest' },
        ],
        fetchedAt: new Date(),
      }
      const out = summarize([result])
      expect(out).toContain('left 2 comments')
    })

    it('returns empty string when GitLab has no items', () => {
      const result = { source: 'GitLab', items: [], fetchedAt: new Date() }
      expect(summarize([result])).toBe('')
    })

    it('formats MR title without URL as plain text', () => {
      const result = {
        source: 'GitLab',
        items: [{ type: 'mr_opened', title: '!5: No url MR', url: undefined }],
        fetchedAt: new Date(),
      }
      const out = summarize([result])
      expect(out).toContain('!5: No url MR')
    })
  })

  describe('Jira', () => {
    it('renders issue with URL in parentheses', () => {
      const result = {
        source: 'Jira',
        items: [
          {
            type: 'issue',
            title: 'PROJ-123: Fix the bug [In Progress]',
            url: 'https://jira.example.com/browse/PROJ-123',
          },
        ],
        fetchedAt: new Date(),
      }
      const out = summarize([result])
      expect(out).toContain('PROJ-123: Fix the bug')
      expect(out).toContain('(https://jira.example.com/browse/PROJ-123)')
    })

    it('renders item without URL when url is absent', () => {
      const result = {
        source: 'Jira',
        items: [{ type: 'issue', title: 'PROJ-1: No url task' }],
        fetchedAt: new Date(),
      }
      const out = summarize([result])
      expect(out).toContain('PROJ-1: No url task')
      expect(out).not.toContain('(undefined)')
    })

    it('returns empty string when Jira has no items', () => {
      expect(summarize([{ source: 'Jira', items: [], fetchedAt: new Date() }])).toBe('')
    })
  })

  describe('Slack', () => {
    it('groups messages by channel', () => {
      const result = {
        source: 'Slack',
        items: [
          { type: 'message_sent', title: 'Hello team', detail: '#general' },
          { type: 'message_sent', title: 'PR ready', detail: '#engineering' },
          { type: 'message_sent', title: 'Another msg', detail: '#general' },
        ],
        fetchedAt: new Date(),
      }
      const out = summarize([result])
      expect(out).toContain('**#general:**')
      expect(out).toContain('**#engineering:**')
      expect(out.indexOf('Hello team')).toBeGreaterThan(out.indexOf('#general'))
      expect(out.indexOf('Another msg')).toBeGreaterThan(out.indexOf('#general'))
    })

    it('returns empty string when Slack has no items', () => {
      expect(summarize([{ source: 'Slack', items: [], fetchedAt: new Date() }])).toBe('')
    })
  })

  describe('Google Calendar', () => {
    it('renders past events under Yesterday section', () => {
      const result = {
        source: 'Google Calendar',
        items: [{ type: 'event_past', title: 'Standup', detail: '09:00–09:30' }],
        fetchedAt: new Date(),
      }
      const out = summarize([result])
      expect(out).toContain('**Yesterday:**')
      expect(out).toContain('- Standup [09:00–09:30]')
    })

    it('renders upcoming events under Today section', () => {
      const result = {
        source: 'Google Calendar',
        items: [{ type: 'event_upcoming', title: 'Sprint review', detail: '14:00–15:00' }],
        fetchedAt: new Date(),
      }
      const out = summarize([result])
      expect(out).toContain('**Today:**')
      expect(out).toContain('- Sprint review [14:00–15:00]')
    })

    it('renders event without detail when detail is absent', () => {
      const result = {
        source: 'Google Calendar',
        items: [{ type: 'event_upcoming', title: 'All hands', detail: undefined }],
        fetchedAt: new Date(),
      }
      const out = summarize([result])
      expect(out).toContain('- All hands')
      expect(out).not.toContain('[undefined]')
    })

    it('returns empty string when Calendar has no items', () => {
      expect(summarize([{ source: 'Google Calendar', items: [], fetchedAt: new Date() }])).toBe('')
    })
  })

  describe('generic fallback', () => {
    it('uses source name as heading', () => {
      const result = {
        source: 'CustomSource',
        items: [{ title: 'Did something' }],
        fetchedAt: new Date(),
      }
      const out = summarize([result])
      expect(out).toContain('### CustomSource')
      expect(out).toContain('- Did something')
    })

    it('returns empty string when generic source has no items', () => {
      expect(summarize([{ source: 'CustomSource', items: [], fetchedAt: new Date() }])).toBe('')
    })
  })

  it('joins multiple non-empty sources with double newline', () => {
    const results = [
      {
        source: 'Jira',
        items: [{ title: 'PROJ-1: Task', url: 'https://x.com' }],
        fetchedAt: new Date(),
      },
      {
        source: 'Slack',
        items: [{ type: 'message_sent', title: 'Hi', detail: '#dev' }],
        fetchedAt: new Date(),
      },
    ]
    const out = summarize(results)
    expect(out).toContain('### Jira')
    expect(out).toContain('### Slack')
    expect(out).toContain('\n\n')
  })

  it('filters out empty sections when joining', () => {
    const results = [
      { source: 'Jira', items: [], fetchedAt: new Date() },
      {
        source: 'Slack',
        items: [{ type: 'message_sent', title: 'Hi', detail: '#dev' }],
        fetchedAt: new Date(),
      },
    ]
    const out = summarize(results)
    expect(out).not.toContain('### Jira')
    expect(out.startsWith('### Slack')).toBe(true)
  })
})
