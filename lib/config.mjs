/**
 * Config — Loads user configuration for skill-builder.
 *
 * Looks for ~/.skill-builder/config.json or uses sensible defaults.
 * Public users configure their own repos, services, and data sources.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".skill-builder");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULTS = {
  // Where to install generated skills
  skillDir: join(homedir(), ".claude/commands"),

  // Where to keep canonical copies (optional)
  canonicalDir: null,

  // Cowork.ai SQLite DB path (null = auto-detect)
  telemetryDb: null,

  // GitHub repos to monitor for PR dashboard
  repos: [],

  // Services to test for credential audit
  services: [],

  // Suggestion history file
  historyFile: join(CONFIG_DIR, "history.json"),

  // Days of telemetry to analyze
  defaultDays: 3,

  // Data sources to use (future: slack, calendar, git, meetings)
  dataSources: ["telemetry"],
};

export function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    try {
      const user = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      return { ...DEFAULTS, ...user };
    } catch {
      return { ...DEFAULTS };
    }
  }
  return { ...DEFAULTS };
}

export function initConfig() {
  mkdirSync(CONFIG_DIR, { recursive: true });
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2));
    return { created: true, path: CONFIG_PATH };
  }
  return { created: false, path: CONFIG_PATH };
}

/**
 * Auto-detect Cowork.ai database location.
 * Works on macOS. Returns null if not found.
 */
export function detectTelemetryDb() {
  const candidates = [
    join(homedir(), "Library/Application Support/Cowork.ai Alpha/database/cowork.db"),
    join(homedir(), "Library/Application Support/Cowork.ai/database/cowork.db"),
    join(homedir(), ".cowork/database/cowork.db"),
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

/**
 * Auto-detect GitHub repos from the current machine.
 */
export function detectRepos() {
  // Could scan ~/Desktop/Code, ~/projects, etc for .git dirs
  // For now, return empty — user configures manually
  return [];
}
