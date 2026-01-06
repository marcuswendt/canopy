// WHOOP Wellness Provider
// Implements WellnessProvider interface for WHOOP data

import type {
  WellnessProvider,
  WellnessRecovery,
  WellnessSleep,
  WellnessStrain,
  WellnessActivity,
} from '../types';

// =============================================================================
// WHOOP API TYPES (Raw API responses)
// =============================================================================

interface WhoopRecoveryRaw {
  cycle_id: number;
  sleep_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: string;
  score: {
    user_calibrating: boolean;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage: number;
    skin_temp_celsius: number;
  };
}

interface WhoopSleepRaw {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: string;
  score: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_no_data_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
      sleep_cycle_count: number;
      disturbance_count: number;
    };
    sleep_needed: {
      baseline_milli: number;
      need_from_sleep_debt_milli: number;
      need_from_recent_strain_milli: number;
      need_from_recent_nap_milli: number;
    };
    respiratory_rate: number;
    sleep_performance_percentage: number;
    sleep_consistency_percentage: number;
    sleep_efficiency_percentage: number;
  };
}

interface WhoopWorkoutRaw {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_id: number;
  score_state: string;
  score: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    percent_recorded: number;
    distance_meter: number;
    altitude_gain_meter: number;
    altitude_change_meter: number;
    zone_duration: {
      zone_zero_milli: number;
      zone_one_milli: number;
      zone_two_milli: number;
      zone_three_milli: number;
      zone_four_milli: number;
      zone_five_milli: number;
    };
  };
}

interface WhoopCycleRaw {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  score_state: string;
  score: {
    strain: number;
    kilojoule: number;
    average_heart_rate: number;
    max_heart_rate: number;
  };
}

// =============================================================================
// WHOOP API CLIENT
// =============================================================================

class WhoopAPI {
  private baseUrl = 'https://api.prod.whoop.com/developer/v1';
  private accessToken: string | null = null;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  private async fetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with WHOOP');
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('WHOOP authentication expired');
      }
      throw new Error(`WHOOP API error: ${response.status}`);
    }

    return response.json();
  }

  async getRecovery(since?: Date): Promise<WhoopRecoveryRaw[]> {
    const params: Record<string, string> = { limit: '25' };
    if (since) {
      params.start = since.toISOString();
    }

    const response = await this.fetch<{ records: WhoopRecoveryRaw[] }>('/recovery', params);
    return response.records;
  }

  async getSleep(since?: Date): Promise<WhoopSleepRaw[]> {
    const params: Record<string, string> = { limit: '25' };
    if (since) {
      params.start = since.toISOString();
    }

    const response = await this.fetch<{ records: WhoopSleepRaw[] }>('/activity/sleep', params);
    return response.records;
  }

  async getWorkouts(since?: Date): Promise<WhoopWorkoutRaw[]> {
    const params: Record<string, string> = { limit: '25' };
    if (since) {
      params.start = since.toISOString();
    }

    const response = await this.fetch<{ records: WhoopWorkoutRaw[] }>('/activity/workout', params);
    return response.records;
  }

  async getCycles(since?: Date): Promise<WhoopCycleRaw[]> {
    const params: Record<string, string> = { limit: '25' };
    if (since) {
      params.start = since.toISOString();
    }

    const response = await this.fetch<{ records: WhoopCycleRaw[] }>('/cycle', params);
    return response.records;
  }
}

const api = new WhoopAPI();

// =============================================================================
// STORAGE HELPERS
// =============================================================================

async function getStoredTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  if (typeof window === 'undefined' || !window.canopy?.getSecret) return null;

  const accessToken = await window.canopy.getSecret('whoop_access_token');
  const refreshToken = await window.canopy.getSecret('whoop_refresh_token');

  if (!accessToken) return null;
  return { accessToken, refreshToken: refreshToken || '' };
}

async function clearTokens(): Promise<void> {
  if (typeof window === 'undefined' || !window.canopy?.deleteSecret) return;

  await window.canopy.deleteSecret('whoop_access_token');
  await window.canopy.deleteSecret('whoop_refresh_token');
  await window.canopy.deleteSecret('whoop_expires_at');
}

// =============================================================================
// NORMALIZATION FUNCTIONS
// =============================================================================

function normalizeRecovery(raw: WhoopRecoveryRaw): WellnessRecovery {
  return {
    score: raw.score.recovery_score,
    hrv: raw.score.hrv_rmssd_milli,
    restingHeartRate: raw.score.resting_heart_rate,
    spo2: raw.score.spo2_percentage,
    skinTemp: raw.score.skin_temp_celsius,
  };
}

function normalizeSleep(raw: WhoopSleepRaw): WellnessSleep {
  const stages = raw.score.stage_summary;
  return {
    duration: stages.total_in_bed_time_milli - stages.total_awake_time_milli,
    efficiency: raw.score.sleep_efficiency_percentage,
    performance: raw.score.sleep_performance_percentage,
    sleepScore: raw.score.sleep_performance_percentage,
    consistency: raw.score.sleep_consistency_percentage,
    sleepDebt: raw.score.sleep_needed.need_from_sleep_debt_milli,
    stages: {
      awake: stages.total_awake_time_milli,
      light: stages.total_light_sleep_time_milli,
      deep: stages.total_slow_wave_sleep_time_milli,
      rem: stages.total_rem_sleep_time_milli,
    },
    startTime: new Date(raw.start),
    endTime: new Date(raw.end),
  };
}

