// Weather Plugin
// Provides local weather conditions
// Default plugin - always enabled

import type { CanopyPlugin, IntegrationSignal } from '../types';
import { userSettings, guessLocation } from '$lib/client/stores/settings';
import { get } from 'svelte/store';

// =============================================================================
// HELPERS
// =============================================================================

async function getUserLocation(): Promise<string> {
  // Try to get location from user settings
  const settings = get(userSettings);
  if (settings.location) {
    return settings.location;
  }

  // Fall back to guessing from timezone
  return guessLocation();
}

// =============================================================================
// WEATHER PLUGIN
// =============================================================================

export const weatherPlugin: CanopyPlugin = {
  // Identity
  id: 'weather',
  name: 'Weather',
  description: 'Local weather conditions for context-aware suggestions',
  icon: '🌤️',
  domains: ['personal'],
  category: 'context',

  // No auth needed (uses free Open-Meteo API) - always enabled
  authType: 'none',

  // Sync every 30 minutes
  syncSchedule: {
    type: 'fixed',
    intervalMs: 30 * 60 * 1000,
    syncOnConnect: true,
  },

  // Always connected (no external auth)
  isConnected: async () => true,
  connect: async () => {},
  disconnect: async () => {},
  getLastSync: async () => {
    // Could track this in plugin state, but weather is always fresh
    return new Date();
  },

  // Fetch weather and generate signal
  sync: async (): Promise<IntegrationSignal[]> => {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const location = await getUserLocation();
      if (!location) {
        return [];
      }

      let weather: WeatherData & { location: string; humidity: number; weatherCode: number };

      // Use Electron API if available, otherwise use web API
      if (window.canopy?.getWeather) {
        weather = await window.canopy.getWeather(location);
      } else {
        // Web mode: use API endpoint
        const response = await fetch(`/api/weather?location=${encodeURIComponent(location)}`);
        if (!response.ok) {
          console.warn('Weather fetch failed:', response.status);
          return [];
        }
        weather = await response.json();
      }

      if ('error' in weather) {
        console.warn('Weather fetch failed:', weather.error);
        return [];
      }

      const now = new Date();

      return [
        {
          id: `weather-${now.toISOString()}`,
          source: 'weather',
          type: 'event',
          timestamp: now,
          domain: 'personal',
          data: {
            location: weather.location,
            temperature: weather.temperature,
            feelsLike: weather.feelsLike,
            condition: weather.condition,
            humidity: weather.humidity,
            windSpeed: weather.windSpeed,
            weatherCode: weather.weatherCode,
            // Formatted string for quick context
            formatted: formatWeather(weather),
          },
        },
      ];
    } catch (error) {
      console.error('Weather plugin sync error:', error);
      return [];
    }
  },
};

// =============================================================================
// FORMATTING
// =============================================================================

interface WeatherData {
  temperature: number;
  condition: string;
  windSpeed: number;
}

function formatWeather(weather: WeatherData): string {
  let formatted = `${weather.temperature}°C, ${weather.condition}`;
  if (weather.windSpeed > 15) {
    formatted += `, windy (${weather.windSpeed} km/h)`;
  }
  return formatted;
}
