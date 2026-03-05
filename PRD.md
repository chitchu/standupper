Task: Build a daily standup generator script that aggregates my activity from multiple sources and drafts a standup using the Claude API.
Sources to aggregate (last 24h of activity):

GitLab — MRs opened/reviewed/merged, commits, comments
Jira — tickets moved, commented on, created
Slack — my own messages sent
Gmail — work-relevant emails sent/received
Claude chat history — via Anthropic API if accessible, otherwise skip

Output: Append a dated entry to standup.md in the same directory:
markdown## 2026-02-27

**Yesterday:** ...
**Today:** ...
**Blockers:** ...
Stack:

Node.js or Python (whichever has better SDK support for the integrations)
@anthropic-ai/sdk or anthropic Python SDK for the Claude call
API keys in .env, never hardcoded
Each source = separate module/function, easy to disable

Constraints:

If a source fails or returns nothing, skip it gracefully
Summarize raw activity before passing to Claude — don't dump raw API payloads into the prompt
Runnable manually: npm run standup or python standup.py

Deliverables:

Working script with stubs where API access isn't confirmed yet
.env.example with all required keys documented
Brief README covering auth setup for each service
