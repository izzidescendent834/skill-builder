/**
 * Git Analyzer — Reads git history to find automation opportunities.
 *
 * Finds: repeated commit patterns, files that always change together,
 * common branch naming patterns, and pre/post-commit workflows.
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Check if we're in a git repo.
 */
function isGitRepo(cwd) {
  try {
    execSync("git rev-parse --is-inside-work-tree", { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get recent commit messages to find patterns.
 */
function getCommitMessages(cwd, days = 30) {
  try {
    const output = execSync(
      `git log --oneline --since="${days} days ago" --format="%s"`,
      { cwd, stdio: "pipe", encoding: "utf-8" }
    );
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Find files that always change together (co-change analysis).
 */
function findCoChanges(cwd, days = 30) {
  try {
    const output = execSync(
      `git log --since="${days} days ago" --name-only --format="" | sort | uniq -c | sort -rn`,
      { cwd, stdio: "pipe", encoding: "utf-8" }
    );
    return output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        if (!match) return null;
        return { file: match[2], changes: parseInt(match[1]) };
      })
      .filter(Boolean)
      .slice(0, 20);
  } catch {
    return [];
  }
}

/**
 * Find repeated commit message patterns.
 */
function findCommitPatterns(messages) {
  // Group by prefix (first 2-3 words)
  const prefixes = new Map();
  for (const msg of messages) {
    const words = msg.split(/\s+/).slice(0, 3).join(" ");
    if (words.length < 5) continue;
    if (!prefixes.has(words)) prefixes.set(words, []);
    prefixes.get(words).push(msg);
  }

  return [...prefixes.entries()]
    .filter(([, msgs]) => msgs.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([prefix, msgs]) => ({
      prefix,
      count: msgs.length,
      examples: [...new Set(msgs)].slice(0, 3),
    }));
}

/**
 * Find repos in common locations.
 */
function findRepos() {
  const candidates = [];
  const searchDirs = [
    process.cwd(),
    join(process.env.HOME || "", "Desktop/Code"),
    join(process.env.HOME || "", "code"),
    join(process.env.HOME || "", "projects"),
    join(process.env.HOME || "", "src"),
  ];

  for (const dir of searchDirs) {
    if (existsSync(dir) && isGitRepo(dir)) {
      candidates.push(dir);
    }
  }

  return [...new Set(candidates)];
}

/**
 * Full git analysis — returns suggestions.
 */
export function analyzeGitHistory(repoPath, days = 30) {
  const repos = repoPath ? [repoPath] : findRepos();
  const suggestions = [];

  for (const repo of repos) {
    if (!isGitRepo(repo)) continue;

    const messages = getCommitMessages(repo, days);
    const coChanges = findCoChanges(repo, days);
    const patterns = findCommitPatterns(messages);

    // Commit message patterns → workflow skills
    for (const { prefix, count, examples } of patterns.slice(0, 3)) {
      const name = prefix.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 25);
      suggestions.push({
        id: `git-${name}`,
        description: `Git workflow: "${prefix}..." (${count} commits)`,
        signal: `${count} commits matching "${prefix}" in ${repo.split("/").pop()}`,
        source: "git_history",
        confidence: count >= 10 ? "high" : count >= 5 ? "medium" : "low",
        meta: { prefix, examples, repo },
      });
    }

    // Hot files → monitoring skills
    const hotFiles = coChanges.filter((f) => f.changes >= 5);
    if (hotFiles.length > 0) {
      const repoName = repo.split("/").pop();
      suggestions.push({
        id: `hotfiles-${repoName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
        description: `Monitor hot files in ${repoName}: ${hotFiles.slice(0, 3).map((f) => f.file.split("/").pop()).join(", ")}`,
        signal: `${hotFiles.length} files with 5+ changes in ${days} days`,
        source: "git_cochange",
        confidence: "low",
        meta: { hotFiles: hotFiles.slice(0, 10), repo },
      });
    }
  }

  return { suggestions, repoCount: repos.length };
}
