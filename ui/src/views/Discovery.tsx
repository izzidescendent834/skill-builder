import { useState, useEffect } from 'react';
import { Sparkles, Server, ArrowRight, Code2, Loader2, Check, Copy, BrainCircuit } from 'lucide-react';
import { api } from '../api';
import { Suggestion } from '../types';
import { useToast } from '../ToastContext';
import { motion, AnimatePresence } from 'motion/react';

const ANALYSIS_PROFILES = [
  { id: 'solo-founder', label: 'Solo Founder', desc: 'Finds: time sinks, context switching costs, tasks you keep doing manually that agents should handle, meeting prep shortcuts' },
  { id: 'team-lead', label: 'Team Lead', desc: 'Finds: onboarding gaps, repeated team questions, workflow bottlenecks across repos, knowledge that should be documented as skills' },
  { id: 'senior-ic', label: 'Senior IC', desc: 'Finds: repeated debugging patterns, test/build shortcuts, code review automation, environment setup that could be scripted' },
  { id: 'junior-dev', label: 'Junior Dev', desc: 'Finds: common errors and their fixes, commands you keep looking up, learning patterns, boilerplate you copy-paste' },
  { id: 'custom', label: 'Custom', desc: 'Write your own analysis prompt to guide the AI.' },
];

export default function Discovery({ onNavigate }: { onNavigate: (tab: string, context?: any) => void }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [installedCount, setInstalledCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const { showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [implementing, setImplementing] = useState(false);
  const [currentImplementation, setCurrentImplementation] = useState<{ id: string, content: string, path?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [analysisProfile, setAnalysisProfile] = useState('solo-founder');
  const [customPrompt, setCustomPrompt] = useState('');

  const loadData = async () => {
    try {
      const [suggs, inst, config] = await Promise.all([
        api.getSuggestions(7),
        api.getInstalled(),
        api.getConfig()
      ]);
      setSuggestions(suggs || []);
      setInstalledCount((inst || []).length);
      if (config.analysisProfile) setAnalysisProfile(config.analysisProfile);
      if (config.customAnalysisPrompt) setCustomPrompt(config.customAnalysisPrompt);
    } catch (err) {
      showToast('Failed to load discovery data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleProfileChange = async (profileId: string) => {
    setAnalysisProfile(profileId);
    try {
      await api.saveConfig({ analysisProfile: profileId });
    } catch (err) {
      showToast('Failed to save profile', 'error');
    }
  };

  const handleCustomPromptBlur = async () => {
    try {
      await api.saveConfig({ customAnalysisPrompt: customPrompt });
      showToast('Custom prompt saved', 'success');
    } catch (err) {
      showToast('Failed to save custom prompt', 'error');
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await api.scan();
      showToast('Scan complete', 'success');
      await loadData();
    } catch (err) {
      showToast('Scan failed', 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleBuild = async (suggestion: Suggestion) => {
    if (suggestion.type === 'mcp') {
      onNavigate('mcp-builder', suggestion);
      return;
    }

    setImplementing(true);
    setModalOpen(true);
    try {
      const res = await api.implement(suggestion.id);
      setCurrentImplementation({ id: suggestion.id, content: res.content, path: res.path });
    } catch (err) {
      showToast('Failed to generate implementation', 'error');
      setModalOpen(false);
    } finally {
      setImplementing(false);
    }
  };

  const handleInstall = async () => {
    if (!currentImplementation) return;
    try {
      await api.saveSkill(currentImplementation.id, currentImplementation.content);
      showToast('Skill installed successfully', 'success');
      setModalOpen(false);
      loadData();
    } catch (err) {
      showToast('Failed to install skill', 'error');
    }
  };

  const handleCopy = () => {
    if (!currentImplementation) return;
    navigator.clipboard.writeText(currentImplementation.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading insights...
      </div>
    );
  }

  const aiAnalyzedCount = suggestions.filter(s => s.aiAnalyzed).length;
  const activeProfileDesc = ANALYSIS_PROFILES.find(p => p.id === analysisProfile)?.desc;

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Discovery</h1>
        <p className="text-zinc-400 text-sm max-w-2xl">
          AI-analyzed patterns from your local workflows. We've identified repetitive tasks that can be automated as Skills or MCP Servers.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#111] border border-white/10 rounded-xl p-5 flex flex-col gap-2">
          <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Patterns Found</div>
          <div className="text-3xl font-semibold text-white">{suggestions.length}</div>
        </div>
        <div className="bg-[#111] border border-white/10 rounded-xl p-5 flex flex-col gap-2">
          <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider">AI Analyzed</div>
          <div className="text-3xl font-semibold text-white">{aiAnalyzedCount}</div>
        </div>
        <div className="bg-[#111] border border-white/10 rounded-xl p-5 flex flex-col gap-2">
          <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Installed Automations</div>
          <div className="text-3xl font-semibold text-emerald-400">{installedCount}</div>
        </div>
      </div>

      {/* Analysis Profile Selector */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <BrainCircuit className="w-4 h-4 text-indigo-400" /> Analysis Profile
        </div>
        <div className="flex flex-wrap gap-2">
          {ANALYSIS_PROFILES.map(profile => (
            <button
              key={profile.id}
              onClick={() => handleProfileChange(profile.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                analysisProfile === profile.id
                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-[#111] border border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'
              }`}
            >
              {profile.label}
            </button>
          ))}
        </div>
        
        <div className="bg-[#111] border border-white/10 rounded-xl p-4 mt-2">
          <p className="text-sm text-zinc-300">
            <span className="font-medium text-indigo-400">Active Profile: </span>
            {activeProfileDesc}
          </p>
          {analysisProfile === 'custom' && (
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              onBlur={handleCustomPromptBlur}
              placeholder="Enter your custom analysis prompt here..."
              className="mt-3 w-full h-24 bg-black border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
            />
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Top Suggestions</h2>
          <button 
            onClick={handleScan}
            disabled={scanning}
            className="text-sm text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Run Full Scan'} 
            {!scanning && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {suggestions.map((suggestion) => (
            <div 
              key={suggestion.id}
              className="group bg-[#111] border border-white/10 hover:border-white/20 rounded-xl p-6 transition-all duration-300 flex flex-col h-full"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    suggestion.type === 'skill' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                  }`}>
                    {suggestion.type === 'skill' ? <Code2 className="w-5 h-5" /> : <Server className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-base font-medium text-zinc-100">{suggestion.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-mono text-zinc-500 bg-white/5 px-2 py-0.5 rounded">
                        {suggestion.source}
                      </span>
                      {suggestion.aiAnalyzed && (
                        <span className="text-xs font-medium text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> AI Analyzed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <p className="text-sm text-zinc-400 leading-relaxed flex-1">
                {suggestion.description}
              </p>

              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    suggestion.confidence === 'high' ? 'bg-emerald-500' : 
                    suggestion.confidence === 'medium' ? 'bg-amber-500' : 'bg-zinc-500'
                  }`} />
                  <span className="text-xs text-zinc-500 capitalize">{suggestion.confidence} Confidence</span>
                </div>
                
                <button 
                  onClick={() => handleBuild(suggestion)}
                  className="text-sm bg-white text-black hover:bg-zinc-200 px-4 py-1.5 rounded-lg font-medium transition-colors"
                >
                  Build {suggestion.type === 'skill' ? 'Skill' : 'MCP'}
                </button>
              </div>
            </div>
          ))}
          {suggestions.length === 0 && (
            <div className="col-span-full py-12 text-center text-zinc-500 border border-dashed border-white/10 rounded-xl">
              No suggestions found. Try running a scan.
            </div>
          )}
        </div>
      </div>

      {/* Implementation Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#111] border border-white/10 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                <h3 className="text-lg font-medium text-white">Generated Implementation</h3>
                <button onClick={() => setModalOpen(false)} className="text-zinc-400 hover:text-white">
                  ✕
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 bg-[#0A0A0A]">
                {implementing ? (
                  <div className="flex flex-col items-center justify-center h-64 text-zinc-400 gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                    <p>Generating implementation via LLM...</p>
                  </div>
                ) : currentImplementation ? (
                  <pre className="text-sm text-zinc-300 font-mono whitespace-pre-wrap">
                    {currentImplementation.content}
                  </pre>
                ) : null}
              </div>

              <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex items-center justify-end gap-3">
                <button 
                  onClick={handleCopy}
                  disabled={implementing || !currentImplementation}
                  className="text-sm px-4 py-2 rounded-lg font-medium text-zinc-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button 
                  onClick={handleInstall}
                  disabled={implementing || !currentImplementation}
                  className="text-sm bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  Install Skill
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
