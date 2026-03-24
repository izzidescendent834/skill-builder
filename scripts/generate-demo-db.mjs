#!/usr/bin/env node

/**
 * Generate a demo SQLite database with realistic activity data.
 * This lets anyone try skill-builder without Cowork.ai installed.
 *
 * Usage: node scripts/generate-demo-db.mjs
 * Output: demo/demo.db
 */

import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "demo", "demo.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Create tables matching Cowork.ai schema
db.exec(`
  CREATE TABLE IF NOT EXISTS activity_sessions (
    id TEXT PRIMARY KEY,
    app_name TEXT NOT NULL,
    bundle_id TEXT,
    window_title TEXT,
    browser_url TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    last_observed_at TEXT,
    duration_ms INTEGER,
    embedded_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    content_hash TEXT,
    last_embedded_content_hash TEXT,
    embedding_profile_id TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_activity_sessions_started_at ON activity_sessions (started_at);
  CREATE INDEX IF NOT EXISTS idx_activity_sessions_app_name ON activity_sessions (app_name);

  CREATE TABLE IF NOT EXISTS keystroke_chunks (
    id TEXT PRIMARY KEY,
    activity_session_id TEXT,
    app_name TEXT,
    bundle_id TEXT,
    chunk_text TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    embedded_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_keystroke_chunks_started_at ON keystroke_chunks (started_at);
  CREATE INDEX IF NOT EXISTS idx_keystroke_chunks_app_name ON keystroke_chunks (app_name);
`);

// Realistic activity patterns for a developer/founder
const PATTERNS = [
  // Heavy apps
  { app: "Google Chrome", weight: 40, urls: [
    { title: "Google Meet", url: "https://meet.google.com/abc-defg-hij", weight: 30 },
    { title: "GitHub - myorg/myapp", url: "https://github.com/myorg/myapp", weight: 15 },
    { title: "Slack - #engineering", url: "https://app.slack.com/client/T123/C456", weight: 10 },
    { title: "OpenRouter Activity", url: "https://openrouter.ai/activity", weight: 8 },
    { title: "Notion - Sprint Planning", url: "https://notion.so/Sprint-Planning-123", weight: 5 },
    { title: "Brex Dashboard", url: "https://dashboard.brex.com", weight: 5 },
    { title: "Linear Issues", url: "https://linear.app/myteam/issues", weight: 5 },
    { title: "Vercel Dashboard", url: "https://vercel.com/myorg", weight: 4 },
    { title: "Stack Overflow", url: "https://stackoverflow.com/questions/12345", weight: 3 },
    { title: "Claude Code Docs", url: "https://docs.anthropic.com/claude-code", weight: 10 },
  ]},
  { app: "VS Code", weight: 20, urls: [] },
  { app: "Terminal", weight: 10, urls: [] },
  { app: "Claude", weight: 12, urls: [] },
  { app: "Slack", weight: 8, urls: [] },
  { app: "Finder", weight: 3, urls: [] },
  { app: "Notes", weight: 2, urls: [] },
  { app: "QuickTime Player", weight: 2, urls: [] },
  { app: "Numbers", weight: 1, urls: [] },
];

const KEYSTROKE_SAMPLES = [
  { app: "Terminal", text: "git checkout -b feature/auth-flow", count: 33 },
  { app: "Terminal", text: "npm run test", count: 12 },
  { app: "Terminal", text: "git add . && git commit -m", count: 25 },
  { app: "VS Code", text: "export async function handleAuth(req, res) {", count: 44 },
  { app: "Google Chrome", text: "how to fix CORS error nextjs api route", count: 39 },
  { app: "Claude", text: "Fix the authentication middleware to handle expired tokens", count: 57 },
  { app: "Slack", text: "Hey, the deploy is done. Can you check staging?", count: 48 },
  { app: "Google Chrome", text: "sorry for the delay", count: 20 },
  { app: "Google Chrome", text: "sorry for the delay", count: 20 },
  { app: "Google Chrome", text: "sorry for the delay", count: 20 },
  { app: "Google Chrome", text: "sorry for the delay", count: 20 },
  { app: "Google Chrome", text: "sorry for the delay", count: 20 },
];

// Generate 3 days of activity
const NOW = Date.now();
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
const SESSION_COUNT = 2000;

const insertSession = db.prepare(`
  INSERT INTO activity_sessions (id, app_name, window_title, browser_url, started_at, ended_at, duration_ms, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertKeystroke = db.prepare(`
  INSERT INTO keystroke_chunks (id, activity_session_id, app_name, chunk_text, char_count, started_at, ended_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// Build weighted random selector
const totalWeight = PATTERNS.reduce((s, p) => s + p.weight, 0);

function pickApp() {
  let r = Math.random() * totalWeight;
  for (const p of PATTERNS) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return PATTERNS[0];
}

function pickUrl(pattern) {
  if (!pattern.urls.length) return { title: null, url: null };
  const total = pattern.urls.reduce((s, u) => s + u.weight, 0);
  let r = Math.random() * total;
  for (const u of pattern.urls) {
    r -= u.weight;
    if (r <= 0) return u;
  }
  return pattern.urls[0];
}

console.log(`Generating ${SESSION_COUNT} activity sessions...`);

const insertMany = db.transaction(() => {
  for (let i = 0; i < SESSION_COUNT; i++) {
    const pattern = pickApp();
    const url = pickUrl(pattern);
    const startOffset = Math.random() * THREE_DAYS;
    const startTime = new Date(NOW - startOffset);
    const duration = Math.floor(Math.random() * 300000) + 10000; // 10s to 5min
    const endTime = new Date(startTime.getTime() + duration);

    insertSession.run(
      crypto.randomUUID(),
      pattern.app,
      url.title || pattern.app,
      url.url || null,
      startTime.toISOString(),
      endTime.toISOString(),
      duration,
      startTime.toISOString()
    );
  }

  // Generate keystroke chunks
  console.log(`Generating ${KEYSTROKE_SAMPLES.length} keystroke patterns...`);
  for (const sample of KEYSTROKE_SAMPLES) {
    const reps = Math.floor(Math.random() * 5) + 1;
    for (let j = 0; j < reps; j++) {
      const startOffset = Math.random() * THREE_DAYS;
      const startTime = new Date(NOW - startOffset);
      const endTime = new Date(startTime.getTime() + 5000);

      insertKeystroke.run(
        crypto.randomUUID(),
        null,
        sample.app,
        sample.text,
        sample.count,
        startTime.toISOString(),
        endTime.toISOString(),
        startTime.toISOString()
      );
    }
  }
});

insertMany();
db.close();

console.log(`Demo database created at: ${DB_PATH}`);
console.log(`\nTry it: node bin/cli.mjs suggest --days 3`);
console.log(`(Set telemetryDb in ~/.skill-builder/config.json to point at demo/demo.db)`);
