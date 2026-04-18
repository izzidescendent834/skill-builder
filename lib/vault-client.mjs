/**
 * Vault Client — Reads keys from agent-vault instead of config.json.
 *
 * If agent-vault is running on localhost, keys come from there.
 * Falls back to config.json if vault isn't available.
 */

const VAULT_URL = "http://127.0.0.1:3847";

/**
 * Check if agent-vault is running.
 */
export async function isVaultAvailable() {
  try {
    const res = await fetch(`${VAULT_URL}/v1/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Get a key from the vault.
 * @param {string} name - Key name or env var name
 * @param {string} token - Bearer token (admin or agent)
 */
export async function getKeyFromVault(name, token) {
  try {
    const res = await fetch(`${VAULT_URL}/v1/keys/${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Get all keys from vault as a map.
 */
export async function getAllKeysFromVault(token) {
  try {
    const res = await fetch(`${VAULT_URL}/v1/bootstrap`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;

    const text = await res.text();
    const keys = {};
    for (const line of text.split("\n")) {
      const match = line.match(/^export\s+([A-Z_]+)='(.+)'$/);
      if (match) {
        // Unescape single-quote escaping
        keys[match[1]] = match[2].replace(/'\\''/g, "'");
      }
    }
    return keys;
  } catch {
    return null;
  }
}

/**
 * Resolve a key — tries vault first, falls back to config.
 */
export async function resolveKey(keyName, configKeys = {}) {
  // Map friendly names to env var names
  const envVarMap = {
    anthropic: "ANTHROPIC_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    openai: "OPENAI_API_KEY",
    google: "GOOGLE_API_KEY",
    slack: "SLACK_BOT_TOKEN",
    github: "GITHUB_TOKEN",
  };

  const envVar = envVarMap[keyName] || keyName.toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_API_KEY";

  // Try vault first
  const vaultToken = process.env.VAULT_ADMIN_TOKEN || process.env.VAULT_AGENT_TOKEN;
  if (vaultToken) {
    const vaultValue = await getKeyFromVault(keyName, vaultToken) ||
                       await getKeyFromVault(envVar, vaultToken);
    if (vaultValue) return vaultValue;
  }

  // Fall back to config
  return configKeys[keyName] || process.env[envVar] || null;
}
