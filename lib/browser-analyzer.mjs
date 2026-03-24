/**
 * Browser History Analyzer — Reads Chrome/Arc/Firefox history.
 *
 * Chrome stores history in a SQLite database. We copy it (to avoid lock issues),
 * query for frequently visited URLs, and identify patterns worth automating.
 */

import { existsSync, copyFileSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import Database from "better-sqlite3";

const HISTORY_PATHS = [
  // Chrome
  join(homedir(), "Library/Application Support/Google/Chrome/Default/History"),
  // Chrome Canary
  join(homedir(), "Library/Application Support/Google/Chrome Canary/Default/History"),
  // Arc
  join(homedir(), "Library/Application Support/Arc/User Data/Default/History"),
  // Brave
  join(homedir(), "Library/Application Support/BraveSoftware/Brave-Browser/Default/History"),
  // Edge
  join(homedir(), "Library/Application Support/Microsoft Edge/Default/History"),
  // Linux Chrome
  join(homedir(), ".config/google-chrome/Default/History"),
  // Linux Firefox (different schema — skip for now)
];

const TMP_COPY = "/tmp/skill-builder-browser-history.db";

/**
 * Find and copy browser history DB (Chrome locks it while running).
 */
function getHistoryDb(customPath) {
  const histPath = customPath || HISTORY_PATHS.find((p) => existsSync(p));
  if (!histPath) return null;

  try {
    copyFileSync(histPath, TMP_COPY);
    return new Database(TMP_COPY, { readonly: true });
  } catch (e) {
    // Copy might fail if Chrome has an exclusive lock
    console.error(`Browser history copy failed: ${e.message}`);
    return null;
  }
}

/**
 * Analyze browser history for patterns.
 */
export function analyzeBrowserHistory(customPath, days = 7) {
  const db = getHistoryDb(customPath);
  if (!db) return { suggestions: [], path: null };

  const suggestions = [];

  try {
    // Chrome stores timestamps as microseconds since 1601-01-01
    // Convert to Unix: subtract 11644473600 seconds, divide by 1000000
    const cutoffMicro = (Date.now() / 1000 + 11644473600) * 1000000 - days * 86400 * 1000000;

    // Most visited URLs
    const topUrls = db.prepare(`
      SELECT url, title, visit_count,
             datetime(last_visit_time/1000000-11644473600, 'unixepoch') as last_visit
      FROM urls
      WHERE last_visit_time > ? AND visit_count >= 3
      ORDER BY visit_count DESC
      LIMIT 50
    `).all(cutoffMicro);

    // Group by domain
    const domains = new Map();
    for (const row of topUrls) {
      try {
        const domain = new URL(row.url).hostname;
        if (!domains.has(domain)) domains.set(domain, { visits: 0, urls: [], titles: [] });
        const d = domains.get(domain);
        d.visits += row.visit_count;
        d.urls.push(row.url);
        d.titles.push(row.title);
      } catch {}
    }

    // Find domains visited heavily — potential MCP or skill targets
    const KNOWN_SERVICES = {
      "github.com": { id: "github-workflow", desc: "GitHub workflow automation — PRs, issues, actions" },
      "linear.app": { id: "linear-tracker", desc: "Linear issue tracking automation" },
      "notion.so": { id: "notion-sync", desc: "Notion page/database automation" },
      "figma.com": { id: "figma-export", desc: "Figma design export and asset management" },
      "vercel.com": { id: "vercel-deploy", desc: "Vercel deployment monitoring and rollback" },
      "console.aws.amazon.com": { id: "aws-console", desc: "AWS resource monitoring and management" },
      "app.slack.com": { id: "slack-automation", desc: "Slack message and channel automation" },
      "docs.google.com": { id: "gdocs-workflow", desc: "Google Docs creation and template automation" },
      "mail.google.com": { id: "gmail-templates", desc: "Gmail template and follow-up automation" },
      "calendar.google.com": { id: "gcal-prep", desc: "Calendar event prep and follow-up automation" },
      "dashboard.stripe.com": { id: "stripe-monitor", desc: "Stripe payment and subscription monitoring" },
      "app.hubspot.com": { id: "hubspot-workflow", desc: "HubSpot CRM workflow automation" },
      "stackoverflow.com": { id: "stackoverflow-cache", desc: "Cache frequent Stack Overflow lookups as local reference" },
    };

    for (const [domain, data] of [...domains.entries()].sort((a, b) => b[1].visits - a[1].visits)) {
      const known = KNOWN_SERVICES[domain];
      if (known && data.visits >= 5) {
        suggestions.push({
          id: known.id,
          description: known.desc,
          signal: `Browser: ${domain} visited ${data.visits}x in ${days} days`,
          source: "browser_history",
          confidence: data.visits > 20 ? "high" : data.visits > 10 ? "medium" : "low",
          meta: { domain, visits: data.visits, sampleUrls: data.urls.slice(0, 5), titles: data.titles.slice(0, 5) },
        });
      }
    }

    // Find repeated search patterns (Google searches)
    const searches = db.prepare(`
      SELECT url, title
      FROM urls
      WHERE url LIKE '%google.com/search%' AND last_visit_time > ?
      ORDER BY visit_count DESC
      LIMIT 30
    `).all(cutoffMicro);

    // Extract search queries
    const queryPatterns = new Map();
    for (const row of searches) {
      try {
        const q = new URL(row.url).searchParams.get("q");
        if (!q) continue;
        // Extract first 2-3 words as pattern
        const pattern = q.split(/\s+/).slice(0, 3).join(" ").toLowerCase();
        if (pattern.length < 5) continue;
        queryPatterns.set(pattern, (queryPatterns.get(pattern) || 0) + 1);
      } catch {}
    }

    for (const [pattern, count] of [...queryPatterns.entries()].filter(([, c]) => c >= 2)) {
      suggestions.push({
        id: `lookup-${pattern.replace(/[^a-z0-9]+/g, "-").slice(0, 25)}`,
        description: `Repeated search: "${pattern}" (${count}x) — consider a reference skill`,
        signal: `Google search pattern: "${pattern}" searched ${count}x`,
        source: "browser_search",
        confidence: count >= 5 ? "medium" : "low",
        meta: { pattern, count },
      });
    }

    db.close();
  } catch (e) {
    console.error(`Browser analysis error: ${e.message}`);
    try { db.close(); } catch {}
  }

  // Clean up temp copy
  try { unlinkSync(TMP_COPY); } catch {}

  return {
    suggestions,
    path: HISTORY_PATHS.find((p) => existsSync(p)) || null,
  };
}
