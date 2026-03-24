#!/usr/bin/env node

/**
 * Local UI server for skill-builder.
 * Serves the web UI and provides API endpoints for suggestions,
 * skill implementation, and MCP generation.
 */

import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { openDb, analyzeAll } from "../lib/analyzer.mjs";
import { generateSuggestions, dailyPick } from "../lib/suggester.mjs";
import { generateSkill, listImplementable } from "../lib/generator.mjs";
import { analyzeShellHistory } from "../lib/shell-analyzer.mjs";
import { analyzeGitHistory } from "../lib/git-analyzer.mjs";
import { loadConfig, detectTelemetryDb } from "../lib/config.mjs";
import { generateMcp } from "../lib/mcp-builder.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3456", 10);

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

function getAllSuggestions(days = 7) {
  const config = loadConfig();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  let suggestions = [];

  const dbPath = config.telemetryDb || detectTelemetryDb();
  if (dbPath) {
    try {
      const db = openDb(dbPath);
      suggestions.push(...generateSuggestions(analyzeAll(db, cutoff)));
      db.close();
    } catch {}
  }

  const shell = analyzeShellHistory();
  if (shell.suggestions.length) suggestions.push(...shell.suggestions);

  const git = analyzeGitHistory();
  if (git.suggestions.length) suggestions.push(...git.suggestions);

  // Deduplicate and sort
  const seen = new Set();
  const order = { high: 0, medium: 1, low: 2 };
  return suggestions
    .filter((s) => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
    .sort((a, b) => (order[a.confidence] ?? 3) - (order[b.confidence] ?? 3));
}

function handleApi(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/suggestions") {
    const days = parseInt(url.searchParams.get("days") || "7", 10);
    const suggestions = getAllSuggestions(days);
    const implementable = listImplementable();
    const enriched = suggestions.map((s) => ({
      ...s,
      canImplement: implementable.includes(s.id),
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(enriched));
    return true;
  }

  if (url.pathname === "/api/implement" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { id } = JSON.parse(body);
      const config = loadConfig();
      const suggestions = getAllSuggestions();
      const target = suggestions.find((s) => s.id === id) || { id, signal: "manual", source: "url_pattern", confidence: "high", description: "" };
      const result = generateSkill(target, { dryRun: true, config });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result || { error: "No implementation available" }));
    });
    return true;
  }

  if (url.pathname === "/api/mcp" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const spec = JSON.parse(body);
      const result = generateMcp(spec);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    });
    return true;
  }

  return false;
}

const server = createServer((req, res) => {
  // API routes
  if (req.url.startsWith("/api/")) {
    if (handleApi(req, res)) return;
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  // Static files
  let filePath = req.url === "/" ? "/index.html" : req.url;
  const fullPath = join(__dirname, filePath);

  if (!existsSync(fullPath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = extname(fullPath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
  res.end(readFileSync(fullPath));
});

server.listen(PORT, async () => {
  console.log(`skill-builder UI: http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop\n");

  // Auto-open in browser
  try {
    const { exec } = await import("child_process");
    exec(`open http://localhost:${PORT}`);
  } catch {}
});
