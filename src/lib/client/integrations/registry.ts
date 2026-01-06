// Plugin Registry
// Manages plugin registration, state, and lifecycle
// Supports multi-instance plugins (e.g., multiple Google accounts)

import type { CanopyPlugin, PluginState, IntegrationSignal, SyncEvent } from './types';
import { writable, derived, get } from 'svelte/store';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate a state key for plugin instance
 * Single-instance plugins: "google" -> "google"
 * Multi-instance plugins: "google" + "marcus@field.io" -> "google:marcus@field.io"
 */
function getStateKey(pluginId: string, instanceId?: string): string {
  return instanceId ? `${pluginId}:${instanceId}` : pluginId;
}

/**
 * Parse a state key back to pluginId and optional instanceId
 */
function parseStateKey(key: string): { pluginId: string; instanceId?: string } {
  const colonIndex = key.indexOf(':');
  if (colonIndex === -1) {
    return { pluginId: key };
  }
  return {
    pluginId: key.substring(0, colonIndex),
    instanceId: key.substring(colonIndex + 1),
  };
}

/**
 * Generate unique instance ID for multi-instance plugins
 */
function generateInstanceId(): string {
  return `inst_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// =============================================================================
// REGISTRY
// =============================================================================

class PluginRegistry {
  private plugins: Map<string, CanopyPlugin> = new Map();
  // State keys can be "pluginId" (single instance) or "pluginId:instanceId" (multi-instance)
  private stateStore = writable<Map<string, PluginState>>(new Map());
  private signalStore = writable<IntegrationSignal[]>([]);
  private eventStore = writable<SyncEvent[]>([]);
  
  // Register a plugin
  register(plugin: CanopyPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin ${plugin.id} already registered, replacing`);
    }
    this.plugins.set(plugin.id, plugin);
    
    // Initialize state if not exists
    this.stateStore.update(states => {
      if (!states.has(plugin.id)) {
        states.set(plugin.id, {
          pluginId: plugin.id,
          enabled: false,
          connected: false,
          lastSync: null,
          lastError: null,
          settings: {},
        });
      }
      return states;
    });
  }
  
  // Get a plugin by ID
  get(id: string): CanopyPlugin | undefined {
    return this.plugins.get(id);
  }
  
  // Get all registered plugins
  getAll(): CanopyPlugin[] {
    return Array.from(this.plugins.values());
  }
  
  // Get enabled plugins
  getEnabled(): CanopyPlugin[] {
    const states = get(this.stateStore);
    return this.getAll().filter(p => states.get(p.id)?.enabled);
  }
  
  // Get connected plugins
  getConnected(): CanopyPlugin[] {
    const states = get(this.stateStore);
    return this.getAll().filter(p => states.get(p.id)?.connected);
  }
  
  // Update plugin state (supports both single and multi-instance)
  updateState(pluginId: string, update: Partial<PluginState>, instanceId?: string): void {
    const key = getStateKey(pluginId, instanceId);
    this.stateStore.update(states => {
      const current = states.get(key);
      if (current) {
        states.set(key, { ...current, ...update });
      } else {
        // Create new state entry
        states.set(key, {
          pluginId,
          enabled: false,
          connected: false,
          lastSync: null,
          lastError: null,
          settings: {},
          instanceId,
          ...update,
        });
      }
      return states;
    });
  }

  // Get all instances of a plugin (for multi-instance plugins)
  getInstances(pluginId: string): PluginState[] {
    const states = get(this.stateStore);
    const instances: PluginState[] = [];

    for (const [key, state] of states.entries()) {
      const parsed = parseStateKey(key);
      if (parsed.pluginId === pluginId) {
        instances.push(state);
      }
    }

    return instances;
  }

  // Get state for a specific plugin/instance
  getState(pluginId: string, instanceId?: string): PluginState | undefined {
    const key = getStateKey(pluginId, instanceId);
    return get(this.stateStore).get(key);
  }

  // Remove a plugin instance (for disconnecting multi-instance plugins)
  removeInstance(pluginId: string, instanceId: string): void {
    const key = getStateKey(pluginId, instanceId);
    this.stateStore.update(states => {
      states.delete(key);
      return states;
    });
  }
  
  // Add signals
  addSignals(signals: IntegrationSignal[]): void {
    this.signalStore.update(current => {
      // Deduplicate by ID
      const existing = new Set(current.map(s => s.id));
      const newSignals = signals.filter(s => !existing.has(s.id));
      return [...current, ...newSignals].sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );
    });
  }
  
  // Add sync event
  addEvent(event: SyncEvent): void {
    this.eventStore.update(events => [event, ...events.slice(0, 99)]);
  }
  
  // Stores for reactive UI
  get states() { return this.stateStore; }
  get signals() { return this.signalStore; }
  get events() { return this.eventStore; }

  // Get recent signals (for inspector)
  getRecentSignals(limit: number = 50): IntegrationSignal[] {
    return get(this.signalStore).slice(0, limit);
  }
}

