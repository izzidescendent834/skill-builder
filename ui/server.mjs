#!/usr/bin/env node

/**
 * skill-builder API server.
 * Serves the backend API that the React frontend calls.
 * Run alongside `npm run dev` in the ui/ directory.
 */

import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

import { openDb, analyzeAll } from "../lib/analyzer.mjs";
import { generateSuggestions, dailyPick } from "../lib/suggester.mjs";
import { generateSkill, listImplementable, canGenerate } from "../lib/generator.mjs";
import { hasLlmAvailable } from "../lib/llm.mjs";
import { analyzeShellHistory } from "../lib/shell-analyzer.mjs";
import { analyzeGitHistory } from "../lib/git-analyzer.mjs";
import { analyzeBrowserHistory } from "../lib/browser-analyzer.mjs";
import { analyzeClaudeThreads } from "../lib/claude-thread-analyzer.mjs";
import { loadConfig, initConfig, detectTelemetryDb } from "../lib/config.mjs";
import { generateMcp } from "../lib/mcp-builder.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3456", 10);
const CONFIG_PATH = join(homedir(), ".skill-builder/config.json");
const SKILL_DIR = join(homedir(), ".claude/commands");
const MCP_DIR = join(homedir(), "mcps");

// ─── Config helpers ─────────────────────────────────────────────

