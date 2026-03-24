/**
 * Shell Analyzer — Reads shell history and finds automation opportunities.
 *
 * Works with zsh_history and bash_history. No Cowork.ai needed.
 * Finds: repeated commands, command sequences, long pipelines,
 * and patterns that suggest skill creation.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const HISTORY_PATHS = [
  join(homedir(), ".zsh_history"),
  join(homedir(), ".bash_history"),
  join(homedir(), ".local/share/fish/fish_history"),
];

/**
 * Find and read shell history file.
 * Returns array of { command, timestamp? }
 */
export function readShellHistory(path) {
  const histPath = path || HISTORY_PATHS.find((p) => existsSync(p));
  if (!histPath) return { commands: [], path: null };

  const raw = readFileSync(histPath, "utf-8");
  const commands = [];

  if (histPath.includes("zsh_history")) {
    // zsh format: ": timestamp:0;command" or just "command"
    for (const line of raw.split("\n")) {
      const match = line.match(/^: (\d+):\d+;(.+)$/);
      if (match) {
        commands.push({ command: match[2].trim(), timestamp: parseInt(match[1]) * 1000 });
      } else if (line.trim() && !line.startsWith(":")) {
        commands.push({ command: line.trim(), timestamp: null });
      }
    }
  } else if (histPath.includes("fish_history")) {
    // fish format: "- cmd: command\n  when: timestamp"
    let current = null;
    for (const line of raw.split("\n")) {
      const cmdMatch = line.match(/^- cmd: (.+)$/);
      const whenMatch = line.match(/^\s+when: (\d+)$/);
      if (cmdMatch) {
        if (current) commands.push(current);
        current = { command: cmdMatch[1].trim(), timestamp: null };
      } else if (whenMatch && current) {
        current.timestamp = parseInt(whenMatch[1]) * 1000;
      }
    }
    if (current) commands.push(current);
  } else {
    // bash format: just commands, one per line
    for (const line of raw.split("\n")) {
      if (line.trim()) {
        commands.push({ command: line.trim(), timestamp: null });
      }
    }
  }

  return { commands, path: histPath };
}

/**
 * Find repeated commands (exact matches).
 */
