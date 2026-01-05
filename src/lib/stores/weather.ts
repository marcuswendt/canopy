// Weather store
// Fetches and caches weather data from Open-Meteo

import { writable, get } from 'svelte/store';

export interface WeatherData {
  location: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  condition: string;
  weatherCode: number;
}

interface WeatherState {
  data: WeatherData | null;
  loading: boolean;
  error: string | null;
  lastFetch: number;
}

const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

function createWeatherStore() {
  const { subscribe, set, update } = writable<WeatherState>({
    data: null,
    loading: false,
    error: null,
    lastFetch: 0,
  });

  let currentLocation: string | null = null;

  return {
    subscribe,

    async fetch(location: string): Promise<WeatherData | null> {
      if (!location) return null;

      const state = get({ subscribe });

      // Use cache if fresh and same location
      if (
        state.data &&
        currentLocation === location &&
        Date.now() - state.lastFetch < CACHE_DURATION_MS
      ) {
        return state.data;
      }

      // Check if Electron API available
      if (typeof window === 'undefined' || !window.canopy?.getWeather) {
        return null;
      }

      update(s => ({ ...s, loading: true, error: null }));
      currentLocation = location;

      try {
        const result = await window.canopy.getWeather(location);

        if (result.error) {
          update(s => ({ ...s, loading: false, error: result.error }));
          return null;
        }

        const data = result as WeatherData;
        set({
          data,
          loading: false,
          error: null,
          lastFetch: Date.now(),
        });

        return data;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        update(s => ({ ...s, loading: false, error: errorMessage }));
        return null;
      }
    },

    /**
     * Get cached weather or fetch if needed
     */
    async get(location: string): Promise<WeatherData | null> {
      return this.fetch(location);
    },

    /**
     * Format weather for display in context
     */
    formatForContext(data: WeatherData): string {
      return `${data.temperature}°C, ${data.condition}` +
        (data.windSpeed > 15 ? `, windy (${data.windSpeed} km/h)` : '');
    },
  };
}

export const weather = createWeatherStore();
