// Reference Plugin Registry
// Manages reference sources and coordinates searches

import { writable, derived, get } from 'svelte/store';
import type { 
  ReferencePlugin, 
  SearchResult, 
  ReferenceItem,
  SearchOptions,
  ReferenceContext,
} from './types';
import { 
  shouldSearchReferences, 
  buildSearchQuery, 
  formatReferenceContext,
} from './types';
import { notionPlugin } from './notion';
import { appleNotesPlugin } from './apple-notes';
import { gmailPlugin } from './gmail';

// =============================================================================
// REGISTRY
// =============================================================================

interface PluginState {
  enabled: boolean;
  connected: boolean;
  lastSearch: Date | null;
  lastError: string | null;
}

class ReferenceRegistry {
  private plugins: Map<string, ReferencePlugin> = new Map();
  private stateStore = writable<Map<string, PluginState>>(new Map());
  
  // Register a plugin
  register(plugin: ReferencePlugin): void {
    this.plugins.set(plugin.id, plugin);

    // Initialize state
    this.stateStore.update(states => {
      if (!states.has(plugin.id)) {
        states.set(plugin.id, {
          enabled: false,
          connected: false,
          lastSearch: null,
          lastError: null,
        });
      }
      return states;
    });
  }
  
  // Get plugin by ID
  get(id: string): ReferencePlugin | undefined {
    return this.plugins.get(id);
  }
  
  // Get all plugins
  getAll(): ReferencePlugin[] {
    return Array.from(this.plugins.values());
  }
  
  // Get connected plugins
  getConnected(): ReferencePlugin[] {
    const states = get(this.stateStore);
    return this.getAll().filter(p => states.get(p.id)?.connected);
  }
  
  // Update state
  updateState(pluginId: string, update: Partial<PluginState>): void {
    this.stateStore.update(states => {
      const current = states.get(pluginId);
      if (current) {
        states.set(pluginId, { ...current, ...update });
      }
      return states;
    });
  }
  
  get states() { return this.stateStore; }
}

export const referenceRegistry = new ReferenceRegistry();

// Register default plugins
referenceRegistry.register(notionPlugin);
referenceRegistry.register(appleNotesPlugin);
referenceRegistry.register(gmailPlugin);

// =============================================================================
// DERIVED STORES
// =============================================================================

export const referencePlugins = derived(
  referenceRegistry.states,
  () => referenceRegistry.getAll()
);

export const connectedReferences = derived(
  referenceRegistry.states,
  () => referenceRegistry.getConnected()
);

export const referenceStates = referenceRegistry.states;

// =============================================================================
// ACTIONS
// =============================================================================

export async function connectReference(pluginId: string): Promise<void> {
  const plugin = referenceRegistry.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  
  try {
    await plugin.connect();
    referenceRegistry.updateState(pluginId, { 
      connected: true, 
      enabled: true,
      lastError: null,
    });
  } catch (error) {
    referenceRegistry.updateState(pluginId, { 
      connected: false,
      lastError: error instanceof Error ? error.message : 'Connection failed',
    });
    throw error;
  }
}

export async function disconnectReference(pluginId: string): Promise<void> {
  const plugin = referenceRegistry.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  
  await plugin.disconnect();
  referenceRegistry.updateState(pluginId, { connected: false, enabled: false });
}

// =============================================================================
// SEARCH COORDINATION
// =============================================================================

/**
 * Search across all connected reference sources
 */
export async function searchReferences(
  query: string,
  options?: SearchOptions & { sources?: string[] }
): Promise<SearchResult[]> {
  const connected = referenceRegistry.getConnected();
  
  // Filter to specific sources if requested
  const plugins = options?.sources 
    ? connected.filter(p => options.sources!.includes(p.id))
    : connected;
  
  if (plugins.length === 0) {
    return [];
  }
  
  // Search all in parallel
  const results = await Promise.allSettled(
    plugins.map(async plugin => {
      try {
        const pluginResults = await plugin.search(query, options);
        referenceRegistry.updateState(plugin.id, { 
          lastSearch: new Date(),
          lastError: null,
        });
        return pluginResults;
      } catch (error) {
        referenceRegistry.updateState(plugin.id, { 
          lastError: error instanceof Error ? error.message : 'Search failed',
        });
        return [];
      }
    })
  );
  
  // Flatten and sort by date
  const allResults: SearchResult[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    }
  }
  
  return allResults.sort((a, b) => {
    const dateA = a.updatedAt?.getTime() || 0;
    const dateB = b.updatedAt?.getTime() || 0;
    return dateB - dateA;
  });
}

/**
 * Get a specific item from a reference source
 */
export async function getReferenceItem(
  pluginId: string,
  itemId: string
): Promise<ReferenceItem | null> {
  const plugin = referenceRegistry.get(pluginId);
  if (!plugin || !plugin.getItem) return null;
  
  return plugin.getItem(itemId);
}

// =============================================================================
// RAY INTEGRATION
// =============================================================================

/**
 * Gather reference context for Ray based on conversation
 * Returns relevant notes/pages that might inform the response
 */
export async function gatherReferenceContext(
  userMessage: string,
  entities: string[],
  entityTypes: string[]
): Promise<ReferenceContext> {
  // Check if we should search at all
  if (!shouldSearchReferences(userMessage, entities, entityTypes)) {
    return {
      searched: false,
      sources: [],
      results: [],
    };
  }
  
  // Check if any reference sources are connected
  const connected = referenceRegistry.getConnected();
  if (connected.length === 0) {
    return {
      searched: false,
      sources: [],
      results: [],
    };
  }
  
  // Build search query
  const query = buildSearchQuery(userMessage, entities, []);
  
  // Search with reasonable limits
  const results = await searchReferences(query, { limit: 5 });
  
  return formatReferenceContext(results);
}

/**
 * Format reference context for inclusion in Ray's prompt
 */
export function formatContextForPrompt(context: ReferenceContext): string {
  if (!context.searched || context.results.length === 0) {
    return '';
  }
  
  let prompt = `\n\nRelevant notes from your archives:\n`;
  
  for (const result of context.results.slice(0, 3)) {
    prompt += `\n[${result.title}] (${result.source}, ${formatDate(result.updatedAt)})\n`;
    prompt += `${result.snippet}\n`;
  }
  
  return prompt;
}

function formatDate(date?: Date): string {
  if (!date) return 'unknown date';
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

// =============================================================================
// SELECTIVE IMPORT (Pin specific notes as entities)
// =============================================================================

export interface PinnedReference {
  id: string;
  source: string;
  title: string;
  entityId?: string;  // Created Canopy entity
  pinnedAt: Date;
}

const pinnedStore = writable<PinnedReference[]>([]);

export const pinnedReferences = { subscribe: pinnedStore.subscribe };

/**
 * Pin a reference item to create a Canopy entity from it
 */
export async function pinReference(
  pluginId: string,
  itemId: string,
  domain: string
): Promise<PinnedReference | null> {
  const item = await getReferenceItem(pluginId, itemId);
  if (!item) return null;
  
  const pinned: PinnedReference = {
    id: `${pluginId}:${itemId}`,
    source: pluginId,
    title: item.title,
    pinnedAt: new Date(),
  };
  
  // In production, this would create a Canopy entity
  // and store the reference link
  
  pinnedStore.update(pins => [...pins, pinned]);
  
  return pinned;
}

export function unpinReference(id: string): void {
  pinnedStore.update(pins => pins.filter(p => p.id !== id));
}
