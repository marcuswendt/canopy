// System Plugin
// Provides system context: time, timezone, date, location
// Default plugin - always enabled

import type { CanopyPlugin, IntegrationSignal } from '../types';
import { userSettings, guessLocation } from '$lib/client/stores/settings';
import { get } from 'svelte/store';

// =============================================================================
// HELPERS
// =============================================================================

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function getFormattedTime(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getUserLocation(): string {
  const settings = get(userSettings);
  return settings.location || guessLocation();
}

// =============================================================================
// SYSTEM PLUGIN
// =============================================================================

export const timePlugin: CanopyPlugin = {
  // Identity
  id: 'time',
  name: 'System',
  description: 'Time, timezone, date, and location context',
  icon: '⚙',
  domains: ['personal'],
  category: 'context',

  // No auth needed - always enabled
  authType: 'none',

  // Sync every minute to keep time fresh
  syncSchedule: {
    type: 'fixed',
    intervalMs: 60 * 1000,
    syncOnConnect: true,
  },

  // Always connected (no external service)
  isConnected: async () => true,
  connect: async () => {},
  disconnect: async () => {},
  getLastSync: async () => new Date(),

  // Generate temporal signal with location
  sync: async (): Promise<IntegrationSignal[]> => {
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const location = getUserLocation();

    return [
      {
        id: `time-${now.toISOString()}`,
        source: 'time',
        type: 'event',
        timestamp: now,
        domain: 'personal',
        data: {
          hour: now.getHours(),
          minute: now.getMinutes(),
          formattedTime: getFormattedTime(),
          dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
          date: now.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }),
          timezone,
          timeOfDay: getTimeOfDay(),
          isWeekend: now.getDay() === 0 || now.getDay() === 6,
          location,
        },
      },
    ];
  },
};