// Singleton
export const registry = new PluginRegistry();

// =============================================================================
// DERIVED STORES
// =============================================================================

export const allPlugins = derived(
  registry.states,
  () => registry.getAll()
);

export const enabledPlugins = derived(
  registry.states,
  () => registry.getEnabled()
);

export const connectedPlugins = derived(
  registry.states,
  () => registry.getConnected()
);

export const pluginStates = registry.states;
export const integrationSignals = registry.signals;
export const syncEvents = registry.events;

// Recent signals by type (wellness data from any provider)
export const recentRecovery = derived(
  registry.signals,
  ($signals) => $signals.find(s => s.type === 'recovery')
);

export const recentSleep = derived(
  registry.signals,
  ($signals) => $signals.find(s => s.type === 'sleep')
);

export const todayStrain = derived(
  registry.signals,
  ($signals) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return $signals.find(s =>
      s.type === 'strain' &&
      s.timestamp >= today
    );
  }
);

// Wellness signals (from any wellness provider: whoop, oura, apple_health)
const WELLNESS_SOURCES = ['whoop', 'oura', 'apple_health'];

export const wellnessRecovery = derived(
  registry.signals,
  ($signals) => $signals.find(s =>
    s.type === 'recovery' && WELLNESS_SOURCES.includes(s.source)
  )
);

export const wellnessSleep = derived(
  registry.signals,
  ($signals) => $signals.find(s =>
    s.type === 'sleep' && WELLNESS_SOURCES.includes(s.source)
  )
);

export const wellnessCapacity = derived(
  registry.signals,
  ($signals) => {
    const recovery = $signals.find(s =>
      s.type === 'recovery' && WELLNESS_SOURCES.includes(s.source)
    );
    return recovery?.capacityImpact ?? null;
  }
);

// Time & Weather signals (from default plugins)
export const recentTime = derived(
  registry.signals,
  ($signals) => $signals.find(s => s.source === 'time')
);

export const recentWeather = derived(
  registry.signals,
  ($signals) => $signals.find(s => s.source === 'weather')
);

// Calendar events (from Google plugin)
export const todayEvents = derived(
  registry.signals,
  ($signals) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return $signals
      .filter(s =>
        s.source === 'google' &&
        s.type === 'event' &&
        new Date(s.data.startTime) >= today &&
        new Date(s.data.startTime) < tomorrow
      )
      .sort((a, b) =>
        new Date(a.data.startTime).getTime() - new Date(b.data.startTime).getTime()
      );
  }
);

export const upcomingEvents = derived(
  registry.signals,
  ($signals) => {
    const now = new Date();
    return $signals
      .filter(s =>
        s.source === 'google' &&
        s.type === 'event' &&
        new Date(s.data.startTime) >= now
      )
      .sort((a, b) =>
        new Date(a.data.startTime).getTime() - new Date(b.data.startTime).getTime()
      )
      .slice(0, 10); // Next 10 events
  }
);

