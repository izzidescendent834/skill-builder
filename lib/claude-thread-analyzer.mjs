/**
 * Claude Thread Analyzer — Reads Claude Code conversation logs.
 *
 * Finds: repeated prompts, correction patterns, common tool usage,
 * workflow sequences that the user keeps asking for manually.
 *
 * This is the highest-signal data source for developers using AI agents.
 * What you keep asking your agent to do manually is exactly what should become a skill.
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CLAUDE_DIR = join(homedir(), ".claude/projects");

/**
 * Read all user prompts from Claude Code conversation logs.
 */
function readConversationLogs(days = 7) {
  if (!existsSync(CLAUDE_DIR)) return [];

  const cutoff = Date.now() - days * 86400000;
  const prompts = [];

  try {
    const projectDirs = readdirSync(CLAUDE_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(CLAUDE_DIR, d.name));

    for (const projDir of projectDirs) {
      const files = readdirSync(projDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => join(projDir, f));

      for (const file of files) {
        try {
          const lines = readFileSync(file, "utf-8").split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);

              // Only user messages
              if (entry.type !== "user") continue;
              const msg = entry.message;
              if (!msg || msg.role !== "user") continue;

              // Extract timestamp
              const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
              if (ts && ts < cutoff) continue;

              // Extract text content
              let text = "";
              if (typeof msg.content === "string") {
                text = msg.content;
              } else if (Array.isArray(msg.content)) {
                for (const part of msg.content) {
                  if (part.type === "text" && part.text) {
                    text = part.text;
                    break;
                  }
                }
              }

              if (text && text.length > 10 && text.length < 2000) {
                prompts.push({
                  text: text.trim(),
                  timestamp: ts,
                  project: projDir.split("/").pop(),
                });
              }
            } catch {}
          }
        } catch {}
      }
    }
  } catch {}

  return prompts;
}

/**
 * Find repeated prompt patterns — similar things the user keeps asking.
 */
function findRepeatedPrompts(prompts, minCount = 2) {
  // Normalize: lowercase, collapse whitespace, strip common prefixes
  const normalized = new Map();

  for (const p of prompts) {
    const key = p.text
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/^(hey|ok|okay|so|please|can you|could you)\s+/i, "")
      .trim()
      .slice(0, 100); // Compare first 100 chars

    if (key.length < 15) continue;

    if (!normalized.has(key)) normalized.set(key, []);
    normalized.get(key).push(p);
  }

  return [...normalized.entries()]
    .filter(([, instances]) => instances.length >= minCount)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, instances]) => ({
      pattern: key,
      count: instances.length,
      examples: instances.slice(0, 3).map((i) => i.text.slice(0, 120)),
      projects: [...new Set(instances.map((i) => i.project))],
    }));
}

/**
 * Find correction patterns — "no, use X" / "don't do Y" / "actually..."
 */
function findCorrectionPatterns(prompts) {
  const corrections = [];
  const correctionRegex = /^(no[,.]?\s|don'?t\s|stop\s|actually[,.]?\s|that'?s wrong|i meant|i told you|use .+ not .+|instead of .+ use)/i;

  for (const p of prompts) {
    if (correctionRegex.test(p.text)) {
      corrections.push(p);
    }
  }

  // Group by similarity
  const groups = new Map();
  for (const c of corrections) {
    const key = c.text.toLowerCase().slice(0, 60);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  return [...groups.entries()]
    .filter(([, instances]) => instances.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, instances]) => ({
      correction: key,
      count: instances.length,
      examples: instances.slice(0, 3).map((i) => i.text.slice(0, 150)),
    }));
}

/**
 * Find command-like prompts — things that should be slash commands.
 */
function findCommandPatterns(prompts) {
  // Prompts that start with action verbs and are short = likely should be skills
  const actionVerbs = /^(run|fix|check|update|deploy|test|build|lint|format|review|commit|push|pull|create|delete|rename|move|copy|search|find|list|show|get|set|add|remove|install|uninstall)/i;

  const commands = new Map();
  for (const p of prompts) {
    if (p.text.length > 200) continue; // Long prompts are usually context, not commands
    if (!actionVerbs.test(p.text)) continue;

    // Extract the action phrase (first 5-6 words)
    const phrase = p.text.split(/\s+/).slice(0, 5).join(" ").toLowerCase();
    if (!commands.has(phrase)) commands.set(phrase, []);
    commands.get(phrase).push(p);
  }

  return [...commands.entries()]
    .filter(([, instances]) => instances.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([phrase, instances]) => ({
      phrase,
      count: instances.length,
      examples: instances.slice(0, 3).map((i) => i.text.slice(0, 120)),
    }));
}

/**
 * Full Claude thread analysis — returns suggestions.
 */
export function analyzeClaudeThreads(days = 7) {
  const prompts = readConversationLogs(days);
  if (!prompts.length) return { suggestions: [], promptCount: 0 };

  const repeated = findRepeatedPrompts(prompts);
  const corrections = findCorrectionPatterns(prompts);
  const commands = findCommandPatterns(prompts);

  const suggestions = [];

  // Repeated prompts → skills
  for (const { pattern, count, examples } of repeated.slice(0, 5)) {
    const name = pattern.split(/\s+/).slice(0, 4).join("-").replace(/[^a-z0-9-]/g, "").slice(0, 30) || "repeated-prompt";
    suggestions.push({
      id: `agent-${name}`,
      description: `You asked your agent "${pattern}" ${count} times. This should be a skill.`,
      signal: `Claude threads: "${pattern.slice(0, 50)}" repeated ${count}x`,
      source: "claude_threads",
      confidence: count >= 5 ? "high" : count >= 3 ? "medium" : "low",
      meta: { pattern, count, examples },
    });
  }

  // Corrections → guardrail skills or CLAUDE.md entries
  for (const { correction, count, examples } of corrections.slice(0, 3)) {
    const name = correction.split(/\s+/).slice(0, 4).join("-").replace(/[^a-z0-9-]/g, "").slice(0, 30) || "correction";
    suggestions.push({
      id: `fix-${name}`,
      description: `You corrected your agent about "${correction}" ${count} times. Add this as a rule or skill.`,
      signal: `Corrections: "${correction.slice(0, 50)}" corrected ${count}x`,
      source: "claude_corrections",
      confidence: count >= 3 ? "high" : "medium",
      meta: { correction, count, examples },
    });
  }

  // Command patterns → slash commands
  for (const { phrase, count, examples } of commands.slice(0, 5)) {
    const name = phrase.replace(/[^a-z0-9]+/g, "-").slice(0, 30) || "command";
    suggestions.push({
      id: `cmd-${name}`,
      description: `You tell your agent to "${phrase}" ${count} times. Make it a slash command.`,
      signal: `Agent commands: "${phrase}" requested ${count}x`,
      source: "claude_commands",
      confidence: count >= 5 ? "high" : count >= 3 ? "medium" : "low",
      meta: { phrase, count, examples },
    });
  }

  return {
    suggestions,
    promptCount: prompts.length,
    stats: {
      repeated: repeated.length,
      corrections: corrections.length,
      commands: commands.length,
    },
  };
}
