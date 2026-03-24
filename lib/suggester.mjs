/**
 * Suggester — Generates ranked skill suggestions from analyzed patterns.
 *
 * Takes pattern data from the analyzer, applies heuristics and hint maps,
 * deduplicates against existing capabilities, and returns a ranked list.
 * Supports daily-pick mode (one per day, no repeats).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";

// Skills / MCPs that already exist — don't re-suggest
const EXISTING = new Set([
  "slack", "gmail", "google-calendar", "notion", "hubspot",
  "memory-engine", "pinecone", "chrome-devtools", "playwright",
  "sod", "eod", "session-start", "session-end", "save", "resume",
  "post-call", "commit", "review-pr",
]);

// App → potential skills mapping
const APP_HINTS = {
  "Google Chrome": [
    { id: "bookmark-manager", desc: "Auto-organize bookmarks by project from browser history" },
    { id: "tab-audit", desc: "Flag tabs open >2hrs, suggest save-or-close" },
  ],
  "Brex": [
    { id: "expense-monitor", desc: "Daily Brex spend summary — flag unusual charges" },
    { id: "budget-check", desc: "Compare current month spend vs budget before purchases" },
  ],
  "QuickTime Player": [
    { id: "video-cataloger", desc: "Index local recordings by date/project/participant" },
  ],
  "Numbers": [
    { id: "csv-quick-analysis", desc: "Fast summary stats on any CSV/spreadsheet" },
  ],
};

// URL pattern → skill suggestion
const URL_HINTS = {
  "meet.google.com": { id: "meeting-auto-brief", desc: "Auto-generate pre-meeting context from brain repo + Memory Engine" },
  "openrouter": { id: "model-cost-monitor", desc: "Track daily model API spend across OpenRouter, Anthropic, OpenAI" },
  "github.com": { id: "pr-dashboard", desc: "Morning summary of open PRs, review requests, CI status" },
  "access.moran.bot": { id: "credential-audit", desc: "Weekly audit of Access vault — expiring keys, unused creds" },
  "slack.com/api": { id: "slack-integration-health", desc: "Monitor Slack app/bot health, token expiry, rate limits" },
};

export function generateSuggestions({ apps, urls, transitions, repeatedText }) {
  const suggestions = [];
  const seen = new Set();

  // 1. App-based
  for (const app of apps) {
    const mins = app.total_minutes || 0;
    if (mins < 30) continue;
    const hints = APP_HINTS[app.app_name];
    if (!hints) continue;
    for (const { id, desc } of hints) {
      if (seen.has(id) || EXISTING.has(id)) continue;
      suggestions.push({
        id,
        description: desc,
        signal: `${app.app_name}: ${Math.round(mins)}min over ${app.active_days} days`,
        source: "app_usage",
        confidence: mins > 60 ? "medium" : "low",
      });
      seen.add(id);
    }
  }

  // 2. URL-based
  for (const row of urls) {
    const url = (row.browser_url || "").toLowerCase();
    for (const [pattern, { id, desc }] of Object.entries(URL_HINTS)) {
      if (!url.includes(pattern) || seen.has(id) || EXISTING.has(id)) continue;
      suggestions.push({
        id,
        description: desc,
        signal: `URL '${pattern}': ${row.visits} visits, ${Math.round(row.total_minutes || 0)}min`,
        source: "url_pattern",
        confidence: row.visits > 50 ? "high" : "medium",
      });
      seen.add(id);
    }
  }

  // 3. Context switches — only the top 5, only if heavy (100+)
  const topSwitches = transitions.filter((t) => t.count >= 100).slice(0, 5);
  for (const t of topSwitches) {
    const id = `bridge-${slug(t.from)}-${slug(t.to)}`;
    if (seen.has(id) || id.length > 60) continue;
    suggestions.push({
      id,
      description: `Automate the ${t.from} → ${t.to} workflow (${t.count} transitions)`,
      signal: `${t.count} context switches`,
      source: "context_switch",
      confidence: "low",
    });
    seen.add(id);
  }

  // 4. Repeated text
  for (const chunk of repeatedText) {
    if ((chunk.occurrences || 0) < 4) continue;
    const preview = (chunk.chunk_text || "").slice(0, 50).replace(/\n/g, " ");
    const id = `template-${slug(chunk.app_name)}`;
    if (seen.has(id)) continue;
    suggestions.push({
      id,
      description: `Template for repeated text in ${chunk.app_name}: "${preview}..."`,
      signal: `Typed ${chunk.occurrences}x`,
      source: "repeated_text",
      confidence: "low",
    });
    seen.add(id);
  }

  // Sort by confidence
  const order = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => (order[a.confidence] ?? 3) - (order[b.confidence] ?? 3));
  return suggestions;
}

/**
 * Pick the top unseen suggestion for today.
 * Tracks history so it never repeats the same suggestion.
 */
export function dailyPick(suggestions, historyPath) {
  const resolvedPath = historyPath || join(homedir(), ".skill-builder/history.json");

  let history = new Set();
  if (existsSync(resolvedPath)) {
    try {
      history = new Set(JSON.parse(readFileSync(resolvedPath, "utf-8")));
    } catch { /* fresh start */ }
  }

  const pick = suggestions.find((s) => !history.has(s.id));
  if (!pick) return null;

  // Record
  history.add(pick.id);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, JSON.stringify([...history], null, 2));

  return pick;
}

function slug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
}
