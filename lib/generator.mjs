/**
 * Generator — Builds working skill files from suggestions.
 *
 * Each skill is a markdown file with YAML frontmatter that Claude Code,
 * Codex, or Gemini CLI can execute as a slash command.
 *
 * Skills MUST contain runnable commands — not outlines or TODOs.
 * If we can't produce a working implementation, we don't generate it.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

// Only generate skills we have real implementations for.
// No templates, no outlines, no TODOs.
const IMPLEMENTATIONS = {
  "pr-dashboard": prDashboard,
  "meeting-auto-brief": meetingAutoBrief,
  "model-cost-monitor": modelCostMonitor,
  "credential-audit": credentialAudit,
  "slack-integration-health": slackHealth,
  "tab-audit": tabAudit,
  "video-cataloger": videoCataloger,
};

/**
 * Generate a skill file from a suggestion.
 * Returns null if we don't have a real implementation — we don't ship outlines.
 */
export function generateSkill(suggestion, options = {}) {
  const {
    outputDir = join(homedir(), ".claude/commands"),
    brainDir = null,
    dryRun = false,
  } = options;

  const impl = IMPLEMENTATIONS[suggestion.id];
  if (!impl) return null; // No real implementation = don't generate

  const content = impl(suggestion);
  const filename = `${suggestion.id}.md`;
  const outputPath = join(outputDir, filename);
  const brainPath = brainDir ? join(brainDir, filename) : null;

  if (dryRun) {
    return { path: outputPath, brainPath, content, installed: false };
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);

  if (brainPath) {
    mkdirSync(dirname(brainPath), { recursive: true });
    writeFileSync(brainPath, content);
  }

  return { path: outputPath, brainPath, content, installed: true };
}

/**
 * List which suggestion IDs have real implementations.
 */
export function listImplementable() {
  return Object.keys(IMPLEMENTATIONS);
}

// ─── Working implementations ────────────────────────────────────

function prDashboard(s) {
  return `---
name: pr-dashboard
description: "Morning summary of open PRs, review requests, and CI status"
---

# PR Dashboard

Run these commands to get the current state across all repos:

\`\`\`bash
echo "# PR Dashboard — $(date '+%Y-%m-%d %H:%M')"
echo ""

for repo in Scottpedia0/brain Scottpedia0/relay Scottpedia0/skill-builder go2impact/Town-Hall; do
  echo "## $repo"
  prs=$(gh pr list -R "$repo" --state open --json number,title,author,createdAt,statusCheckRollup --limit 10 2>/dev/null)
  if [ -z "$prs" ] || [ "$prs" = "[]" ]; then
    echo "  No open PRs"
  else
    echo "$prs" | python3 -c "
import json, sys
from datetime import datetime
prs = json.load(sys.stdin)
for pr in prs:
    age = (datetime.now() - datetime.fromisoformat(pr['createdAt'].replace('Z','+00:00').replace('+00:00',''))).days
    author = pr.get('author',{}).get('login','?')
    checks = pr.get('statusCheckRollup') or []
    status = 'pending'
    if checks:
        states = [c.get('conclusion','') for c in checks]
        if all(s == 'SUCCESS' for s in states): status = '✅'
        elif any(s == 'FAILURE' for s in states): status = '❌'
        else: status = '⏳'
    print(f'  #{pr[\"number\"]} {pr[\"title\"][:50]} | {author} | {age}d old | CI: {status}')
"
  fi
  echo ""
done
\`\`\`

Present results as a table. Flag any PRs older than 3 days or with failing CI.
`;
}

function meetingAutoBrief(s) {
  return `---
name: meeting-auto-brief
description: "Generate pre-meeting context brief before Google Meet calls"
---

# Meeting Auto-Brief

## Step 1: Get next meeting from Google Calendar

Use the gcal MCP to find the next upcoming meeting:

\`\`\`
Use gcal_list_events to get events in the next 2 hours.
Extract: title, attendees (names + emails), meeting link, description.
\`\`\`

## Step 2: Look up attendees

For each attendee, run these in parallel:

\`\`\`bash
# Check brain profiles
for name in <attendee_names>; do
  cat ~/brain/profiles/people/$(echo "$name" | tr ' ' '-' | tr '[:upper:]' '[:lower:]').md 2>/dev/null
done
\`\`\`

\`\`\`bash
# Search Memory Engine for recent interactions
curl -s "http://3.137.184.167:3100/v1/memories/search" \\
  -H "Authorization: Bearer $(grep MEMORY_ENGINE_KEY ~/.access-moran-bot.env | cut -d= -f2)" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "<attendee name> <company>", "limit": 5}' | python3 -c "
import json, sys
data = json.load(sys.stdin)
for m in data.get('memories', []):
    print(f'  - {m.get(\"created_at\",\"?\")[:10]}: {m.get(\"raw_content\",\"\")[:120]}')
"
\`\`\`

\`\`\`bash
# Check GitHub for related issues
gh issue list -R Scottpedia0/brain --search "<attendee name or company>" --limit 5
\`\`\`

## Step 3: Build the brief

Output format (scannable in 30 seconds):

\`\`\`
## [Meeting Title] — [Time]
### Attendees
- **Name** — role, company, last interaction date
  - Recent context: [1-2 bullet points from Memory Engine]
  - Open items: [relevant GitHub issues]

### Talking Points
- [derived from open issues + recent memory hits]

### Watch Out For
- [any stale commitments, overdue follow-ups]
\`\`\`
`;
}