export function findRepeatedCommands(commands, minCount = 3) {
  const counts = new Map();
  for (const { command } of commands) {
    // Normalize: collapse whitespace, strip trailing semicolons
    const normalized = command.replace(/\s+/g, " ").replace(/;+$/, "").trim();
    if (normalized.length < 5) continue; // skip trivial commands
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .map(([command, count]) => ({ command, count }));
}

/**
 * Find repeated command SEQUENCES (2-3 commands run in a row).
 * These are the best candidates for skill automation.
 */
export function findCommandSequences(commands, minCount = 2) {
  const sequences = new Map();

  // Look at pairs
  for (let i = 0; i < commands.length - 1; i++) {
    const a = commands[i].command.replace(/\s+/g, " ").trim();
    const b = commands[i + 1].command.replace(/\s+/g, " ").trim();
    if (a.length < 3 || b.length < 3) continue;

    // Only count as sequence if they happened within 60 seconds of each other
    // (or if we don't have timestamps)
    if (commands[i].timestamp && commands[i + 1].timestamp) {
      const gap = commands[i + 1].timestamp - commands[i].timestamp;
      if (gap > 60000 || gap < 0) continue;
    }

    const key = `${a} && ${b}`;
    sequences.set(key, (sequences.get(key) || 0) + 1);
  }

  // Look at triples
  for (let i = 0; i < commands.length - 2; i++) {
    const a = commands[i].command.replace(/\s+/g, " ").trim();
    const b = commands[i + 1].command.replace(/\s+/g, " ").trim();
    const c = commands[i + 2].command.replace(/\s+/g, " ").trim();
    if (a.length < 3 || b.length < 3 || c.length < 3) continue;

    if (commands[i].timestamp && commands[i + 2].timestamp) {
      const gap = commands[i + 2].timestamp - commands[i].timestamp;
      if (gap > 120000 || gap < 0) continue;
    }

    const key = `${a} && ${b} && ${c}`;
    sequences.set(key, (sequences.get(key) || 0) + 1);
  }

  return [...sequences.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .map(([sequence, count]) => ({ sequence, count }));
}

/**
 * Find parameterizable patterns — commands that differ only in one argument.
 * e.g., "git checkout -b feature/X" → potential "/new-branch <name>" skill
 */
export function findParameterizableCommands(commands, minCount = 3) {
  // Group commands by their "shape" (replace arguments with placeholders)
  const shapes = new Map();

  for (const { command } of commands) {
    // Simple heuristic: split by space, keep first 2-3 tokens as shape
    const parts = command.split(/\s+/);
    if (parts.length < 2) continue;

    // Shape: first N fixed tokens
    const shapes2 = parts.slice(0, 2).join(" ");
    const shapes3 = parts.length >= 3 ? parts.slice(0, 3).join(" ") : null;

    if (!shapes.has(shapes2)) shapes.set(shapes2, []);
    shapes.get(shapes2).push(command);

    if (shapes3) {
      if (!shapes.has(shapes3)) shapes.set(shapes3, []);
      shapes.get(shapes3).push(command);
    }
  }

  return [...shapes.entries()]
    .filter(([shape, cmds]) => {
      // Must have enough unique variations
      const unique = new Set(cmds);
      return unique.size >= minCount && shape.length > 5;
    })
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20)
    .map(([shape, cmds]) => ({
      pattern: shape,
      variations: [...new Set(cmds)].length,
      total: cmds.length,
      examples: [...new Set(cmds)].slice(0, 3),
    }));
}

/**
 * Generate a clean, readable skill name from a command string.
 * "git checkout -b feature/" → "git-checkout-branch"
 * "cd ~/Downloads/cowork-cua && python3 web.py" → "start-cowork-cua"
 * "npm run test && npm run build" → "test-and-build"
 */
function makeSkillName(command) {
  // Extract the meaningful parts
  const cleaned = command
    .replace(/&&/g, " ")
    .replace(/\|\|/g, " ")
    .replace(/;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned.split(" ");

  // Get the primary command (first non-path, non-flag token)
  const tokens = parts
    .map((p) => p.replace(/^[~./]+/, "")) // strip path prefixes
    .filter((p) => p && !p.startsWith("-") && p.length > 1) // skip flags and short tokens
    .map((p) => p.split("/").pop()) // just the last path component
    .filter((p) => p && p.length > 1)
    .slice(0, 3);

  if (tokens.length === 0) return "unnamed";

  return tokens
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "unnamed";
}

/**
 * Full shell analysis — returns suggestions ready for the suggester.
 */
export function analyzeShellHistory(historyPath) {
  const { commands, path } = readShellHistory(historyPath);
  if (!commands.length) return { suggestions: [], path, commandCount: 0 };

  const repeated = findRepeatedCommands(commands);
  const sequences = findCommandSequences(commands);
  const parameterizable = findParameterizableCommands(commands);

  const suggestions = [];

  // Repeated single commands → direct automation
  for (const { command, count } of repeated.slice(0, 5)) {
    const name = makeSkillName(command);
    suggestions.push({
      id: `run-${name}`,
      description: `Automate: \`${command.slice(0, 60)}\` (run ${count}x)`,
      signal: `Shell history: ${count} executions`,
      source: "shell_history",
      confidence: count >= 10 ? "high" : count >= 5 ? "medium" : "low",
      meta: { command, count },
    });
  }

  // Command sequences → workflow automation
  for (const { sequence, count } of sequences.slice(0, 5)) {
    const name = makeSkillName(sequence);
    suggestions.push({
      id: `do-${name}`,
      description: `Automate sequence: \`${sequence.slice(0, 80)}\` (${count}x)`,
      signal: `Shell sequence: ${count} repetitions`,
      source: "shell_sequence",
      confidence: count >= 5 ? "high" : "medium",
      meta: { sequence, count },
    });
  }

  // Parameterizable commands → templated skills
  for (const { pattern, variations, total, examples } of parameterizable.slice(0, 5)) {
    const name = makeSkillName(pattern);
    suggestions.push({
      id: `quick-${name}`,
      description: `Template: \`${pattern} <...>\` (${variations} variations, ${total} uses)`,
      signal: `${variations} variations of "${pattern}"`,
      source: "shell_template",
      confidence: variations >= 5 ? "medium" : "low",
      meta: { pattern, examples },
    });
  }

  return {
    suggestions,
    path,
    commandCount: commands.length,
    stats: {
      repeated: repeated.length,
      sequences: sequences.length,
      parameterizable: parameterizable.length,
    },
  };
}
