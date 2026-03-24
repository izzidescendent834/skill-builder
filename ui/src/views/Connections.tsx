import { useState, useEffect } from 'react';
import { Key, Database, CheckCircle2, XCircle, Loader2, BrainCircuit } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../ToastContext';

type Source = {
  id: string;
  name: string;
  desc: string;
  auto?: boolean;
  requiresKey?: string;
  configKey?: string;
  configPlaceholder?: string;
};

const AVAILABLE_SOURCES: Source[] = [
  // Auto-detected (no config needed)
  { id: 'shell', name: 'Shell History', desc: 'zsh, bash, fish — repeated commands and sequences', auto: true },
  { id: 'git', name: 'Git Repos', desc: 'Commit patterns, co-changed files, branch workflows', auto: true },

  // AI conversation logs
  { id: 'claude-threads', name: 'Claude Code Threads', desc: 'Conversation logs from ~/.claude/', auto: true },
  { id: 'codex-sessions', name: 'Codex Sessions', desc: 'Conversation logs from ~/.codex/', auto: true },
  { id: 'gemini-cli', name: 'Gemini CLI History', desc: 'Conversation logs from Gemini CLI sessions', auto: true },

  // Productivity telemetry
  { id: 'cowork', name: 'Cowork.ai', desc: 'App usage, URLs, context switches, keystrokes', auto: false, configKey: 'telemetryDb', configPlaceholder: 'Path to cowork.db' },

  // Google
  { id: 'google-workspace', name: 'Google Workspace', desc: 'Gmail, Drive, Calendar, Meet transcripts, Admin audit logs', requiresKey: 'google' },

  // Microsoft
  { id: 'microsoft-365', name: 'Microsoft 365', desc: 'Outlook, Teams, OneDrive, SharePoint, Word docs', requiresKey: 'microsoft' },

  // Communication
  { id: 'slack', name: 'Slack', desc: 'Channels, DMs, threads — repeated questions and patterns', requiresKey: 'slack' },

  // CRM & Sales
  { id: 'hubspot', name: 'HubSpot', desc: 'Contacts, deals, emails, meeting notes, activity logs', requiresKey: 'hubspot' },
  { id: 'salesforce', name: 'Salesforce', desc: 'Accounts, opportunities, cases, email templates', requiresKey: 'salesforce' },

  // Browser
  { id: 'browser', name: 'Browser History', desc: 'Chrome, Arc, Firefox — frequently visited URLs', auto: false, configKey: 'browserHistoryPath', configPlaceholder: 'Path to Chrome History DB' },

  // Voice
  { id: 'voice', name: 'Voice Transcripts', desc: 'superwhisper, Otter.ai, or other voice-to-text', auto: false, configKey: 'voiceTranscriptPath', configPlaceholder: 'Path to transcripts folder' },
];

