/**
 * Converts an array of SourceResults into a compact plain-text activity block.
 * Target: ~1000 tokens max.
 *
 * @param {import('./types.js').SourceResult[]} results
 * @returns {string}
 */
export function summarize(results) {
  const sections = []

  for (const result of results) {
    switch (result.source) {
      case 'GitLab':
        sections.push(summarizeGitLab(result))
        break
      case 'Jira':
        sections.push(summarizeJira(result))
        break
      case 'Slack':
        sections.push(summarizeSlack(result))
        break
      case 'Gmail':
        sections.push(summarizeGmail(result))
        break
      case 'Google Calendar':
        sections.push(summarizeGoogleCalendar(result))
        break
      default:
        sections.push(summarizeGeneric(result))
    }
  }

  return sections.filter(Boolean).join('\n\n')
}

function summarizeGitLab(result) {
  const { items } = result
  const lines = ['### GitLab']

  const byType = groupBy(items, (i) => i.type)

  if (byType.mr_opened?.length) {
    lines.push('**MRs opened/updated:**')
    for (const item of byType.mr_opened) {
      lines.push(`- ${formatMRItem(item)}`)
    }
  }

  if (byType.mr_reviewed?.length) {
    lines.push('**MRs reviewed:**')
    for (const item of byType.mr_reviewed) {
      lines.push(`- ${formatMRItem(item)}`)
    }
  }

  if (byType.commit?.length) {
    const commits = byType.commit
    if (commits.length > 5) {
      // Collapse to count summary grouped by branch reference
      const total = commits.reduce((sum, c) => {
        const match = c.title.match(/Pushed (\d+) commit/)
        return sum + (match ? parseInt(match[1]) : 1)
      }, 0)
      lines.push(`**Commits:** ${total} commits pushed across ${commits.length} push events`)
    } else {
      lines.push('**Commits:**')
      for (const item of commits) {
        lines.push(`- ${item.title}`)
      }
    }
  }

  if (byType.comment?.length) {
    lines.push(`**Code review:** left ${byType.comment.length} comment${byType.comment.length !== 1 ? 's' : ''}`)
  }

  return lines.length > 1 ? lines.join('\n') : ''
}

function summarizeJira(result) {
  const { items } = result
  if (!items.length) return ''
  const lines = ['### Jira']
  for (const item of items) {
    lines.push(`- ${item.title}${item.url ? ` (${item.url})` : ''}`)
  }
  return lines.join('\n')
}

function summarizeSlack(result) {
  const { items } = result
  if (!items.length) return ''

  const lines = ['### Slack']
  const byChannel = groupBy(items, (i) => i.detail ?? 'unknown')

  for (const [channel, msgs] of Object.entries(byChannel)) {
    lines.push(`**${channel}:**`)
    for (const msg of msgs) {
      lines.push(`- ${msg.title}`)
    }
  }

  return lines.join('\n')
}

function summarizeGmail(result) {
  const { items } = result
  if (!items.length) return ''
  const lines = ['### Gmail']
  for (const item of items) {
    lines.push(`- ${item.title}`)
  }
  return lines.join('\n')
}

function formatMRItem(item) {
  const colonIdx = item.title.indexOf(': ')
  if (colonIdx === -1 || !item.url) return item.title
  const id = item.title.slice(0, colonIdx)
  const title = item.title.slice(colonIdx + 2)
  return `[${id}](${item.url}): ${title}`
}

function summarizeGoogleCalendar(result) {
  const { items } = result
  if (!items.length) return ''

  const past = items.filter((i) => i.type === 'event_past')
  const upcoming = items.filter((i) => i.type === 'event_upcoming')

  const lines = ['### Google Calendar']

  if (past.length) {
    lines.push('**Yesterday:**')
    for (const item of past) {
      lines.push(`- ${item.title}${item.detail ? ` [${item.detail}]` : ''}`)
    }
  }

  if (upcoming.length) {
    lines.push('**Today:**')
    for (const item of upcoming) {
      lines.push(`- ${item.title}${item.detail ? ` [${item.detail}]` : ''}`)
    }
  }

  return lines.length > 1 ? lines.join('\n') : ''
}

function summarizeGeneric(result) {
  const { items, source } = result
  if (!items.length) return ''
  const lines = [`### ${source}`]
  for (const item of items) {
    lines.push(`- ${item.title}`)
  }
  return lines.join('\n')
}

function groupBy(arr, keyFn) {
  const map = {}
  for (const item of arr) {
    const key = keyFn(item)
    if (!map[key]) map[key] = []
    map[key].push(item)
  }
  return map
}
