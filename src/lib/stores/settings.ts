// User settings store
// Stores user preferences like name and location

import { writable, get } from 'svelte/store';

export interface UserSettings {
  userName?: string;
  location?: string;
}

const defaultSettings: UserSettings = {};

function createSettingsStore() {
  const { subscribe, set, update } = writable<UserSettings>(defaultSettings);
  let loaded = false;

  return {
    subscribe,

    async load() {
      if (loaded) return;
      if (typeof window === 'undefined' || !window.canopy?.getSecret) {
        loaded = true;
        return;
      }

      try {
        const userName = await window.canopy.getSecret('user_name');
        const location = await window.canopy.getSecret('user_location');

        set({
          userName: userName || undefined,
          location: location || undefined,
        });
        loaded = true;
      } catch (error) {
        console.error('Failed to load user settings:', error);
      }
    },

    async setUserName(name: string) {
      if (typeof window !== 'undefined' && window.canopy?.setSecret) {
        await window.canopy.setSecret('user_name', name);
      }
      update(s => ({ ...s, userName: name }));
    },

    async setLocation(location: string) {
      if (typeof window !== 'undefined' && window.canopy?.setSecret) {
        await window.canopy.setSecret('user_location', location);
      }
      update(s => ({ ...s, location }));
    },

    get() {
      return get({ subscribe });
    },
  };
}

export const userSettings = createSettingsStore();
