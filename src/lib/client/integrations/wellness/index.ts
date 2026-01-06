// Wellness Integration Plugin
// Aggregates biometric data from multiple providers (WHOOP, Oura, Apple Health)

import type { CanopyPlugin, IntegrationSignal } from '../types';
import type { WellnessProvider, WellnessProviderType } from './types';
import { wellnessToSignals, calculateCapacityFromWellness } from './types';

// Import providers
import { whoopProvider } from './providers/whoop';
import { ouraProvider } from './providers/oura';
import { appleHealthProvider } from './providers/apple-health';

// =============================================================================
// PROVIDER REGISTRY
// =============================================================================

const providers: Map<WellnessProviderType, WellnessProvider> = new Map([
  ['whoop', whoopProvider],
  ['oura', ouraProvider],
  ['apple_health', appleHealthProvider],
]);

// =============================================================================
// STORAGE
// =============================================================================

const LAST_SYNC_KEY = 'canopy_wellness_last_sync';
const ACTIVE_PROVIDERS_KEY = 'canopy_wellness_providers';

async function getActiveProviders(): Promise<WellnessProviderType[]> {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(ACTIVE_PROVIDERS_KEY);
  return stored ? JSON.parse(stored) : [];
}

async function setActiveProviders(providerIds: WellnessProviderType[]): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_PROVIDERS_KEY, JSON.stringify(providerIds));
}

async function getLastSyncTime(): Promise<Date | null> {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(LAST_SYNC_KEY);
  return stored ? new Date(stored) : null;
}

async function setLastSyncTime(date: Date): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_SYNC_KEY, date.toISOString());
}

// =============================================================================
// WELLNESS PLUGIN
// =============================================================================

export const wellnessPlugin: CanopyPlugin = {
  id: 'wellness',
  name: 'Wellness',
  description: 'Biometric data from WHOOP, Oura, Apple Health, and more',
  icon: '💚',
  domains: ['health', 'sport'],

  authType: 'none',  // Individual providers handle auth

  syncSchedule: {
    type: 'smart',
    activeHours: { start: 6, end: 22 },
    activeIntervalMs: 30 * 60 * 1000,      // 30 min during active hours
    inactiveIntervalMs: 4 * 60 * 60 * 1000, // 4 hours during inactive
    syncOnConnect: true,
    syncOnWake: true,
  },

  isConnected: async () => {
    const active = await getActiveProviders();
    if (active.length === 0) return false;

    // Check if at least one active provider is connected
    for (const providerId of active) {
      const provider = providers.get(providerId);
      if (provider && await provider.isConnected()) {
        return true;
      }
    }
    return false;
  },

  connect: async () => {
    // This is called when the plugin is enabled
    // Individual provider connections are handled separately
    console.log('Wellness plugin enabled. Connect individual providers in settings.');
  },

  disconnect: async () => {
    // Disconnect all active providers
    const active = await getActiveProviders();
    for (const providerId of active) {
      const provider = providers.get(providerId);
      if (provider) {
        try {
          await provider.disconnect();
        } catch (error) {
          console.error(`Failed to disconnect ${providerId}:`, error);
        }
      }
    }
    await setActiveProviders([]);
  },

  getLastSync: async () => {
    return getLastSyncTime();
  },

  sync: async (since?: Date) => {
    const signals: IntegrationSignal[] = [];
    const active = await getActiveProviders();

    for (const providerId of active) {
      const provider = providers.get(providerId);
      if (!provider) continue;

      const connected = await provider.isConnected();
      if (!connected) continue;

      try {
        // Fetch data from provider
        const [recovery, sleep, strain, activities] = await Promise.all([
          provider.getRecovery(since),
          provider.getSleep(since),
          provider.getStrain(since),
          provider.getActivities(since),
        ]);

        // Convert to signals
        const providerSignals = wellnessToSignals(providerId, {
          recovery,
          sleep,
          strain,
          activities,
        });

        signals.push(...providerSignals);
      } catch (error) {
        console.error(`Failed to sync ${providerId}:`, error);
      }
    }

    await setLastSyncTime(new Date());
    return signals;
  },
};

// =============================================================================
// PROVIDER MANAGEMENT API
// =============================================================================

/**
 * Get all available wellness providers
 */
export function getAvailableProviders(): WellnessProvider[] {
  return Array.from(providers.values());
}

/**
 * Get a specific provider by ID
 */
export function getProvider(id: WellnessProviderType): WellnessProvider | undefined {
  return providers.get(id);
}

/**
 * Connect a specific provider
 */
export async function connectProvider(id: WellnessProviderType): Promise<void> {
  const provider = providers.get(id);
  if (!provider) {
    throw new Error(`Unknown provider: ${id}`);
  }

  await provider.connect();

  // Add to active providers
  const active = await getActiveProviders();
  if (!active.includes(id)) {
    active.push(id);
    await setActiveProviders(active);
  }
}

/**
 * Disconnect a specific provider
 */
export async function disconnectProvider(id: WellnessProviderType): Promise<void> {
  const provider = providers.get(id);
  if (!provider) {
    throw new Error(`Unknown provider: ${id}`);
  }

  await provider.disconnect();

  // Remove from active providers
  const active = await getActiveProviders();
  const index = active.indexOf(id);
  if (index !== -1) {
    active.splice(index, 1);
    await setActiveProviders(active);
  }
}

/**
 * Check if a specific provider is connected
 */
export async function isProviderConnected(id: WellnessProviderType): Promise<boolean> {
  const provider = providers.get(id);
  if (!provider) return false;
  return provider.isConnected();
}

/**
 * Get the current capacity from wellness data
 */
export async function getCurrentCapacity(): Promise<{
  capacity: ReturnType<typeof calculateCapacityFromWellness>;
  source: WellnessProviderType | null;
}> {
  const active = await getActiveProviders();

  for (const providerId of active) {
    const provider = providers.get(providerId);
    if (!provider) continue;

    const connected = await provider.isConnected();
    if (!connected) continue;

    try {
      const [recovery, sleep] = await Promise.all([
        provider.getRecovery(),
        provider.getSleep(),
      ]);

      if (recovery.length > 0 || sleep.length > 0) {
        return {
          capacity: calculateCapacityFromWellness(
            recovery[0] ?? null,
            sleep[0] ?? null
          ),
          source: providerId,
        };
      }
    } catch {
      continue;
    }
  }

  // No data available
  return {
    capacity: calculateCapacityFromWellness(null, null),
    source: null,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { wellnessToSignals, calculateCapacityFromWellness } from './types';
export type {
  WellnessProvider,
  WellnessProviderType,
  WellnessRecovery,
  WellnessSleep,
  WellnessStrain,
  WellnessActivity,
} from './types';

export default wellnessPlugin;
