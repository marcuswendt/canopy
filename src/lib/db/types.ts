// Type definitions for Canopy database
// These match the SQLite schema and Electron IPC API

export interface Entity {
  id: string;
  type: 'person' | 'project' | 'domain' | 'concept' | 'event';
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
}

// Extend Window interface
declare global {
  interface Window {
    canopy: CanopyAPI;
  }
}
