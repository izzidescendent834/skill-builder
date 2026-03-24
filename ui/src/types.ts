export type Suggestion = {
  id: string;
  name: string;
  description: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  aiAnalyzed: boolean;
  type: 'skill' | 'mcp';
  canImplement?: boolean;
  code?: string;
};

export type InstalledSkill = {
  id: string;
  name: string;
  installDate: string;
  path: string;
  code?: string;
};

export type Config = {
  keys: {
    anthropic?: string;
    openrouter?: string;
    openai?: string;
    google?: string;
    slack?: string;
    github?: string;
    microsoft?: string;
  };
  sources: Record<string, boolean>;
  sourceConfigs?: Record<string, string>;
  analysisModel?: string;
  analysisProfile?: string;
  customAnalysisPrompt?: string;
};
