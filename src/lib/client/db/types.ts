// Type definitions for Canopy database
// These match the SQLite schema and Electron IPC API

export interface Entity {
  id: string;
  type: 'person' | 'project' | 'domain' | 'concept' | 'event' | 'goal' | 'focus';
  name: string;
  domain: 'work' | 'family' | 'sport' | 'personal' | 'health';
  description?: string;
  image_path?: string;
  icon?: string;
  metadata?: string; // JSON string
  created_at: string;
  updated_at: string;
  last_mentioned?: string;
}

export interface Relationship {
  id: string;
  source_id: string;
  target_id: string;
  type: 'belongs_to' | 'related_to' | 'mentioned_with' | 'parent_of';
  weight: number;
  metadata?: string;
  created_at: string;
}

export interface Capture {
  id: string;
  content: string;
  source: 'manual' | 'voice' | 'import';
  entities?: string; // JSON array
  domains?: string;  // JSON array
  metadata?: string;
  created_at: string;
}

export interface Thread {
  id: string;
  title?: string;
  domains?: string;    // JSON array
  entity_ids?: string; // JSON array
  message_count: number;
  summary?: string;      // Compacted conversation summary
  summary_up_to?: number; // Message index where summary ends
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  entities?: string; // JSON array
  metadata?: string;
  created_at: string;
}

export interface Memory {
  id: string;
  content: string;
  source_type?: 'capture' | 'thread' | 'manual';
  source_id?: string;
  entities?: string; // JSON array
  importance: number;
  tags?: string; // JSON array
  created_at: string;
  expires_at?: string;
}

export interface Artifact {
  id: string;
  title: string;
  type: 'plan' | 'note' | 'document' | 'code' | 'checklist';
  content: string;
  entities?: string; // JSON array of entity IDs
  domains?: string;  // JSON array
  pinned?: boolean;
  metadata?: string; // JSON - can store version history, etc.
  created_at: string;
  updated_at: string;
}

// Plugin state (persisted)
export interface PluginStateRow {
  plugin_id: string;
  enabled: boolean;
  connected: boolean;
  last_sync: string | null;
  settings: string | null; // JSON string
  created_at: string;
  updated_at: string;
}

// Signal row from database
export interface SignalRow {
  id: string;
  source: string;
  type: string;
  timestamp: string;
  domain: string | null;
  entity_ids: string | null; // JSON
  data: string; // JSON
  capacity_impact: string | null; // JSON
  processed: boolean;
  created_at: string;
}

// Suggestion row from database (Bonsai system)
export interface SuggestionRow {
  id: string;
  thread_id: string;
  message_id: string;
  type: string;
  status: string;
  data: string; // JSON
  created_at: string;
  expires_at: string | null;
}

// Electron API interface (exposed via preload)
export interface CanopyAPI {
  // Entities
  getEntities: () => Promise<Entity[]>;
  createEntity: (data: {
    type: Entity['type'];
    name: string;
    domain: Entity['domain'];
    description?: string;
    icon?: string;
  }) => Promise<Entity>;
  updateEntityMention: (entityId: string) => Promise<{ success: boolean }>;
  deleteEntity: (entityId: string) => Promise<{ success: boolean }>;
  
  // Relationships
  getRelationships: () => Promise<Relationship[]>;
  upsertRelationship: (data: {
    sourceId: string;
    targetId: string;
    type: Relationship['type'];
    weight?: number;
  }) => Promise<{ success: boolean }>;
  
  // Captures
  createCapture: (data: {
    content: string;
    source?: string;
    entities?: string[];
    domains?: string[];
  }) => Promise<Capture>;
  getRecentCaptures: (limit?: number) => Promise<Capture[]>;
  
  // Threads
  createThread: (title?: string) => Promise<Thread>;
  getRecentThreads: (limit?: number) => Promise<Thread[]>;
  updateThread: (data: {
    threadId: string;
    domains?: string[];
    entityIds?: string[];
  }) => Promise<{ success: boolean }>;
  
  // Messages
  addMessage: (data: {
    threadId: string;
    role: Message['role'];
    content: string;
    entities?: string[];
  }) => Promise<Message>;
  getThreadMessages: (threadId: string) => Promise<Message[]>;
  
  // Memories
  createMemory: (data: {
    content: string;
    sourceType?: string;
    sourceId?: string;
    entities?: string[];
    importance?: number;
  }) => Promise<Memory>;
  getMemories: (limit?: number) => Promise<Memory[]>;
  deleteMemory: (memoryId: string) => Promise<{ success: boolean }>;
  
  // Search
  search: (query: string) => Promise<{
    entities: Entity[];
    memories: Memory[];
  }>;

