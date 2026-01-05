// User settings store
// Stores user preferences like name and location

import { writable, get } from 'svelte/store';

export interface UserSettings {
  userName?: string;
  nickname?: string;
  dateOfBirth?: string;  // ISO date string
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
        const [userName, nickname, dateOfBirth, location] = await Promise.all([
          window.canopy.getSecret('user_name'),
          window.canopy.getSecret('user_nickname'),
          window.canopy.getSecret('user_dob'),
          window.canopy.getSecret('user_location'),
        ]);

        set({
          userName: userName || undefined,
          nickname: nickname || undefined,
          dateOfBirth: dateOfBirth || undefined,
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

    async setNickname(nickname: string) {
      if (typeof window !== 'undefined' && window.canopy?.setSecret) {
        await window.canopy.setSecret('user_nickname', nickname);
      }
      update(s => ({ ...s, nickname }));
    },

    async setDateOfBirth(dob: string) {
      if (typeof window !== 'undefined' && window.canopy?.setSecret) {
        await window.canopy.setSecret('user_dob', dob);
      }
      update(s => ({ ...s, dateOfBirth: dob }));
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

// Guess location from system timezone
export function guessLocation(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Map common timezones to friendly location names
    const timezoneMap: Record<string, string> = {
      'Pacific/Auckland': 'Auckland, New Zealand',
      'Pacific/Fiji': 'Fiji',
      'Australia/Sydney': 'Sydney, Australia',
      'Australia/Melbourne': 'Melbourne, Australia',
      'Australia/Brisbane': 'Brisbane, Australia',
      'Australia/Perth': 'Perth, Australia',
      'Asia/Tokyo': 'Tokyo, Japan',
      'Asia/Seoul': 'Seoul, South Korea',
      'Asia/Shanghai': 'Shanghai, China',
      'Asia/Hong_Kong': 'Hong Kong',
      'Asia/Singapore': 'Singapore',
      'Asia/Bangkok': 'Bangkok, Thailand',
      'Asia/Jakarta': 'Jakarta, Indonesia',
      'Asia/Kolkata': 'India',
      'Asia/Dubai': 'Dubai, UAE',
      'Europe/London': 'London, UK',
      'Europe/Paris': 'Paris, France',
      'Europe/Berlin': 'Berlin, Germany',
      'Europe/Amsterdam': 'Amsterdam, Netherlands',
      'Europe/Madrid': 'Madrid, Spain',
      'Europe/Rome': 'Rome, Italy',
      'Europe/Stockholm': 'Stockholm, Sweden',
      'Europe/Oslo': 'Oslo, Norway',
      'Europe/Copenhagen': 'Copenhagen, Denmark',
      'Europe/Helsinki': 'Helsinki, Finland',
      'Europe/Warsaw': 'Warsaw, Poland',
      'Europe/Prague': 'Prague, Czech Republic',
      'Europe/Vienna': 'Vienna, Austria',
      'Europe/Zurich': 'Zurich, Switzerland',
      'Europe/Dublin': 'Dublin, Ireland',
      'Europe/Lisbon': 'Lisbon, Portugal',
      'America/New_York': 'New York, USA',
      'America/Chicago': 'Chicago, USA',
      'America/Denver': 'Denver, USA',
      'America/Los_Angeles': 'Los Angeles, USA',
      'America/Phoenix': 'Phoenix, USA',
      'America/Anchorage': 'Alaska, USA',
      'Pacific/Honolulu': 'Hawaii, USA',
      'America/Toronto': 'Toronto, Canada',
      'America/Vancouver': 'Vancouver, Canada',
      'America/Mexico_City': 'Mexico City, Mexico',
      'America/Sao_Paulo': 'São Paulo, Brazil',
      'America/Buenos_Aires': 'Buenos Aires, Argentina',
      'America/Santiago': 'Santiago, Chile',
      'America/Bogota': 'Bogotá, Colombia',
      'America/Lima': 'Lima, Peru',
      'Africa/Cairo': 'Cairo, Egypt',
      'Africa/Johannesburg': 'Johannesburg, South Africa',
      'Africa/Lagos': 'Lagos, Nigeria',
      'Africa/Nairobi': 'Nairobi, Kenya',
    };

    if (timezoneMap[timezone]) {
      return timezoneMap[timezone];
    }

    // Fallback: extract city from timezone (e.g., "America/Los_Angeles" -> "Los Angeles")
    const parts = timezone.split('/');
    if (parts.length >= 2) {
      return parts[parts.length - 1].replace(/_/g, ' ');
    }

    return '';
  } catch {
    return '';
  }
}

export const userSettings = createSettingsStore();