function modelCostMonitor(s) {
  return `---
name: model-cost-monitor
description: "Check daily model API spend across OpenRouter, Anthropic, OpenAI"
---

# Model Cost Monitor

## OpenRouter spend

\`\`\`bash
# Get OpenRouter credits/usage
curl -s "https://openrouter.ai/api/v1/auth/key" \\
  -H "Authorization: Bearer $(grep OPENROUTER_API_KEY ~/.access-moran-bot.env | cut -d= -f2)" | python3 -c "
import json, sys
data = json.load(sys.stdin).get('data', {})
usage = data.get('usage', 0)
limit = data.get('limit', 0)
print(f'OpenRouter: \${usage:.2f} used' + (f' / \${limit:.2f} limit' if limit else ' (no limit)'))
"
\`\`\`

## Anthropic usage

\`\`\`bash
# Check Anthropic usage via API (if available)
# Note: Anthropic doesn't have a public usage API yet
# Fallback: check the usage page manually
echo "Anthropic: Check https://console.anthropic.com/settings/usage"
\`\`\`

## Summary

Present as:
\`\`\`
| Provider    | Today | This Week | Alert |
|-------------|-------|-----------|-------|
| OpenRouter  | $X.XX | $XX.XX    | ✅/⚠️  |
| Anthropic   | —     | —         | check |
\`\`\`

Flag if any single day exceeds $50 or weekly exceeds $200.
`;
}

function credentialAudit(s) {
  return `---
name: credential-audit
description: "Audit API keys and credentials — test auth, flag expiring or unused"
---

# Credential Audit

## Step 1: Load credentials
\`\`\`bash
source ~/.access-moran-bot.env
\`\`\`

## Step 2: Test each key

Run these in parallel:

\`\`\`bash
# OpenRouter
curl -s -o /dev/null -w "OpenRouter: %{http_code}\\n" \\
  "https://openrouter.ai/api/v1/auth/key" \\
  -H "Authorization: Bearer $OPENROUTER_API_KEY"

# Anthropic
curl -s -o /dev/null -w "Anthropic: %{http_code}\\n" \\
  "https://api.anthropic.com/v1/messages" \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":1,"messages":[{"role":"user","content":"test"}]}'

# Slack bot token
curl -s "https://slack.com/api/auth.test" \\
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'Slack: {\"ok\" if d.get(\"ok\") else \"FAILED - \" + d.get(\"error\",\"unknown\")}')"

# Memory Engine
curl -s -o /dev/null -w "Memory Engine: %{http_code}\\n" \\
  "http://3.137.184.167:3100/v1/memories/search" \\
  -H "Authorization: Bearer $MEMORY_ENGINE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "test", "limit": 1}'

# GitHub CLI
gh auth status 2>&1 | head -3
\`\`\`

## Step 3: Cross-reference with activity

\`\`\`bash
# Which services were actually used in the last 30 days?
sqlite3 ~/Library/Application\\ Support/Cowork.ai\\ Alpha/database/cowork.db \\
  "SELECT DISTINCT window_title FROM activity_sessions
   WHERE started_at >= datetime('now', '-30 days')
   AND (window_title LIKE '%API%' OR window_title LIKE '%dashboard%' OR window_title LIKE '%console%')
   ORDER BY window_title" 2>/dev/null
\`\`\`

## Output

| Service        | Auth  | Last Used | Action     |
|----------------|-------|-----------|------------|
| OpenRouter     | ✅/❌  | X days    | —/rotate   |
| Anthropic      | ✅/❌  | X days    | —/rotate   |
| Slack          | ✅/❌  | X days    | —/rotate   |
| Memory Engine  | ✅/❌  | X days    | —/rotate   |
| GitHub         | ✅/❌  | X days    | —/rotate   |
`;
}