// Important emails (from Google plugin)
export const importantEmails = derived(
  registry.signals,
  ($signals) => $signals.filter(s =>
    s.source === 'google' &&
    s.type === 'message_received' &&
    s.data.isImportant
  ).slice(0, 5)
);

// =============================================================================
// PLUGIN ACTIONS
// =============================================================================

export async function enablePlugin(pluginId: string): Promise<void> {
  const plugin = registry.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  
  registry.updateState(pluginId, { enabled: true });
}

export async function disablePlugin(pluginId: string): Promise<void> {
  registry.updateState(pluginId, { enabled: false });
}

/**
 * Connect a plugin
 * For multi-instance plugins: returns the new instanceId
 * For single-instance plugins: connects without instanceId
 */
export async function connectPlugin(pluginId: string): Promise<string | undefined> {
  const plugin = registry.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

  // For single-instance plugins, check if already connected
  if (!plugin.multiInstance) {
    const existingState = registry.getState(pluginId);
    if (existingState?.connected) {
      throw new Error(`${plugin.name} is already connected`);
    }
  }

  // Generate instanceId for multi-instance plugins
  const instanceId = plugin.multiInstance ? generateInstanceId() : undefined;

  try {
    await plugin.connect();

    // Get account info for multi-instance plugins
    let accountId: string | undefined;
    let accountLabel: string | undefined;

    if (plugin.multiInstance && plugin.getAccountInfo) {
      const accountInfo = await plugin.getAccountInfo();
      if (accountInfo) {
        accountId = accountInfo.id;
        accountLabel = accountInfo.label;
      }
    }

    registry.updateState(pluginId, {
      connected: true,
      lastError: null,
      accountId,
      accountLabel,
      instanceId,
    }, instanceId);

    // Initial sync if configured
    if (plugin.syncSchedule.syncOnConnect) {
      await syncPlugin(pluginId, instanceId);
    }

    return instanceId;
  } catch (error) {
    registry.updateState(pluginId, {
      connected: false,
      lastError: error instanceof Error ? error.message : 'Connection failed',
    }, instanceId);
    throw error;
  }
}

/**
 * Disconnect a plugin instance
 * For multi-instance: removes the specific instance
 * For single-instance: disconnects the plugin
 */
export async function disconnectPlugin(pluginId: string, instanceId?: string): Promise<void> {
  const plugin = registry.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

  await plugin.disconnect();

  if (plugin.multiInstance && instanceId) {
    // Remove the specific instance
    registry.removeInstance(pluginId, instanceId);
  } else {
    // Single-instance: just update state
    registry.updateState(pluginId, { connected: false, accountId: undefined, accountLabel: undefined });
  }
}

/**
 * Sync a plugin instance
 */
export async function syncPlugin(pluginId: string, instanceId?: string): Promise<IntegrationSignal[]> {
  const plugin = registry.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

  const stateKey = instanceId ? `${pluginId}:${instanceId}` : pluginId;

  registry.addEvent({
    type: 'sync_started',
    pluginId: stateKey,
    timestamp: new Date(),
  });

  const startTime = Date.now();

  try {
    const lastSync = await plugin.getLastSync();
    const signals = await plugin.sync(lastSync ?? undefined);

    registry.addSignals(signals);
    registry.updateState(pluginId, {
      lastSync: new Date().toISOString(),
      lastError: null,
    }, instanceId);

    registry.addEvent({
      type: 'sync_completed',
      pluginId: stateKey,
      timestamp: new Date(),
      data: {
        signalCount: signals.length,
        duration: Date.now() - startTime,
      },
    });

    return signals;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Sync failed';
    registry.updateState(pluginId, { lastError: errorMessage }, instanceId);

    registry.addEvent({
      type: 'sync_failed',
      pluginId: stateKey,
      timestamp: new Date(),
      data: { error: errorMessage },
    });

    throw error;
  }
}

export async function syncAllEnabled(): Promise<void> {
  const plugins = registry.getConnected();
  await Promise.allSettled(
    plugins.map(p => syncPlugin(p.id))
  );
}
