// Plugin Initialization
// Registers all plugins and sets up defaults on app start

import { registry, syncPlugin } from './registry';
import { timePlugin } from './time';
import { weatherPlugin } from './weather';
import { whoopPlugin } from './whoop';
import { googlePlugin } from './google';

// Default plugins that are always enabled (no auth required)
const DEFAULT_PLUGINS = ['time', 'weather'];

// All available plugins
// Note: "Health & Fitness" is a UI category, not a plugin
// Individual integrations (WHOOP, Oura, etc.) are registered separately
const ALL_PLUGINS = [timePlugin, weatherPlugin, whoopPlugin, googlePlugin];

/**
 * Initialize the plugin system
 * - Registers all plugins
 * - Loads saved states from database
 * - Enables default plugins if not configured
 * - Syncs default plugins
 */
export async function initializePlugins(): Promise<void> {
  // Check if we're in a browser with the Canopy API
  if (typeof window === 'undefined' || !window.canopy) {
    console.warn('Plugin initialization skipped: no Canopy API');
    return;
  }

  console.log('Initializing plugin system...');

  // Register all plugins
  for (const plugin of ALL_PLUGINS) {
    registry.register(plugin);
  }

  try {
    // Load saved plugin states from database
    const savedStates = await window.canopy.getAllPluginStates();
    const savedStateMap = new Map(savedStates.map((s) => [s.plugin_id, s]));

    // Enable defaults if not already configured
    for (const pluginId of DEFAULT_PLUGINS) {
      const saved = savedStateMap.get(pluginId);

      if (!saved) {
        // First run: enable default plugin
        await window.canopy.setPluginState({
          pluginId,
          enabled: true,
          connected: true,
        });
        registry.updateState(pluginId, { enabled: true, connected: true });
        console.log(`Enabled default plugin: ${pluginId}`);
      } else {
        // Restore saved state
        registry.updateState(pluginId, {
          enabled: saved.enabled,
          connected: saved.connected,
          lastSync: saved.last_sync || undefined,
          settings: saved.settings ? JSON.parse(saved.settings) : undefined,
        });
      }
    }

    // Restore states for non-default plugins
    for (const state of savedStates) {
      if (!DEFAULT_PLUGINS.includes(state.plugin_id)) {
        registry.updateState(state.plugin_id, {
          enabled: state.enabled,
          connected: state.connected,
          lastSync: state.last_sync || undefined,
          settings: state.settings ? JSON.parse(state.settings) : undefined,
        });
      }
    }

    // Initial sync for default plugins
    console.log('Running initial sync for default plugins...');
    await Promise.allSettled(DEFAULT_PLUGINS.map((id) => syncPlugin(id)));

    console.log('Plugin system initialized');
  } catch (error) {
    console.error('Failed to initialize plugins:', error);
  }
}

/**
 * Start automatic sync scheduling for enabled plugins
 */
export function startPluginScheduler(): () => void {
  const intervals: NodeJS.Timeout[] = [];

  for (const plugin of ALL_PLUGINS) {
    const schedule = plugin.syncSchedule;

    if (schedule.type === 'fixed' && schedule.intervalMs) {
      const interval = setInterval(async () => {
        const state = registry.get(plugin.id);
        if (state) {
          try {
            await syncPlugin(plugin.id);
          } catch (error) {
            console.warn(`Scheduled sync failed for ${plugin.id}:`, error);
          }
        }
      }, schedule.intervalMs);

      intervals.push(interval);
    }

    // TODO: Implement smart scheduling based on active hours
  }

  // Return cleanup function
  return () => {
    intervals.forEach(clearInterval);
  };
}

/**
 * Get list of available integrations for UI
 */
export function getAvailableIntegrations() {
  return ALL_PLUGINS.filter((p) => p.authType !== 'none').map((plugin) => ({
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    icon: plugin.icon,
    domains: plugin.domains,
    authType: plugin.authType,
  }));
}