function slackHealth(s) {
  return `---
name: slack-integration-health
description: "Test Slack bot connectivity, check rate limits, verify integrations"
---

# Slack Integration Health

\`\`\`bash
# 1. Test bot auth
echo "=== Bot Auth ==="
curl -s "https://slack.com/api/auth.test" \\
  -H "Authorization: Bearer $(grep SLACK_BOT_TOKEN ~/.access-moran-bot.env | cut -d= -f2)" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if d.get('ok'):
    print(f'  Bot: {d[\"user\"]} in team {d[\"team\"]} ✅')
else:
    print(f'  Bot auth FAILED: {d.get(\"error\")} ❌')
"

# 2. Check recent message delivery
echo "=== Recent Messages ==="
curl -s "https://slack.com/api/conversations.history?channel=C0AKZSTFGNA&limit=3" \\
  -H "Authorization: Bearer $(grep SLACK_BOT_TOKEN ~/.access-moran-bot.env | cut -d= -f2)" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if d.get('ok'):
    for m in d.get('messages', [])[:3]:
        user = m.get('user', m.get('bot_id', '?'))
        text = m.get('text', '')[:80]
        print(f'  {user}: {text}')
else:
    print(f'  Channel read FAILED: {d.get(\"error\")} ❌')
"

# 3. Rate limit check (from response headers)
echo "=== Rate Limits ==="
curl -sI "https://slack.com/api/auth.test" \\
  -H "Authorization: Bearer $(grep SLACK_BOT_TOKEN ~/.access-moran-bot.env | cut -d= -f2)" | grep -i "x-ratelimit"
\`\`\`

Report: healthy / degraded / down for each check.
`;
}

function tabAudit(s) {
  return `---
name: tab-audit
description: "List open Chrome tabs, flag stale ones, suggest close or bookmark"
---

# Tab Audit

## Step 1: Get open tabs via Chrome DevTools MCP

Use the \`list_pages\` tool from Chrome DevTools MCP to get all open tabs.

## Step 2: Cross-reference with activity data

\`\`\`bash
# Find Chrome URLs from last 24h with time spent
sqlite3 ~/Library/Application\\ Support/Cowork.ai\\ Alpha/database/cowork.db "
  SELECT browser_url,
         window_title,
         COUNT(*) as sessions,
         SUM(duration_ms)/1000/60 as minutes,
         MAX(started_at) as last_active
  FROM activity_sessions
  WHERE app_name = 'Google Chrome'
    AND browser_url IS NOT NULL
    AND started_at >= datetime('now', '-24 hours')
  GROUP BY browser_url
  ORDER BY last_active DESC
  LIMIT 30
" 2>/dev/null
\`\`\`

## Step 3: Identify stale tabs

Compare open tabs against activity data. Flag any tab where:
- No activity in the last 2 hours
- Less than 1 minute total time today
- Duplicate domains (multiple tabs on same site)

## Step 4: Present recommendations

For each stale tab:
- **Close** — if it was a one-time lookup (Stack Overflow, docs page already read)
- **Bookmark** — if it's reference material you'll need again
- **Keep** — if it's an active work context (GitHub PR, Slack thread)

Format: table with URL, title, last active, total time, recommendation.
`;
}

function videoCataloger(s) {
  return `---
name: video-cataloger
description: "Index local video/screen recordings by date, size, and meeting context"
---

# Video Cataloger

## Step 1: Find all recordings

\`\`\`bash
echo "# Video Index — $(date '+%Y-%m-%d')"
echo ""
echo "| File | Size | Date | Duration |"
echo "|------|------|------|----------|"

find ~/Movies ~/Desktop ~/Downloads -maxdepth 3 \\
  \\( -name "*.mov" -o -name "*.mp4" -o -name "*.m4v" -o -name "*.webm" \\) \\
  -mtime -30 2>/dev/null | while read f; do
  size=$(du -h "$f" 2>/dev/null | cut -f1)
  date=$(stat -f "%Sm" -t "%Y-%m-%d" "$f" 2>/dev/null)
  name=$(basename "$f")
  # Try to get duration via ffprobe if available
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" 2>/dev/null | python3 -c "
import sys
try:
    s=float(sys.stdin.read().strip())
    m,s=divmod(int(s),60)
    h,m=divmod(m,60)
    print(f'{h}:{m:02d}:{s:02d}' if h else f'{m}:{s:02d}')
except: print('?')
" 2>/dev/null)
  echo "| $name | $size | $date | $dur |"
done
\`\`\`

## Step 2: Match to calendar

Cross-reference file dates with Google Calendar events to identify which meeting each recording belongs to. Use gcal MCP \`gcal_list_events\` for the relevant dates.

## Step 3: Flag large files

Flag any recordings over 500MB that are older than 7 days — candidate for archival or deletion.
`;
}
