# skill-builder

> Analyze how you work. Build automations that actually run. One skill per day.

Reads your desktop activity data and generates working slash-command skills for AI coding agents — Claude Code, Codex, Cursor, or anything that reads markdown.

Not templates. Not outlines. **Real bash, real API calls, real SQL** — or it doesn't ship.

## Try It in 60 Seconds

```bash
git clone https://github.com/Scottpedia0/skill-builder.git
cd skill-builder
npm install

# Generate demo data (no Cowork.ai needed)
node scripts/generate-demo-db.mjs

# Point at the demo DB
node bin/cli.mjs init
# Edit ~/.skill-builder/config.json → set telemetryDb to "./demo/demo.db"

# See suggestions from the demo data
node bin/cli.mjs suggest

# Preview a real skill
node bin/cli.mjs implement pr-dashboard --dry-run
```

<details>
<summary>Example output</summary>

```
## Today's Skill Suggestion

**pr-dashboard** — Morning summary of open PRs, review requests, and CI status

- Signal: URL 'github.com': 245 visits, 51min
- Confidence: high
- Auto-implementable: yes ✅

Install it: skill-builder implement pr-dashboard
Preview first: skill-builder implement pr-dashboard --dry-run
```

The generated skill is a markdown file with runnable `gh` commands, JSON parsing, and CI status checks — installed directly to `~/.claude/commands/pr-dashboard.md`.
</details>

## How It Works

```
┌─────────────────────────────────────────────┐
│ Your activity data (SQLite)                 │
│  • App usage (VS Code 4hrs, Chrome 3hrs)    │
│  • URLs visited (GitHub 245x, Meet 500x)    │
│  • Context switches (VS Code → Chrome 800x) │
│  • Keystrokes ("sorry for delay" typed 5x)  │
└────────────────┬────────────────────────────┘
                 ↓
         ┌───────────────┐
         │   Analyzer    │  Reads patterns from telemetry
         └───────┬───────┘
                 ↓
         ┌───────────────┐
         │   Suggester   │  Ranks by confidence, one per day
         └───────┬───────┘
                 ↓
         ┌───────────────┐
         │   Generator   │  Builds runnable skill files
         └───────┬───────┘
                 ↓
  ~/.claude/commands/pr-dashboard.md  ← Ready to use
```

## Commands

```bash
skill-builder init              # Create config
skill-builder suggest           # Full ranked suggestion list
skill-builder daily             # One new suggestion per day
skill-builder implement <id>    # Build and install a skill
skill-builder list              # Show implementable skills
```

| Flag | Effect |
|------|--------|
| `--dry-run` | Preview skill without installing |
| `--days N` | Analysis window (default: 3) |

## Built-in Skills

7 skills with real, working implementations:

| Skill | What it does | Tools used |
|-------|-------------|------------|
| **pr-dashboard** | Morning PR/CI summary across repos | `gh` CLI, JSON parsing |
| **meeting-auto-brief** | Pre-meeting context from calendar + memory | Calendar MCP, curl, `gh` |
| **model-cost-monitor** | Track API spend (OpenRouter, Anthropic) | curl, API endpoints |
| **credential-audit** | Test all API keys, flag expired/unused | curl, SQLite, `gh` |
| **slack-integration-health** | Check bot auth, rate limits, delivery | Slack API |
| **tab-audit** | Find stale Chrome tabs, suggest actions | Chrome DevTools MCP, SQLite |
| **video-cataloger** | Index local recordings by date/meeting | `find`, `ffprobe`, Calendar MCP |

## Data Sources

**Currently supported:**
- [x] [Cowork.ai](https://cowork.ai) desktop telemetry (SQLite)
- [x] Demo/synthetic data for testing

**Coming:**
- [ ] macOS Screen Time (`/Library/Application Support/com.apple.ScreenTimeAgent/`)
- [ ] Browser history (Chrome, Arc, Firefox)
- [ ] Shell history (`~/.zsh_history`)
- [ ] Git commit patterns
- [ ] Calendar events
- [ ] Slack/Teams activity

The analyzer reads any SQLite database with `activity_sessions` and `keystroke_chunks` tables in the expected schema. See `demo/` for the table structure.

## Configuration

```bash
skill-builder init  # Creates ~/.skill-builder/config.json
```

```json
{
  "skillDir": "~/.claude/commands",
  "canonicalDir": null,
  "telemetryDb": null,
  "repos": ["your-org/your-repo"],
  "defaultDays": 3,
  "dataSources": ["telemetry"]
}
```

| Key | What it does |
|-----|-------------|
| `skillDir` | Where to install generated skills |
| `canonicalDir` | Optional second copy (shared team repo) |
| `telemetryDb` | Path to SQLite DB (auto-detected if Cowork.ai installed) |
| `repos` | GitHub repos for PR dashboard |
| `defaultDays` | How many days of data to analyze |

## Design Principles

1. **Runnable or nothing** — if we can't produce working commands, we don't generate it
2. **One skill, one job** — compose them, don't merge them
3. **Agent-agnostic** — markdown + YAML frontmatter works everywhere
4. **Data-driven** — suggestions from your actual behavior, not a generic catalog
5. **One per day** — daily drip, not a backlog dump

## Add Your Own Skills

```javascript
// lib/generator.mjs

const IMPLEMENTATIONS = {
  "your-skill": yourSkillFunction,
  // ...
};

function yourSkillFunction(suggestion) {
  return `---
name: your-skill
description: "What it does"
---

# Your Skill

\`\`\`bash
# Real, runnable commands here
echo "This actually works"
\`\`\`
`;
}
```

Then: `skill-builder implement your-skill --dry-run`

## Why This Exists

AI coding agents are powerful but generic. They don't know your workflow — which repos you check, which APIs you monitor, which meetings need prep.

This tool watches how you actually work and builds automations specific to you. Instead of browsing a marketplace for skills that might fit, you get suggestions derived from your real behavior — and they come with working code, not setup instructions.

Built by [Go2](https://go2.io) as part of [Cowork.ai](https://cowork.ai).

## License

MIT
