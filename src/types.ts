/**
 * BrainDriveWhyDetector Types
 * Defines all types for the "Find Your Why" coaching flow
 */

// Session phases
export type SessionPhase = 
  | 'intro' 
  | 'snapshot' 
  | 'energy_map' 
  | 'deep_stories' 
  | 'patterns' 
  | 'statement' 
  | 'action'
  | 'completed';

export const PHASE_ORDER: SessionPhase[] = [
  'intro', 'snapshot', 'energy_map', 'deep_stories', 'patterns', 'statement', 'action', 'completed'
];

export const PHASE_LABELS: Record<SessionPhase, string> = {
  intro: 'Welcome',
  snapshot: 'Quick Snapshot',
  energy_map: 'Energy Mapping',
  deep_stories: 'Deep Stories',
  patterns: 'Patterns',
  statement: 'Your Why',
  action: 'Action Plan',
  completed: 'Complete'
};

// Chat message
export interface ChatMessage {
  id: string;
  sender: 'user' | 'coach';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  phase?: SessionPhase;
}

// Model info (same as BrainDriveChat)
export interface ModelInfo {
  name: string;
  provider: string;
  providerId: string;
  serverName: string;
  serverId: string;
}

// API Response
export interface ApiResponse {
  data?: any;
  status?: number;
  id?: string;
  [key: string]: any;
}

// Service interfaces (same as BrainDriveChat)
export interface ApiService {
  get: (url: string, options?: any) => Promise<ApiResponse>;
  post: (url: string, data: any, options?: any) => Promise<ApiResponse>;
  put: (url: string, data: any, options?: any) => Promise<ApiResponse>;
  delete: (url: string, options?: any) => Promise<ApiResponse>;
  postStreaming?: (url: string, data: any, onChunk: (chunk: string) => void, options?: any) => Promise<ApiResponse>;
}

export interface EventService {
  sendMessage: (target: string, message: any, options?: any) => void;
  subscribeToMessages: (target: string, callback: (message: any) => void) => void;
  unsubscribeFromMessages: (target: string, callback: (message: any) => void) => void;
}

export interface ThemeService {
  getCurrentTheme: () => string;
  addThemeChangeListener: (callback: (theme: string) => void) => void;
  removeThemeChangeListener: (callback: (theme: string) => void) => void;
}

export interface SettingsService {
  get: (key: string) => any;
  set: (key: string, value: any) => Promise<void>;
  getSetting?: (id: string) => Promise<any>;
  setSetting?: (id: string, value: any) => Promise<any>;
}

export interface PageContextService {
  getCurrentPageContext(): {
    pageId: string;
    pageName: string;
    pageRoute: string;
    isStudioPage: boolean;
  } | null;
  onPageContextChange(callback: (context: any) => void): () => void;
}

export interface Services {
  api?: ApiService;
  event?: EventService;
  theme?: ThemeService;
  settings?: SettingsService;
  pageContext?: PageContextService;
}

// Session data
export interface SessionData {
  energizers: string[];
  drainers: string[];
  stories: string[];
  patterns: string[];
  whyStatement: string;
  snapshot: {
    currentRole: string;
    likes: string[];
    dislikes: string[];
    desiredChange: string;
  } | null;
}

// Component props
export interface BrainDriveWhyDetectorProps {
  moduleId?: string;
  services: Services;
}

// Component state
export interface BrainDriveWhyDetectorState {
  messages: ChatMessage[];
  inputText: string;
  isLoading: boolean;
  error: string;
  currentTheme: string;
  selectedModel: ModelInfo | null;
  models: ModelInfo[];
  isLoadingModels: boolean;
  isStreaming: boolean;
  isInitializing: boolean;
  // Session state
  sessionStarted: boolean;
  currentPhase: SessionPhase;
  sessionData: SessionData;
  // UI state
  showPhaseIndicator: boolean;
}

// Crisis keywords for safety
export const CRISIS_KEYWORDS = [
  'suicide', 'kill myself', 'end my life', 'self-harm', 'hurt myself',
  'want to die', 'no reason to live', 'better off dead'
];

// Utility functions
export function generateId(prefix: string = 'msg'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
