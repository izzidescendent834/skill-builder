import { useState, useEffect } from 'react';
import { Code2, Play, Save, Check, Loader2, Trash2, Eye, Copy } from 'lucide-react';
import { api } from '../api';
import { Suggestion, InstalledSkill } from '../types';
import { useToast } from '../ToastContext';
import { motion, AnimatePresence } from 'motion/react';

export default function SkillBuilder() {
  const [available, setAvailable] = useState<Suggestion[]>([]);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [implementing, setImplementing] = useState(false);
  const [currentImplementation, setCurrentImplementation] = useState<{ id: string, content: string, path?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = async () => {
    try {
      const [suggs, inst] = await Promise.all([
        api.getSuggestions(7),
        api.getInstalled()
      ]);
      setAvailable((suggs || []).filter((s: Suggestion) => s.type === 'skill' && s.canImplement));
      setInstalled(inst || []);
    } catch (err) {
      showToast('Failed to load skills data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePreview = async (suggestion: Suggestion) => {
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

  const handleViewInstalled = (skill: InstalledSkill) => {
    setCurrentImplementation({ id: skill.id, content: skill.code || 'No code available', path: skill.path });
    setModalOpen(true);
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

  const handleUninstall = async (id: string) => {
    try {
      await api.uninstall(id);
      showToast('Skill uninstalled', 'success');
      loadData();
    } catch (err) {
      showToast('Failed to uninstall skill', 'error');
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
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading skills...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Skill Builder</h1>
        <p className="text-zinc-400 text-sm">
          Manage lightweight, single-purpose scripts or prompts that your AI agents can execute directly.
        </p>
      </header>

      <div className="space-y-6">
        <h2 className="text-xl font-medium text-white border-b border-white/10 pb-2">Available to Install</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {available.map(skill => (
            <div key={skill.id} className="bg-[#111] border border-white/10 rounded-xl p-5 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <Code2 className="w-4 h-4" />
                </div>
                <h3 className="font-medium text-white">{skill.name}</h3>
              </div>
              <p className="text-sm text-zinc-400 mb-4 flex-1">{skill.description}</p>
              <div className="flex gap-2 mt-auto">
                <button 
                  onClick={() => handlePreview(skill)}
                  className="flex-1 text-sm bg-white/5 hover:bg-white/10 text-white py-2 rounded-lg font-medium transition-colors border border-white/10"
                >
                  Preview
                </button>
                <button 
                  onClick={() => handlePreview(skill)} // In a real app, this might directly install without preview
                  className="flex-1 text-sm bg-white text-black hover:bg-zinc-200 py-2 rounded-lg font-medium transition-colors"
                >
                  Install
                </button>
              </div>
            </div>
          ))}
          {available.length === 0 && (
            <div className="col-span-full py-8 text-center text-zinc-500 border border-dashed border-white/10 rounded-xl">
              No new skills available to implement.
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6 pt-6">
        <h2 className="text-xl font-medium text-white border-b border-white/10 pb-2">Installed Skills</h2>
        <div className="space-y-3">
          {installed.map(skill => (
            <div key={skill.id} className="bg-[#111] border border-white/10 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-medium text-white">{skill.name}</h3>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">{skill.path}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleViewInstalled(skill)}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  title="View Source"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleUninstall(skill.id)}
                  className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Uninstall"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {installed.length === 0 && (
            <div className="py-8 text-center text-zinc-500 border border-dashed border-white/10 rounded-xl">
              No skills installed yet.
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
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
                <h3 className="text-lg font-medium text-white">Skill Source</h3>
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
                {/* Only show install if it's not already installed (we check if path exists as a proxy for installed state in this modal) */}
                {!currentImplementation?.path && (
                  <button 
                    onClick={handleInstall}
                    disabled={implementing || !currentImplementation}
                    className="text-sm bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    Install Skill
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
