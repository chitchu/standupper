# standupper

Fetches the last 24 hours of activity from GitLab, Jira, Slack, and Gmail, then uses Gemini to draft a formatted standup entry appended to `standup.md`.

## Quick start

```bash
npm install
cp .env.example .env
# Fill in at least GEMINI_API_KEY and one source
npm run standup
```

## Credentials setup

### Gemini (required — the LLM that drafts your standup)

Two options:

**Option A — AI Studio (easiest, no GCP billing needed):**
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click **Get API key** → **Create API key**
3. Copy the key into `.env` as `GEMINI_API_KEY`

**Option B — GCP Console:**
1. [console.cloud.google.com](https://console.cloud.google.com) → select/create a project
2. APIs & Services → Enable APIs → search "Generative Language API" → Enable
3. APIs & Services → Credentials → Create Credentials → API Key
4. Copy into `.env` as `GEMINI_API_KEY`

Free tier: 1,500 requests/day for `gemini-2.0-flash` — more than enough for daily use.

---

### GitLab

1. GitLab → top-right avatar → **Edit profile** → **Access Tokens**
2. Create a token with the `read_api` scope
3. Copy to `.env`:
   ```
   GITLAB_TOKEN=glpat-xxxx
   GITLAB_URL=https://gitlab.com   # or your self-hosted URL
   ```
4. Find your user ID:
   ```bash
   curl -H "PRIVATE-TOKEN: <your-token>" https://gitlab.com/api/v4/user | grep '"id"'
   ```
5. Copy to `.env`:
   ```
   GITLAB_USER_ID=1234567
   ```

---

### Jira

1. Go to [id.atlassian.com](https://id.atlassian.com) → **Security** → **API tokens** → **Create API token**
2. Copy to `.env`:
   ```
   JIRA_BASE_URL=https://yourcompany.atlassian.net
   JIRA_EMAIL=you@yourcompany.com
   JIRA_API_TOKEN=ATATT3xFf...
   ```
3. Find your account ID in your Jira profile URL:
   - Go to Jira → click your avatar → **Profile**
   - The URL will be: `https://yourcompany.atlassian.net/jira/people/<ACCOUNT_ID>`
4. Copy to `.env`:
   ```
   JIRA_ACCOUNT_ID=5b10ac8d82e05b22cc7d4ef5
   ```

---

### Slack

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name it "standupper", pick your workspace
3. **OAuth & Permissions** → scroll to **User Token Scopes** → Add `search:read`
4. **Install to Workspace** → copy the **User OAuth Token** (starts with `xoxp-`)
5. Find your member ID: In Slack, click your name → **View profile** → **More (…)** → **Copy member ID**
6. Copy to `.env`:
   ```
   SLACK_USER_TOKEN=xoxp-xxxx
   SLACK_USER_ID=U0123ABCDEF
   ```

---

### Gmail (OAuth2)

Gmail requires a one-time OAuth2 flow to generate a refresh token.

**Step 1: Create OAuth2 credentials in GCP**

1. [console.cloud.google.com](https://console.cloud.google.com) → your project → APIs & Services → **Enable APIs**
2. Search "Gmail API" → Enable
3. APIs & Services → **Credentials** → **Create Credentials** → **OAuth 2.0 Client IDs**
4. Application type: **Web application**
5. Under **Authorized redirect URIs**, add: `http://localhost:3000/callback`
6. Copy the **Client ID** and **Client Secret** to `.env`:
   ```
   GMAIL_CLIENT_ID=xxxx.apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=GOCSPX-xxxx
   ```

**Step 2: Run the setup script**

```bash
npm run gmail-setup
```

This starts a local server, prints an authorization URL, and waits for you to approve access. After approval, it prints your refresh token:

```
GMAIL_REFRESH_TOKEN=1//0g...
```

Copy that line into your `.env`.

---

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Gemini API key |
| `GEMINI_MODEL` | No | Model name (default: `gemini-2.0-flash`) |
| `GITLAB_URL` | No | GitLab instance URL (default: `https://gitlab.com`) |
| `GITLAB_TOKEN` | For GitLab | Personal access token (`read_api`) |
| `GITLAB_USER_ID` | For GitLab | Your numeric GitLab user ID |
| `JIRA_BASE_URL` | For Jira | Your Jira instance URL |
| `JIRA_EMAIL` | For Jira | Your Atlassian account email |
| `JIRA_API_TOKEN` | For Jira | Atlassian API token |
| `JIRA_ACCOUNT_ID` | For Jira | Your Jira account ID |
| `SLACK_USER_TOKEN` | For Slack | User OAuth token (`xoxp-...`) |
| `SLACK_USER_ID` | For Slack | Your Slack member ID |
| `GMAIL_CLIENT_ID` | For Gmail | OAuth2 client ID |
| `GMAIL_CLIENT_SECRET` | For Gmail | OAuth2 client secret |
| `GMAIL_REFRESH_TOKEN` | For Gmail | Refresh token (from `npm run gmail-setup`) |

Sources without their required variables are automatically skipped — no separate enable/disable flag needed.

## Output

Each run prepends a dated entry to `standup.md`:

```markdown
## 2026-02-27

**Yesterday:** Merged MR !123 (auth service refactor), reviewed !124 (caching layer),
pushed 3 commits to feature/user-settings. Updated JIRA-456 to In Review.

**Today:** Continue work on JIRA-789 (API rate limiting), address review comments on !124.

**Blockers:** None.
```

## Claude conversation history

The Anthropic API does not have a public endpoint for conversation history as of February 2026. If this becomes available, the stub in `src/sources/claude-history.js` is where to add it.
