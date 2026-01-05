// Plugin Registry
// Manages plugin registration, state, and lifecycle

import type { CanopyPlugin, PluginState, IntegrationSignal, SyncEvent } from './types';
import { writable, derived, get } from 'svelte/store';

// =============================================================================
// REGISTRY
// =============================================================================

class PluginRegistry {
  private plugins: Map<string, CanopyPlugin> = new Map();
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
    
    console.log(`Registered plugin: ${plugin.name}`);
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
  
  // Update plugin state
  updateState(pluginId: string, update: Partial<PluginState>): void {
    this.stateStore.update(states => {
      const current = states.get(pluginId);
      if (current) {
        states.set(pluginId, { ...current, ...update });
      }
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

// Recent signals by type
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

export async function connectPlugin(pluginId: string): Promise<void> {
  const plugin = registry.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  
  try {
    await plugin.connect();
    registry.updateState(pluginId, { connected: true, lastError: null });
    
    // Initial sync if configured
    if (plugin.syncSchedule.syncOnConnect) {
      await syncPlugin(pluginId);
    }
  } catch (error) {
    registry.updateState(pluginId, { 
      connected: false, 
      lastError: error instanceof Error ? error.message : 'Connection failed' 
    });
    throw error;
  }
}

export async function disconnectPlugin(pluginId: string): Promise<void> {
  const plugin = registry.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  
  await plugin.disconnect();
  registry.updateState(pluginId, { connected: false });
}

export async function syncPlugin(pluginId: string): Promise<IntegrationSignal[]> {
  const plugin = registry.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  
  registry.addEvent({
    type: 'sync_started',
    pluginId,
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
    });
    
    registry.addEvent({
      type: 'sync_completed',
      pluginId,
      timestamp: new Date(),
      data: {
        signalCount: signals.length,
        duration: Date.now() - startTime,
      },
    });
    
    return signals;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Sync failed';
    registry.updateState(pluginId, { lastError: errorMessage });
    
    registry.addEvent({
      type: 'sync_failed',
      pluginId,
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