  // Suggestions (Bonsai system)
  addSuggestion: (data: {
    id: string;
    threadId: string;
    messageId: string;
    type: string;
    status?: string;
    data: Record<string, unknown>;
    expiresAt?: string;
  }) => Promise<{ success: boolean }>;
  getSuggestionsForThread: (threadId: string) => Promise<SuggestionRow[]>;
  updateSuggestionStatus: (id: string, status: string) => Promise<{ success: boolean }>;
  deleteSuggestion: (id: string) => Promise<{ success: boolean }>;
  cleanupExpiredSuggestions: () => Promise<{ success: boolean; deleted: number }>;

  // User Profile
  getUserProfile: () => Promise<{
    id: number;
    name: string | null;
    nickname: string | null;
    email: string | null;
    date_of_birth: string | null;
    location: string | null;
    created_at: string;
    updated_at: string;
  } | null>;
  setUserProfile: (data: {
    name?: string | null;
    nickname?: string | null;
    email?: string | null;
    dateOfBirth?: string | null;
    location?: string | null;
  }) => Promise<{ success: boolean }>;

  // Secrets
  getSecret: (key: string) => Promise<string | null>;
  setSecret: (key: string, value: string) => Promise<{ success: boolean }>;
  deleteSecret: (key: string) => Promise<{ success: boolean }>;

  // Artifacts
  getArtifacts: () => Promise<Artifact[]>;
  createArtifact: (data: {
    id?: string;
    title: string;
    type: Artifact['type'];
    content: string;
    entities?: string[];
    domains?: string[];
    pinned?: boolean;
    metadata?: Record<string, unknown>;
  }) => Promise<Artifact>;
  updateArtifact: (data: {
    id: string;
    title?: string;
    content?: string;
    pinned?: boolean;
    entities?: string[];
    domains?: string[];
    metadata?: Record<string, unknown>;
  }) => Promise<Artifact>;
  deleteArtifact: (id: string) => Promise<{ success: boolean }>;
  getArtifactsForEntities: (entityIds: string[]) => Promise<Artifact[]>;

  // Weather
  getWeather: (location: string) => Promise<{
    location: string;
    temperature: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    condition: string;
    weatherCode: number;
  } | { error: string }>;

  // Plugin State
  getPluginState: (pluginId: string) => Promise<PluginStateRow | null>;
  setPluginState: (data: {
    pluginId: string;
    enabled?: boolean;
    connected?: boolean;
    lastSync?: string;
    settings?: Record<string, unknown>;
  }) => Promise<{ success: boolean }>;
  getAllPluginStates: () => Promise<PluginStateRow[]>;

  // Database Management
  resetDatabase: () => Promise<{ success: boolean; error?: string }>;

  // Profile Management
  getProfile: () => Promise<{
    current: string;
    profiles: { id: string; label: string; builtIn: boolean }[];
  }>;
  createProfile: (label: string) => Promise<{ success: boolean; profileId?: string; error?: string }>;
  deleteProfile: (profileId: string) => Promise<{ success: boolean; error?: string }>;
  switchProfile: (profileId: string) => Promise<{ success: boolean; profile?: string; error?: string }>;

  // Signals
  addSignal: (data: {
    id: string;
    source: string;
    type: string;
    timestamp: string;
    domain?: string;
    entityIds?: string[];
    data: Record<string, unknown>;
    capacityImpact?: Record<string, unknown>;
  }) => Promise<{ success: boolean }>;
  addSignals: (signals: Array<{
    id: string;
    source: string;
    type: string;
    timestamp: string;
    domain?: string;
    entityIds?: string[];
    data: Record<string, unknown>;
    capacityImpact?: Record<string, unknown>;
  }>) => Promise<{ success: boolean }>;
  getSignals: (opts?: {
    source?: string;
    type?: string;
    since?: string;
    limit?: number;
  }) => Promise<SignalRow[]>;
  getLatestSignal: (source: string, type?: string) => Promise<SignalRow | null>;

  // URL Fetching
  fetchUrl: (url: string) => Promise<string | null>;

  // File Operations
  saveUpload: (id: string, filename: string, data: string) => Promise<{ success: boolean; path: string }>;
  getUploadPath: () => Promise<string>;
  getCanopyDir: () => Promise<string>;

  // App Events
  onToggleInspector: (callback: () => void) => () => void;
  onNavigate: (callback: (path: string) => void) => () => void;

  // OAuth
  oauth: {
    start: (pluginId: string, config: {
      authUrl: string;
      clientId: string;
      scopes: string[];
      redirectUri?: string;
      state?: string;
    }) => Promise<{ code: string; state?: string }>;
    exchange: (pluginId: string, code: string, config: {
      tokenUrl: string;
      clientId: string;
      clientSecret?: string;
      redirectUri?: string;
    }) => Promise<{ success: boolean; error?: string }>;
    refresh: (pluginId: string, config: {
      tokenUrl: string;
      clientId: string;
      clientSecret?: string;
    }) => Promise<{ success: boolean; accessToken?: string; error?: string }>;
  };
}

// Extend Window interface
declare global {
  interface Window {
    canopy: CanopyAPI;
  }
}
