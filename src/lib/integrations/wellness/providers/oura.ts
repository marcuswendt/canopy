// Oura Ring Wellness Provider
// Implements WellnessProvider interface for Oura Ring data

import type {
  WellnessProvider,
  WellnessRecovery,
  WellnessSleep,
  WellnessStrain,
  WellnessActivity,
} from '../types';

// =============================================================================
// OURA API TYPES (for future implementation)
// =============================================================================

// Oura API v2 uses different structures
// See: https://cloud.ouraring.com/v2/docs

interface OuraReadinessRaw {
  id: string;
  day: string;
  score: number;
  temperature_deviation: number;
  activity_balance: number;
  body_temperature: number;
  hrv_balance: number;
  previous_day_activity: number;
  previous_night: number;
  recovery_index: number;
  resting_heart_rate: number;
  sleep_balance: number;
}

interface OuraSleepRaw {
  id: string;
  day: string;
  bedtime_start: string;
  bedtime_end: string;
  total_sleep_duration: number;
  awake_time: number;
  deep_sleep_duration: number;
  light_sleep_duration: number;
  rem_sleep_duration: number;
  efficiency: number;
  average_breath: number;
  average_heart_rate: number;
  lowest_heart_rate: number;
  score: number;
}

interface OuraActivityRaw {
  id: string;
  day: string;
  score: number;
  active_calories: number;
  steps: number;
  equivalent_walking_distance: number;
  high_activity_time: number;
  low_activity_time: number;
  medium_activity_time: number;
  sedentary_time: number;
}

// =============================================================================
// STORAGE HELPERS
// =============================================================================

async function getStoredTokens(): Promise<{ accessToken: string } | null> {
  if (typeof window === 'undefined' || !window.canopy?.getSecret) return null;

  const accessToken = await window.canopy.getSecret('oura_access_token');
  if (!accessToken) return null;
  return { accessToken };
}

async function clearTokens(): Promise<void> {
  if (typeof window === 'undefined' || !window.canopy?.deleteSecret) return;

  await window.canopy.deleteSecret('oura_access_token');
  await window.canopy.deleteSecret('oura_refresh_token');
}

// =============================================================================
// OURA PROVIDER
// =============================================================================

export const ouraProvider: WellnessProvider = {
  id: 'oura',
  name: 'Oura Ring',
  icon: '💍',
  description: 'Sleep, readiness, and activity from Oura Ring',

  capabilities: {
    recovery: true,    // Oura calls it "readiness"
    sleep: true,
    strain: false,     // Oura has activity score, not strain
    activities: true,  // Daily activity metrics
    heartRate: true,
    spo2: true,        // Gen 3 only
  },

  authType: 'oauth2',
  authConfig: {
    authUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    scopes: [
      'daily',
      'personal',
      'heartrate',
      'workout',
      'session',
    ],
  },

  isConnected: async () => {
    const tokens = await getStoredTokens();
    return !!tokens;
  },

  connect: async () => {
    if (typeof window === 'undefined' || !window.canopy?.oauth) {
      throw new Error('OAuth not available - requires Electron');
    }

    const config = ouraProvider.authConfig!;
    const clientId = await window.canopy.getSecret('oura_client_id');
    if (!clientId) {
      throw new Error('Oura client ID not configured. Add it in Settings.');
    }

    try {
      const { code } = await window.canopy.oauth.start('oura', {
        authUrl: config.authUrl,
        clientId,
        scopes: config.scopes,
      });

      const result = await window.canopy.oauth.exchange('oura', code, {
        tokenUrl: config.tokenUrl,
        clientId,
      });

      if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Oura OAuth failed:', error);
      throw error;
    }
  },

  disconnect: async () => {
    await clearTokens();
  },

  // TODO: Implement actual API calls
  getRecovery: async (_since?: Date): Promise<WellnessRecovery[]> => {
    const tokens = await getStoredTokens();
    if (!tokens) return [];

    // TODO: Implement Oura readiness API call
    // const response = await fetch('https://api.ouraring.com/v2/usercollection/daily_readiness', {
    //   headers: { Authorization: `Bearer ${tokens.accessToken}` }
    // });
    // const data = await response.json();
    // return data.data.map(normalizeReadiness);

    console.log('Oura getRecovery not yet implemented');
    return [];
  },

  getSleep: async (_since?: Date): Promise<WellnessSleep[]> => {
    const tokens = await getStoredTokens();
    if (!tokens) return [];

    // TODO: Implement Oura sleep API call
    // const response = await fetch('https://api.ouraring.com/v2/usercollection/daily_sleep', {
    //   headers: { Authorization: `Bearer ${tokens.accessToken}` }
    // });

    console.log('Oura getSleep not yet implemented');
    return [];
  },

  getStrain: async (_since?: Date): Promise<WellnessStrain[]> => {
    // Oura doesn't have strain concept, return empty
    return [];
  },

  getActivities: async (_since?: Date): Promise<WellnessActivity[]> => {
    const tokens = await getStoredTokens();
    if (!tokens) return [];

    // TODO: Implement Oura activity API call
    // const response = await fetch('https://api.ouraring.com/v2/usercollection/daily_activity', {
    //   headers: { Authorization: `Bearer ${tokens.accessToken}` }
    // });

    console.log('Oura getActivities not yet implemented');
    return [];
  },
};

export default ouraProvider;
