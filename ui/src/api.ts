const BASE = '';

export const api = {
  getConfig: () => fetch(`${BASE}/api/config`).then(r => r.json()),
  saveConfig: (config: any) => fetch(`${BASE}/api/config`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(config) }).then(r => r.json()),
  scan: () => fetch(`${BASE}/api/scan`, { method: 'POST' }).then(r => r.json()),
  getSuggestions: (days = 7) => fetch(`${BASE}/api/suggestions?days=${days}`).then(r => r.json()),
  implement: (id: string) => fetch(`${BASE}/api/implement`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id }) }).then(r => r.json()),
  getInstalled: () => fetch(`${BASE}/api/installed`).then(r => r.json()),
  uninstall: (id: string) => fetch(`${BASE}/api/installed/${id}`, { method: 'DELETE' }).then(r => r.json()),
  generateMcp: (spec: any) => fetch(`${BASE}/api/mcp`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(spec) }).then(r => r.json()),
  saveMcp: (spec: any) => fetch(`${BASE}/api/mcp/save`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(spec) }).then(r => r.json()),
  health: () => fetch(`${BASE}/api/health`).then(r => r.json()).catch(() => ({ ok: false })),
  
  // Additional endpoints for UI wiring
  saveSkill: (id: string, content: string) => fetch(`${BASE}/api/skills/save`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id, content }) }).then(r => r.json()),
  addMcpConfig: (name: string) => fetch(`${BASE}/api/config/mcp`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name }) }).then(r => r.json()),
};
