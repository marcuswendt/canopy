// Canopy Integration System
// All plugins output normalized signals that the core system understands

// =============================================================================
// SIGNALS - The universal currency between plugins and core
// =============================================================================

export interface IntegrationSignal {
  id: string;
  source: string;           // 'wellness', 'whoop', 'oura', 'apple_health', 'strava', 'basecamp', 'google'
  type: SignalType;
  timestamp: Date;
  
  // What this affects
  domain?: 'health' | 'sport' | 'work' | 'family' | 'personal';
  entityIds?: string[];     // Related entities
  
  // The payload (type-specific)
  data: Record<string, any>;
  
  // For capacity calculation
  capacityImpact?: CapacityImpact;
}

export type SignalType = 
  // Health/Fitness (WHOOP, Strava, Withings)
  | 'recovery'              // Daily recovery score
  | 'sleep'                 // Sleep metrics
  | 'strain'                // Daily strain
  | 'activity'              // Workout/ride/run
  | 'hrv'                   // Heart rate variability
  | 'weight'                // Body metrics
  
  // Work (Basecamp, Notion, Gmail, Calendar)
  | 'task_created'
  | 'task_completed'
  | 'task_due'
  | 'message_received'
  | 'message_sent'
  | 'meeting_scheduled'
  | 'meeting_started'
  | 'document_created'
  | 'document_updated'
  | 'project_activity'
  
  // Generic
  | 'note'
  | 'event'
  | 'metric'
  | 'file_added';

// =============================================================================
// CAPACITY - Not prescriptive, context-aware
// =============================================================================

export interface CapacityImpact {
  // Raw values (0-100)
  physical?: number;
  cognitive?: number;
  emotional?: number;
  
  // What activities this affects (calculated from raw)
  affects?: {
    physicalExertion?: number;    // Heavily weighted by recovery/strain
    cognitiveWork?: number;       // Weighted by sleep quality
    emotionalLabor?: number;      // Both + recent patterns
    creativeWork?: number;        // Needs good sleep, moderate recovery
  };
  
  // Confidence in this reading
  confidence?: number;
  
  // Context for Ray
  note?: string;  // "Low recovery but high HRV - might be adaptation"
}

// =============================================================================
// PLUGIN INTERFACE
// =============================================================================

export interface CanopyPlugin {
  // Identity
  id: string;
  name: string;
  description: string;
  icon: string;
  domains: Array<'health' | 'sport' | 'work' | 'family' | 'personal' | 'productivity'>;

  // UI Category (for settings grouping)
  category?: 'health-fitness' | 'productivity' | 'context';

  // Multi-instance support
  // When true, users can connect multiple accounts (e.g., multiple Google accounts)
  // When false or undefined, only one connection is allowed (e.g., WHOOP)
  multiInstance?: boolean;

  // Auth
  authType: 'oauth2' | 'api_key' | 'none';
  authConfig?: OAuthConfig;
  
  // State
  isConnected: () => Promise<boolean>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  
  // Sync
  sync: (since?: Date) => Promise<IntegrationSignal[]>;
  getLastSync: () => Promise<Date | null>;
  
  // Scheduling
  syncSchedule: SyncSchedule;
  
  // Optional: Real-time updates
  subscribe?: (callback: (signal: IntegrationSignal) => void) => () => void;
  
  // Optional: Entity extraction
  extractEntities?: (signals: IntegrationSignal[]) => EntitySuggestion[];
  
  // Optional: Settings UI
  settingsComponent?: string;  // Svelte component path

  // Optional: Get account info for multi-instance plugins
  // Returns the account identifier (e.g., email for Google, workspace name for Notion)
  getAccountInfo?: () => Promise<{ id: string; label: string } | null>;
}

export interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes: string[];
  redirectUri?: string;
  // clientSecret stored in ~/.canopy/secrets
}

export interface SyncSchedule {
  type: 'fixed' | 'smart';
  
  // For fixed
  intervalMs?: number;
  
  // For smart
  activeHours?: { start: number; end: number };  // e.g., { start: 6, end: 22 }
  activeIntervalMs?: number;    // During active hours
  inactiveIntervalMs?: number;  // During inactive hours
  
