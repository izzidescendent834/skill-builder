/**
 * LLM — Calls AI models to generate skills dynamically.
 *
 * Supports: Gemini (via Google AI), Anthropic, OpenAI, OpenRouter.
 * Reads API keys and model selection from config.
 * Falls back gracefully if no key is available.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { resolveKey, isVaultAvailable } from "./vault-client.mjs";

const CONFIG_PATH = join(homedir(), ".skill-builder/config.json");

function readConfig() {
  if (existsSync(CONFIG_PATH)) {
    try { return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")); }
    catch { return {}; }
  }
  return {};
}

/**
 * Resolve an API key — tries agent-vault first, falls back to config.
 */
async function resolveApiKey(provider, configKeys) {
  const keyMap = {
    google: "google",
    anthropic: "anthropic",
    openai: "openai",
    openrouter: "openrouter",
  };
  const keyName = keyMap[provider];
  if (!keyName) return configKeys[provider] || null;
  return resolveKey(keyName, configKeys);
}

/**
 * Model routing — maps config model names to API calls.
 */
const MODEL_ROUTES = {
  "claude-sonnet": { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  "gemini-pro": { provider: "google", model: "gemini-2.5-pro-preview-06-05" },
  "gemini-flash": { provider: "google", model: "gemini-2.0-flash" },
  "openrouter-auto": { provider: "openrouter", model: "openrouter/auto" },
  "gpt-4o-mini": { provider: "openai", model: "gpt-4o-mini" },
};

/**
 * Call an LLM with a prompt. Returns the text response.
 * Automatically routes to the right provider based on config.
 */
export async function callLlm(prompt, options = {}) {
  const config = readConfig();
  const modelName = options.model || config.analysisModel || "claude-sonnet";
  const route = MODEL_ROUTES[modelName];

  if (!route) {
    throw new Error(`Unknown model: ${modelName}. Available: ${Object.keys(MODEL_ROUTES).join(", ")}`);
  }

  const keys = config.keys || {};
  const maxRetries = options.retries ?? 2;

  // Check cache first
  const cacheKey = hashPrompt(prompt + modelName);
  const cached = getCache(cacheKey);
  if (cached) return cached;

  // Resolve API key — tries agent-vault first, falls back to config
  const apiKey = await resolveApiKey(route.provider, keys);

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let result;
      switch (route.provider) {
        case "google":
          result = await callGoogle(prompt, route.model, apiKey);
          break;
        case "anthropic":
          result = await callAnthropic(prompt, route.model, apiKey);
          break;
        case "openai":
          result = await callOpenai(prompt, route.model, apiKey);
          break;
        case "openrouter":
          result = await callOpenrouter(prompt, route.model, apiKey);
          break;
        default:
          throw new Error(`No provider for ${route.provider}`);
      }

      // Cache successful responses
      setCache(cacheKey, result);
      return result;
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s
        const delay = (attempt + 1) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

// ─── Simple in-memory + file cache ──────────────────────────────

const memCache = new Map();
const CACHE_DIR = join(homedir(), ".skill-builder/cache");
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function hashPrompt(str) {
  // Simple hash — good enough for cache keys
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return "llm_" + Math.abs(hash).toString(36);
}

function getCache(key) {
  // Memory first
  if (memCache.has(key)) return memCache.get(key);

  // Disk
  const path = join(CACHE_DIR, key + ".json");
  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      if (Date.now() - data.ts < CACHE_TTL) {
        memCache.set(key, data.content);
        return data.content;
      }
    } catch {}
  }
  return null;
}

function setCache(key, content) {
  memCache.set(key, content);
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(join(CACHE_DIR, key + ".json"), JSON.stringify({ ts: Date.now(), content }));
  } catch {}
}

/**
 * Check if any LLM is available (has a key configured).
 */
export function hasLlmAvailable() {
  const config = readConfig();
  const keys = config.keys || {};
  const modelName = config.analysisModel || "claude-sonnet";
  const route = MODEL_ROUTES[modelName];
  if (!route) return false;

  // Check config keys first
  switch (route.provider) {
    case "google": if (keys.google) return true; break;
    case "anthropic": if (keys.anthropic) return true; break;
    case "openai": if (keys.openai) return true; break;
    case "openrouter": if (keys.openrouter) return true; break;
  }

  // Check if vault might have keys (agent token in env = vault likely available)
  if (process.env.VAULT_ADMIN_TOKEN || process.env.VAULT_AGENT_TOKEN) return true;

  return false;
}

// ─── Provider implementations ───────────────────────────────────

async function callGoogle(prompt, model, apiKey) {
  if (!apiKey) throw new Error("Google API key not configured. Set it in Connections.");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callAnthropic(prompt, model, apiKey) {
  if (!apiKey) throw new Error("Anthropic API key not configured. Set it in Connections.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function callOpenai(prompt, model, apiKey) {
  if (!apiKey) throw new Error("OpenAI API key not configured. Set it in Connections.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callOpenrouter(prompt, model, apiKey) {
  if (!apiKey) throw new Error("OpenRouter API key not configured. Set it in Connections.");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model.replace("openrouter/", ""),
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