function normalizeStrain(raw: WhoopCycleRaw): WellnessStrain {
  return {
    score: raw.score.strain,
    calories: Math.round(raw.score.kilojoule * 0.239),
    heartRate: {
      average: raw.score.average_heart_rate,
      max: raw.score.max_heart_rate,
    },
  };
}

function normalizeActivity(raw: WhoopWorkoutRaw): WellnessActivity {
  const zones = raw.score.zone_duration;
  return {
    type: getSportName(raw.sport_id),
    sportId: raw.sport_id,
    startTime: new Date(raw.start),
    endTime: new Date(raw.end),
    duration: new Date(raw.end).getTime() - new Date(raw.start).getTime(),
    strain: raw.score.strain,
    calories: Math.round(raw.score.kilojoule * 0.239),
    distance: raw.score.distance_meter,
    elevationGain: raw.score.altitude_gain_meter,
    heartRate: {
      average: raw.score.average_heart_rate,
      max: raw.score.max_heart_rate,
    },
    raw: {
      zones: {
        zone1: zones.zone_one_milli,
        zone2: zones.zone_two_milli,
        zone3: zones.zone_three_milli,
        zone4: zones.zone_four_milli,
        zone5: zones.zone_five_milli,
      },
    },
  };
}

// WHOOP sport ID mapping (subset)
function getSportName(sportId: number): string {
  const sports: Record<number, string> = {
    0: 'running',
    1: 'cycling',
    16: 'crossfit',
    43: 'strength',
    44: 'yoga',
    48: 'swimming',
    52: 'rowing',
    63: 'hiit',
    71: 'walking',
  };
  return sports[sportId] ?? 'workout';
}

// =============================================================================
// WHOOP PROVIDER
// =============================================================================

export const whoopProvider: WellnessProvider = {
  id: 'whoop',
  name: 'WHOOP',
  icon: '💚',
  description: 'Recovery, sleep, and strain tracking from WHOOP',

  capabilities: {
    recovery: true,
    sleep: true,
    strain: true,
    activities: true,
    heartRate: true,
    spo2: true,
  },

  authType: 'oauth2',
  authConfig: {
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    scopes: [
      'read:recovery',
      'read:sleep',
      'read:workout',
      'read:cycles',
      'read:profile',
    ],
  },

  isConnected: async () => {
    const tokens = await getStoredTokens();
    if (!tokens) return false;
    api.setAccessToken(tokens.accessToken);
    return true;
  },

  connect: async () => {
    if (typeof window === 'undefined' || !window.canopy?.oauth) {
      throw new Error('OAuth not available - requires Electron');
    }

    const config = whoopProvider.authConfig!;
    const clientId = await window.canopy.getSecret('whoop_client_id');
    if (!clientId) {
      throw new Error('WHOOP client ID not configured. Add it in Settings.');
    }

    try {
      const { code } = await window.canopy.oauth.start('whoop', {
        authUrl: config.authUrl,
        clientId,
        scopes: config.scopes,
      });

      const result = await window.canopy.oauth.exchange('whoop', code, {
        tokenUrl: config.tokenUrl,
        clientId,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      const accessToken = await window.canopy.getSecret('whoop_access_token');
      if (accessToken) {
        api.setAccessToken(accessToken);
      }
    } catch (error) {
      console.error('WHOOP OAuth failed:', error);
      throw error;
    }
  },

  disconnect: async () => {
    await clearTokens();
    api.setAccessToken('');
  },

  getRecovery: async (since?: Date): Promise<WellnessRecovery[]> => {
    const tokens = await getStoredTokens();
    if (!tokens) return [];
    api.setAccessToken(tokens.accessToken);

    const raw = await api.getRecovery(since);
    return raw.map(normalizeRecovery);
  },

  getSleep: async (since?: Date): Promise<WellnessSleep[]> => {
    const tokens = await getStoredTokens();
    if (!tokens) return [];
    api.setAccessToken(tokens.accessToken);

    const raw = await api.getSleep(since);
    // Filter out naps for main sleep data
    return raw.filter(s => !s.nap).map(normalizeSleep);
  },

  getStrain: async (since?: Date): Promise<WellnessStrain[]> => {
    const tokens = await getStoredTokens();
    if (!tokens) return [];
    api.setAccessToken(tokens.accessToken);

    const raw = await api.getCycles(since);
    return raw.map(normalizeStrain);
  },

  getActivities: async (since?: Date): Promise<WellnessActivity[]> => {
    const tokens = await getStoredTokens();
    if (!tokens) return [];
    api.setAccessToken(tokens.accessToken);

    const raw = await api.getWorkouts(since);
    return raw.map(normalizeActivity);
  },
};

export default whoopProvider;