  // Triggers
  syncOnConnect?: boolean;
  syncOnWake?: boolean;
}

export interface EntitySuggestion {
  name: string;
  type: 'person' | 'project' | 'company' | 'event' | 'concept';
  domain: 'health' | 'sport' | 'work' | 'family' | 'personal';
  confidence: number;         // 0-1
  source: string;             // Plugin ID or file path
  details?: Record<string, any>;
  imageUrl?: string;
}

// =============================================================================
// PLUGIN STATE (persisted)
// =============================================================================

export interface PluginState {
  pluginId: string;
  enabled: boolean;
  connected: boolean;
  lastSync: string | null;
  lastError: string | null;
  settings: Record<string, any>;

  // For multi-instance plugins: identifies which account this is
  // e.g., "marcus@field.io" for Google, "workspace_123" for Notion
  accountId?: string;
  accountLabel?: string;  // Display name: "marcus@field.io" or "Field Studio Workspace"

  // Instance ID for multi-instance plugins (pluginId remains "google", instanceId is unique)
  instanceId?: string;

  // Tokens stored separately in secure storage
}

// =============================================================================
// SYNC SERVICE EVENTS
// =============================================================================

export interface SyncEvent {
  type: 'sync_started' | 'sync_completed' | 'sync_failed' | 'signals_received';
  pluginId: string;
  timestamp: Date;
  data?: {
    signalCount?: number;
    error?: string;
    duration?: number;
  };
}

// =============================================================================
// CAPACITY CALCULATION HELPERS
// =============================================================================

export function calculateCapacity(signals: IntegrationSignal[]): CapacityImpact {
  // Get most recent signals by type
  const recovery = signals.find(s => s.type === 'recovery');
  const sleep = signals.find(s => s.type === 'sleep');
  const strain = signals.find(s => s.type === 'strain');
  
  const physical = recovery?.capacityImpact?.physical ?? 70;
  const cognitive = sleep?.data?.sleepScore ?? 70;
  const emotional = Math.round((physical + cognitive) / 2);  // Simplified
  
  return {
    physical,
    cognitive,
    emotional,
    affects: {
      // Physical exertion heavily depends on recovery
      physicalExertion: Math.round(physical * 0.8 + cognitive * 0.2),
      
      // Cognitive work depends more on sleep
      cognitiveWork: Math.round(cognitive * 0.7 + physical * 0.3),
      
      // Emotional labor needs both
      emotionalLabor: Math.round((physical + cognitive) / 2),
      
      // Creative work needs good sleep, moderate recovery fine
      creativeWork: Math.round(cognitive * 0.6 + Math.min(physical, 80) * 0.4),
    },
    confidence: recovery ? 0.9 : 0.5,
  };
}

/**
 * Determine if capacity should affect a given activity
 */
export function shouldFlagActivity(
  activity: 'call' | 'meeting' | 'workout' | 'creative' | 'conflict' | 'presentation',
  capacity: CapacityImpact
): { flag: boolean; reason?: string } {
  const affects = capacity.affects || {};
  
  switch (activity) {
    case 'call':
      // Calls are fine unless severely depleted
      return { flag: (affects.cognitiveWork ?? 70) < 40, reason: 'Very low cognitive capacity' };
      
    case 'meeting':
      // Meetings need moderate cognitive
      return { flag: (affects.cognitiveWork ?? 70) < 50, reason: 'Low cognitive capacity for focused discussion' };
      
    case 'workout':
      // Workouts heavily depend on physical
      if ((affects.physicalExertion ?? 70) < 50) {
        return { flag: true, reason: 'Low physical recovery - consider lighter session' };
      }
      return { flag: false };
      
    case 'creative':
      // Creative work needs good conditions
      if ((affects.creativeWork ?? 70) < 55) {
        return { flag: true, reason: 'Conditions not ideal for creative work' };
      }
      return { flag: false };
      
    case 'conflict':
    case 'presentation':
      // High-stakes emotional/cognitive
      if ((affects.emotionalLabor ?? 70) < 50) {
        return { flag: true, reason: 'Lower resilience today - consider timing' };
      }
      return { flag: false };
      
    default:
      return { flag: false };
  }
}