export default function Connections({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const { showToast } = useToast();

  const [keys, setKeys] = useState({
    anthropic: '', openrouter: '', openai: '', google: '', slack: '', github: '', microsoft: '', hubspot: '', salesforce: ''
  });
  const [sources, setSources] = useState<Record<string, boolean>>({});
  const [sourceConfigs, setSourceConfigs] = useState<Record<string, string>>({});
  const [analysisModel, setAnalysisModel] = useState('gemini-flash');

  useEffect(() => {
    api.getConfig()
      .then(res => {
        setKeys({
          anthropic: res.keys?.anthropic || '',
          openrouter: res.keys?.openrouter || '',
          openai: res.keys?.openai || '',
          google: res.keys?.google || '',
          slack: res.keys?.slack || '',
          github: res.keys?.github || '',
          microsoft: res.keys?.microsoft || '',
          hubspot: res.keys?.hubspot || '',
          salesforce: res.keys?.salesforce || ''
        });
        setSources(res.sources || {});
        setSourceConfigs(res.sourceConfigs || {});
        setAnalysisModel(res.analysisModel || 'gemini-flash');
      })
      .catch(err => showToast('Failed to load config. Is the backend running?', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const handleSaveKeys = async () => {
    setSaving(true);
    try {
      await api.saveConfig({ keys });
      showToast('API keys saved successfully', 'success');
    } catch (err) {
      showToast('Failed to save API keys', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setAnalysisModel(newModel);
    try {
      await api.saveConfig({ analysisModel: newModel });
      showToast('Analysis model updated', 'success');
    } catch (err) {
      showToast('Failed to save model', 'error');
    }
  };

  const handleConfigBlur = async () => {
    try {
      await api.saveConfig({ sourceConfigs });
      showToast('Source configuration saved', 'success');
    } catch (err) {
      showToast('Failed to save source config', 'error');
    }
  };

  const toggleSource = async (id: string) => {
    const newSources = { ...sources, [id]: !sources[id] };
    setSources(newSources);
    try {
      await api.saveConfig({ sources: newSources });
      showToast(`Source ${newSources[id] ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
      setSources(sources); // revert
      showToast('Failed to toggle source', 'error');
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await api.scan();
      showToast('Scan complete! Found new patterns.', 'success');
      onNavigate('discovery');
    } catch (err) {
      showToast('Scan failed', 'error');
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading connections...
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-5xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Connections</h1>
        <p className="text-zinc-400 text-sm max-w-2xl">
          Manage your local data sources and API keys. All data is analyzed locally on your machine.
          Keys are stored securely in <code className="text-zinc-300 bg-white/10 px-1.5 py-0.5 rounded">~/.skill-builder/config.json</code>.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column */}
        <div className="space-y-8">
          {/* API Keys */}
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-400" /> API Keys
            </h2>
            
            <div className="bg-[#111] border border-white/10 rounded-xl p-6 space-y-5 shadow-2xl">
              {[
                { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
                { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-...' },
                { id: 'openai', name: 'OpenAI', placeholder: 'sk-proj-...' },
                { id: 'google', name: 'Google (Gemini)', placeholder: 'AIza...' },
                { id: 'microsoft', name: 'Microsoft 365', placeholder: 'Bearer token or app credentials' },
                { id: 'slack', name: 'Slack Bot Token', placeholder: 'xoxb-...' },
                { id: 'github', name: 'GitHub Token', placeholder: 'ghp_...' },
                { id: 'hubspot', name: 'HubSpot', placeholder: 'pat-...' },
                { id: 'salesforce', name: 'Salesforce', placeholder: 'Bearer token or connected app credentials' },
              ].map((key) => {
                const val = keys[key.id as keyof typeof keys];
                const connected = val && val.length > 0;
                return (
                  <div key={key.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-zinc-300">{key.name}</label>
                      {connected ? (
                        <span className="text-xs text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Not Set
                        </span>
                      )}
                    </div>
                    <input 
                      type="password" 
                      placeholder={key.placeholder}
                      value={val}
                      onChange={(e) => setKeys({ ...keys, [key.id]: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                );
              })}
              
              <div className="pt-4 border-t border-white/10 flex justify-end">
                <button 
                  onClick={handleSaveKeys}
                  disabled={saving}
                  className="text-sm bg-white text-black hover:bg-zinc-200 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Keys
                </button>
              </div>
            </div>
          </div>

          {/* Analysis Model */}
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-purple-400" /> AI Model for Analysis
            </h2>
            <div className="bg-[#111] border border-white/10 rounded-xl p-6 shadow-2xl">
              <select 
                value={analysisModel}
                onChange={handleModelChange}
                className="w-full bg-black border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none"
              >
                <option value="gemini-flash">Gemini Flash (recommended — fast, cheap)</option>
                <option value="gemini-pro">Gemini Pro</option>
                <option value="claude-sonnet">Claude Sonnet</option>
                <option value="claude-haiku">Claude Haiku</option>
                <option value="gpt-4o-mini">GPT-4o-mini</option>
                <option value="openrouter-auto">OpenRouter Auto</option>
              </select>
              <p className="text-xs text-zinc-500 mt-3">
                Uses your API key for the selected provider. Gemini Flash recommended for best cost/speed ratio.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column - Data Sources */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" /> Local Data Sources
          </h2>
          
          <div className="bg-[#111] border border-white/10 rounded-xl p-2 shadow-2xl">
            {AVAILABLE_SOURCES.map((source, idx) => {
              const isActive = !!sources[source.id];
              const missingKey = source.requiresKey && !keys[source.requiresKey as keyof typeof keys];
              
              return (
                <div 
                  key={source.id} 
                  className={`p-4 flex flex-col gap-3 ${idx !== AVAILABLE_SOURCES.length - 1 ? 'border-b border-white/5' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-zinc-100">{source.name}</h3>
                      <p className="text-xs text-zinc-500 mt-0.5">{source.desc}</p>
                    </div>
                    
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {source.configKey && (
                        <input
                          type="text"
                          placeholder={source.configPlaceholder}
                          value={sourceConfigs[source.configKey] || ''}
                          onChange={(e) => setSourceConfigs({...sourceConfigs, [source.configKey!]: e.target.value})}
                          onBlur={handleConfigBlur}
                          className="w-48 bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                      )}
                      {source.auto ? (
                        <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Auto-detected
                        </span>
                      ) : missingKey ? (
                        <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded font-medium">
                          Requires {source.requiresKey} key
                        </span>
                      ) : (
                        <button 
                          onClick={() => toggleSource(source.id)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                            isActive ? 'bg-indigo-500' : 'bg-zinc-700'
                          }`}
                        >
                          <span 
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              isActive ? 'translate-x-4' : 'translate-x-1'
                            }`} 
                          />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button 
            onClick={handleScan}
            disabled={scanning}
            className="w-full text-sm bg-indigo-500 hover:bg-indigo-600 text-white py-3 rounded-xl font-medium transition-colors shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {scanning && <Loader2 className="w-4 h-4 animate-spin" />}
            {scanning ? 'Scanning...' : 'Scan All Enabled Sources'}
          </button>
        </div>
      </div>
    </div>
  );
}
