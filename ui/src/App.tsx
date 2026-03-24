import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Wrench, 
  Server, 
  Settings2, 
  Sparkles
} from 'lucide-react';

import Discovery from './views/Discovery';
import SkillBuilder from './views/SkillBuilder';
import MCPBuilder from './views/MCPBuilder';
import Connections from './views/Connections';
import { ToastProvider } from './ToastContext';
import { api } from './api';

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState('discovery');
  const [navContext, setNavContext] = useState<any>(null);
  const [isHealthy, setIsHealthy] = useState(false);

  useEffect(() => {
    api.health()
      .then(res => setIsHealthy(res?.ok ?? false))
      .catch(() => setIsHealthy(false));
  }, []);

  const handleNavigate = (tab: string, context?: any) => {
    setActiveTab(tab);
    setNavContext(context || null);
  };

  const navItems = [
    { id: 'discovery', label: 'Discovery', icon: LayoutDashboard },
    { id: 'skill-builder', label: 'Skill Builder', icon: Wrench },
    { id: 'mcp-builder', label: 'MCP Builder', icon: Server },
    { id: 'connections', label: 'Connections', icon: Settings2 },
  ];

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-zinc-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/10 bg-[#0A0A0A] flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <div className="flex items-center gap-2 text-zinc-100 font-semibold tracking-tight">
            <div className="w-6 h-6 rounded bg-indigo-500/20 border border-indigo-500/50 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            Skill Builder
          </div>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive 
                    ? 'bg-white/10 text-white' 
                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <div className="text-xs text-zinc-400 font-medium">
              {isHealthy ? 'Local Engine Active' : 'Backend Unreachable'}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden bg-[#0A0A0A]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900/20 via-[#0A0A0A] to-[#0A0A0A] pointer-events-none" />
        
        <div className="h-full overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="min-h-full p-8 lg:p-12 max-w-6xl mx-auto"
            >
              {activeTab === 'discovery' && <Discovery onNavigate={handleNavigate} />}
              {activeTab === 'skill-builder' && <SkillBuilder />}
              {activeTab === 'mcp-builder' && <MCPBuilder context={navContext} />}
              {activeTab === 'connections' && <Connections onNavigate={handleNavigate} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
