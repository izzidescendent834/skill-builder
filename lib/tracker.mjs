/**
 * Tracker — Logs skill installation, generation, and usage events.
 *
 * Stores events in a local JSON file so we can:
 * - See which skills were installed and when
 * - Track which were LLM-generated vs hardcoded
 * - Eventually: learn from which skills users keep vs uninstall
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

const TRACKER_PATH = join(homedir(), ".skill-builder/events.json");

function readEvents() {
  if (existsSync(TRACKER_PATH)) {
    try { return JSON.parse(readFileSync(TRACKER_PATH, "utf-8")); }
    catch { return []; }
  }
  return [];
}

function writeEvents(events) {
  mkdirSync(dirname(TRACKER_PATH), { recursive: true });
  // Keep last 1000 events max
  const trimmed = events.slice(-1000);
  writeFileSync(TRACKER_PATH, JSON.stringify(trimmed, null, 2));
}

/**
 * Log an event.
 */
export function trackEvent(type, data = {}) {
  const events = readEvents();
  events.push({
    type,
    timestamp: new Date().toISOString(),
    ...data,
  });
  writeEvents(events);
}

/**
 * Get event history, optionally filtered by type.
 */
export function getEvents(type = null, limit = 50) {
  const events = readEvents();
  const filtered = type ? events.filter((e) => e.type === type) : events;
  return filtered.slice(-limit);
}

/**
 * Get stats: how many skills installed, generated, uninstalled.
 */
export function getStats() {
  const events = readEvents();
  return {
    installed: events.filter((e) => e.type === "install").length,
    generated: events.filter((e) => e.type === "generate").length,
    uninstalled: events.filter((e) => e.type === "uninstall").length,
    scans: events.filter((e) => e.type === "scan").length,
    llmCalls: events.filter((e) => e.type === "llm_call").length,
    lastEvent: events.length > 0 ? events[events.length - 1] : null,
  };
}

/**
 * Read usage log — skills self-report when they run.
 * Each skill's bash has a one-liner that appends to usage.log.
 */
export function getUsageStats() {
  const usagePath = join(homedir(), ".skill-builder/usage.log");
  if (!existsSync(usagePath)) return {};

  try {
    const lines = readFileSync(usagePath, "utf-8").split("\n").filter(Boolean);
    const counts = {};
    for (const line of lines) {
      // Format: "2026-03-23T16:00:00 skill-name"
      const parts = line.split(" ");
      const name = parts.slice(1).join(" ");
      if (name) counts[name] = (counts[name] || 0) + 1;
    }
    return counts;
  } catch { return {}; }
}
