#!/usr/bin/env node

/**
 * skill-builder — Reads your activity data, suggests skills, builds them.
 *
 * Commands:
 *   init             — Set up config at ~/.skill-builder/config.json
 *   suggest          — Full analysis, output ranked suggestion queue
 *   daily            — Single pick for today (one skill per day)
 *   implement <id>   — Build and install a skill
 *   list             — Show implementable skills
 */

import { openDb, analyzeAll } from "../lib/analyzer.mjs";
import { generateSuggestions, dailyPick } from "../lib/suggester.mjs";
import { generateSkill, listImplementable } from "../lib/generator.mjs";
import { loadConfig, initConfig, detectTelemetryDb } from "../lib/config.mjs";
import { analyzeShellHistory } from "../lib/shell-analyzer.mjs";

const args = process.argv.slice(2);
const command = args[0] || "daily";
const dryRun = args.includes("--dry-run");

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

function showHelp() {
  console.log(`skill-builder — Analyze your activity, build agent skills

Commands:
  init              Set up config at ~/.skill-builder/config.json
  suggest           Full ranked suggestion list from your activity
  daily             One new suggestion per day (no repeats)
  implement <id>    Build and install a skill
  list              Show skills with working implementations

Options:
  --days N          Analysis window (default: 3)
  --dry-run         Preview without installing
  --help            Show this help

Examples:
  skill-builder suggest --days 7
  skill-builder implement pr-dashboard --dry-run
  skill-builder implement credential-audit

Config: ~/.skill-builder/config.json
Docs:   https://github.com/Scottpedia0/skill-builder`);
}

async function main() {
  if (command === "--help" || command === "-h" || command === "help") {
    showHelp();
    return;
  }

  // Init command doesn't need DB
  if (command === "init") {
    const result = initConfig();
    if (result.created) {
      console.log(`Created config at ${result.path}`);
      console.log("Edit this file to configure your repos, services, and data sources.");
    } else {
      console.log(`Config already exists at ${result.path}`);
    }

    // Auto-detect telemetry DB
    const db = detectTelemetryDb();
    if (db) {
      console.log(`\nDetected Cowork.ai database: ${db}`);
    } else {
      console.log("\nNo Cowork.ai database found.");
      console.log("Install Cowork.ai or set telemetryDb in config to point at a compatible SQLite DB.");
    }
    return;
  }

  // List command doesn't need DB either
  if (command === "list") {
    const skills = listImplementable();
    console.log("Skills with working implementations:\n");
    for (const id of skills) {
      console.log(`  ${id}`);
    }
    console.log(`\n${skills.length} total. Run: skill-builder implement <id> [--dry-run]`);
    return;
  }

  const config = loadConfig();
  const days = parseInt(getFlag("--days") || String(config.defaultDays), 10);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  // Collect suggestions from all available data sources
  let suggestions = [];

  // 1. Telemetry (Cowork.ai or compatible SQLite)
  const dbPath = config.telemetryDb || detectTelemetryDb();
  if (dbPath) {
    try {
      const db = openDb(dbPath);
      const patterns = analyzeAll(db, cutoff);
      suggestions.push(...generateSuggestions(patterns));
      db.close();
    } catch (e) {
      console.error(`Telemetry DB error: ${e.message}`);
    }
  }

  // 2. Shell history (always available on any machine)
  const shellResult = analyzeShellHistory();
  if (shellResult.suggestions.length > 0) {
    suggestions.push(...shellResult.suggestions);
  }

  if (suggestions.length === 0) {
    console.error("No data sources found. Run: skill-builder init");
    console.error("Or generate demo data: node scripts/generate-demo-db.mjs");
    process.exit(1);
  }

  // Deduplicate by id and sort by confidence
  const seenIds = new Set();
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  suggestions = suggestions
    .filter((s) => {
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    })
    .sort((a, b) => (confidenceOrder[a.confidence] ?? 3) - (confidenceOrder[b.confidence] ?? 3));

  const outputDir = config.skillDir;
  const canonicalDir = config.canonicalDir;

  switch (command) {
    case "suggest": {
      console.log(`# Skill Suggestions`);
      console.log(`\nAnalyzed ${days} days | ${suggestions.length} suggestions\n`);

      let current = "";
      for (const s of suggestions) {
        if (s.confidence !== current) {
          current = s.confidence;
          console.log(`## ${current.charAt(0).toUpperCase() + current.slice(1)} Confidence\n`);
        }
        const implementable = listImplementable().includes(s.id) ? " ✅" : "";
        console.log(`- [ ] **${s.id}**${implementable} — ${s.description}`);
        console.log(`  Signal: ${s.signal} | Source: ${s.source}\n`);
      }
      console.log("✅ = has working implementation. Run: skill-builder implement <id>");
      break;
    }

    case "daily": {
      const pick = dailyPick(suggestions, config.historyFile);
      if (!pick) {
        console.log("All suggestions reviewed. Delete ~/.skill-builder/history.json to reset.");
        break;
      }
      const canBuild = listImplementable().includes(pick.id);
      console.log(`## Today's Skill Suggestion\n`);
      console.log(`**${pick.id}** — ${pick.description}\n`);
      console.log(`- Signal: ${pick.signal}`);
      console.log(`- Confidence: ${pick.confidence}`);
      console.log(`- Auto-implementable: ${canBuild ? "yes ✅" : "no — needs manual implementation"}\n`);
      if (canBuild) {
        console.log(`Install it: skill-builder implement ${pick.id}`);
        console.log(`Preview first: skill-builder implement ${pick.id} --dry-run`);
      }
      break;
    }

    case "implement": {
      const targetId = args[1];
      if (!targetId) {
        console.error("Usage: skill-builder implement <skill-id>");
        console.error("See available: skill-builder list");
        process.exit(1);
      }

      // Allow implementing even if not in current suggestions
      // (user might want to install from the implementable list directly)
      const fakeSuggestion = { id: targetId, signal: "manual", source: "url_pattern", confidence: "high", description: "" };
      const target = suggestions.find((s) => s.id === targetId) || fakeSuggestion;

      const result = generateSkill(target, { outputDir, brainDir: canonicalDir, dryRun, config });
      if (!result) {
        const available = listImplementable();
        console.error(`No working implementation for '${targetId}'.`);
        console.error(`\nAvailable:\n  ${available.join("\n  ")}`);
        process.exit(1);
      }

      if (dryRun) {
        console.log(`[DRY RUN] Would install to: ${result.path}`);
        if (result.brainPath) console.log(`  Canonical: ${result.brainPath}`);
        console.log(`\n${result.content}`);
      } else {
        console.log(`Installed: ${result.path}`);
        if (result.brainPath) console.log(`Canonical: ${result.brainPath}`);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error(`\nCommands:`);
      console.error(`  init             Set up config`);
      console.error(`  suggest          Full ranked suggestion list`);
      console.error(`  daily            One suggestion per day`);
      console.error(`  implement <id>   Build and install a skill`);
      console.error(`  list             Show implementable skills`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