function readConfig() {
  if (existsSync(CONFIG_PATH)) {
    try { return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")); }
    catch { return {}; }
  }
  return {};
}

function writeConfig(updates) {
  const current = readConfig();
  const merged = { ...current, ...updates };
  // Deep merge keys
  if (updates.keys) merged.keys = { ...(current.keys || {}), ...updates.keys };
  if (updates.sources) merged.sources = { ...(current.sources || {}), ...updates.sources };
  if (updates.sourceConfigs) merged.sourceConfigs = { ...(current.sourceConfigs || {}), ...updates.sourceConfigs };
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

// ─── Suggestion cache ───────────────────────────────────────────

let cachedSuggestions = null;
let lastScanTime = null;

function runScan(days = 7) {
  const config = readConfig();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  let suggestions = [];

  // Telemetry
  const dbPath = config.telemetryDb || config.sourceConfigs?.telemetryDb || detectTelemetryDb();
  if (dbPath) {
    try {
      const db = openDb(dbPath);
      suggestions.push(...generateSuggestions(analyzeAll(db, cutoff)));
      db.close();
    } catch (e) {
      console.error("Telemetry error:", e.message);
    }
  }

  // Shell
  const shell = analyzeShellHistory();
  if (shell.suggestions.length) suggestions.push(...shell.suggestions);

  // Git
  const git = analyzeGitHistory();
  if (git.suggestions.length) suggestions.push(...git.suggestions);

  // Browser history
  const browser = analyzeBrowserHistory(config.sourceConfigs?.browserHistoryPath);
  if (browser.suggestions.length) suggestions.push(...browser.suggestions);

  // Claude Code conversation threads
  const claude = analyzeClaudeThreads();
  if (claude.suggestions.length) suggestions.push(...claude.suggestions);

  // Deduplicate and sort
  const seen = new Set();
  const order = { high: 0, medium: 1, low: 2 };
  suggestions = suggestions
    .filter((s) => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
    .sort((a, b) => (order[a.confidence] ?? 3) - (order[b.confidence] ?? 3));

  // Enrich with canImplement (hardcoded OR LLM available) and type
  const implementable = listImplementable();
  const llmAvailable = hasLlmAvailable();
  suggestions = suggestions.map((s) => ({
    ...s,
    name: s.id,
    canImplement: implementable.includes(s.id) || llmAvailable,
    hardcoded: implementable.includes(s.id),
    type: s.source === "mcp" ? "mcp" : "skill",
    aiAnalyzed: false,
  }));

  cachedSuggestions = suggestions;
  lastScanTime = new Date().toISOString();
  return suggestions;
}

// ─── Installed skills ───────────────────────────────────────────

function getInstalledSkills() {
  if (!existsSync(SKILL_DIR)) return [];
  return readdirSync(SKILL_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const path = join(SKILL_DIR, f);
      const content = readFileSync(path, "utf-8");
      return {
        id: f.replace(".md", ""),
        name: f.replace(".md", ""),
        path,
        installDate: new Date().toISOString(), // TODO: get actual mtime
        code: content,
      };
    });
}

// ─── HTTP Server ────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    // Health
    if (path === "/api/health") {
      return json(res, { ok: true, lastScan: lastScanTime });
    }

    // Config
    if (path === "/api/config" && req.method === "GET") {
      return json(res, readConfig());
    }
    if (path === "/api/config" && req.method === "POST") {
      const body = await parseBody(req);
      return json(res, writeConfig(body));
    }

    // Scan
    if (path === "/api/scan" && req.method === "POST") {
      const days = parseInt(url.searchParams.get("days") || "7", 10);
      const suggestions = runScan(days);
      return json(res, { ok: true, count: suggestions.length, lastScan: lastScanTime });
    }

    // Suggestions
    if (path === "/api/suggestions") {
      const days = parseInt(url.searchParams.get("days") || "7", 10);
      if (!cachedSuggestions) runScan(days);
      return json(res, cachedSuggestions);
    }

    // Implement (preview)
    if (path === "/api/implement" && req.method === "POST") {
      const { id } = await parseBody(req);
      const config = readConfig();
      const suggestions = cachedSuggestions || runScan();
      const target = suggestions.find((s) => s.id === id) || { id, signal: "manual", source: "url_pattern", confidence: "high", description: "" };
      const result = await generateSkill(target, { dryRun: true, config });
      if (!result) return json(res, { error: "No implementation available. Configure an API key to enable LLM generation." }, 404);
      return json(res, result);
    }

    // Save/install skill
    if (path === "/api/skills/save" && req.method === "POST") {
      const { id, content } = await parseBody(req);
      mkdirSync(SKILL_DIR, { recursive: true });
      const filePath = join(SKILL_DIR, `${id}.md`);
      writeFileSync(filePath, content);
      return json(res, { ok: true, path: filePath });
    }

    // Installed skills
    if (path === "/api/installed" && req.method === "GET") {
      return json(res, getInstalledSkills());
    }

    // Uninstall
    if (path.startsWith("/api/installed/") && req.method === "DELETE") {
      const id = path.split("/").pop();
      const filePath = join(SKILL_DIR, `${id}.md`);
      if (existsSync(filePath)) unlinkSync(filePath);
      return json(res, { ok: true });
    }

    // MCP generate
    if (path === "/api/mcp" && req.method === "POST") {
      const spec = await parseBody(req);
      const result = generateMcp(spec);
      return json(res, result);
    }

    // MCP save to disk
    if (path === "/api/mcp/save" && req.method === "POST") {
      const spec = await parseBody(req);
      const result = generateMcp(spec);
      const dir = join(MCP_DIR, result.name);
      mkdirSync(dir, { recursive: true });
      for (const [filename, content] of Object.entries(result.files)) {
        writeFileSync(join(dir, filename), content);
      }
      return json(res, { ok: true, path: dir });
    }

    // MCP add to Claude Code config
    if (path === "/api/config/mcp" && req.method === "POST") {
      const { name } = await parseBody(req);
      const settingsPath = join(homedir(), ".claude/settings.json");
      let settings = {};
      if (existsSync(settingsPath)) {
        try { settings = JSON.parse(readFileSync(settingsPath, "utf-8")); }
        catch {}
      }
      if (!settings.mcpServers) settings.mcpServers = {};
      settings.mcpServers[name] = {
        command: "node",
        args: [join(MCP_DIR, name, "server.mjs")],
      };
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      return json(res, { ok: true });
    }

    json(res, { error: "Not found" }, 404);
  } catch (e) {
    console.error(e);
    json(res, { error: e.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`skill-builder API: http://localhost:${PORT}`);
  console.log(`Start the UI: cd ui && npm run dev`);
  console.log("Press Ctrl+C to stop\n");
});
