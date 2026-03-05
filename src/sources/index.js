import * as gitlab from './gitlab.js'
import * as jira from './jira.js'
import * as slack from './slack.js'
import * as gmail from './gmail.js'
import * as googleCalendar from './google-calendar.js'
import * as claudeHistory from './claude-history.js'

export const sources = [gitlab, jira, slack, gmail, googleCalendar, claudeHistory]
