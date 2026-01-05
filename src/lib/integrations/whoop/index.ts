// WHOOP Integration Plugin
// Syncs recovery, sleep, strain, and workout data

import type { CanopyPlugin, IntegrationSignal, OAuthConfig, CapacityImpact } from '../types';

// =============================================================================
// WHOOP API TYPES
// =============================================================================

interface WhoopRecovery {
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

interface WhoopSleep {
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

interface WhoopWorkout {
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

interface WhoopCycle {
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
  
  async getRecovery(since?: Date): Promise<WhoopRecovery[]> {
    const params: Record<string, string> = { limit: '25' };
    if (since) {
      params.start = since.toISOString();
    }
    
    const response = await this.fetch<{ records: WhoopRecovery[] }>('/recovery', params);
    return response.records;
  }
  
  async getSleep(since?: Date): Promise<WhoopSleep[]> {
    const params: Record<string, string> = { limit: '25' };
    if (since) {
      params.start = since.toISOString();
    }
    
    const response = await this.fetch<{ records: WhoopSleep[] }>('/activity/sleep', params);
    return response.records;
  }
  
  async getWorkouts(since?: Date): Promise<WhoopWorkout[]> {
    const params: Record<string, string> = { limit: '25' };
    if (since) {
      params.start = since.toISOString();
    }
    
    const response = await this.fetch<{ records: WhoopWorkout[] }>('/activity/workout', params);
    return response.records;
  }
  
  async getCycles(since?: Date): Promise<WhoopCycle[]> {
    const params: Record<string, string> = { limit: '25' };
    if (since) {
      params.start = since.toISOString();
    }
    
    const response = await this.fetch<{ records: WhoopCycle[] }>('/cycle', params);
    return response.records;
  }
}

const api = new WhoopAPI();

// =============================================================================
// CAPACITY CALCULATION
// =============================================================================

function recoveryToCapacity(recovery: WhoopRecovery, sleep?: WhoopSleep): CapacityImpact {
  const score = recovery.score.recovery_score;
  const hrv = recovery.score.hrv_rmssd_milli;
  const rhr = recovery.score.resting_heart_rate;
  
  // Sleep quality from sleep data if available
  const sleepPerformance = sleep?.score?.sleep_performance_percentage ?? 70;
  
  // Physical capacity primarily from recovery score
  const physical = score;
  
  // Cognitive capacity from sleep + HRV
  // High HRV is good for cognitive function
  const hrvNormalized = Math.min(100, (hrv / 100) * 100);  // Normalize assuming 100ms is excellent
  const cognitive = Math.round(sleepPerformance * 0.6 + hrvNormalized * 0.4);
  
  // Emotional capacity is blend
  const emotional = Math.round((physical + cognitive) / 2);
  
  // Generate contextual note
  let note = '';
  if (score < 34) {
    note = 'Red recovery - body needs rest';
  } else if (score < 67) {
    if (hrv > 80) {
      note = 'Yellow recovery but HRV is solid - might be adapting';
    } else {
      note = 'Yellow recovery - moderate load okay';
    }
  } else {
    note = 'Green recovery - good capacity today';
  }
  
  return {
    physical,
    cognitive,
    emotional,
    affects: {
      physicalExertion: Math.round(physical * 0.85 + cognitive * 0.15),
      cognitiveWork: Math.round(cognitive * 0.7 + physical * 0.3),
      emotionalLabor: Math.round((physical + cognitive) / 2),
      creativeWork: Math.round(cognitive * 0.6 + Math.min(physical, 80) * 0.4),
    },
    confidence: recovery.score.user_calibrating ? 0.6 : 0.9,
    note,
  };
}

// =============================================================================
// STORAGE HELPERS (uses Electron secure storage via secrets API)
// =============================================================================

const LAST_SYNC_KEY = 'canopy_whoop_last_sync';

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
// PLUGIN DEFINITION
// =============================================================================

export const whoopPlugin: CanopyPlugin = {
  id: 'whoop',
  name: 'WHOOP',
  description: 'Recovery, sleep, and strain tracking',
  icon: '💚',
  domains: ['health', 'sport'],
  category: 'health-fitness',

  // WHOOP is tied to your body - only one account needed
  multiInstance: false,

  authType: 'oauth2',
  authConfig: {
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    clientId: '', // Set from environment/config
    scopes: [
      'read:recovery',
      'read:sleep', 
      'read:workout',
      'read:cycles',
      'read:profile',
    ],
  },
  
  syncSchedule: {
    type: 'smart',
    activeHours: { start: 6, end: 22 },
    activeIntervalMs: 30 * 60 * 1000,     // 30 min during active hours
    inactiveIntervalMs: 4 * 60 * 60 * 1000, // 4 hours during inactive
    syncOnConnect: true,
    syncOnWake: true,
  },
  
  isConnected: async () => {
    const tokens = await getStoredTokens();
    if (!tokens) return false;
    api.setAccessToken(tokens.accessToken);
    return true;
  },
  
  connect: async () => {
    // Check if OAuth is available (Electron environment)
    if (typeof window === 'undefined' || !window.canopy?.oauth) {
      throw new Error('OAuth not available - requires Electron');
    }

    const config = whoopPlugin.authConfig!;

    // Get client ID from secrets (must be configured in settings)
    const clientId = await window.canopy.getSecret('whoop_client_id');
    if (!clientId) {
      throw new Error('WHOOP client ID not configured. Add it in Settings.');
    }

    try {
      // Start OAuth flow - opens popup window
      const { code } = await window.canopy.oauth.start('whoop', {
        authUrl: config.authUrl,
        clientId,
        scopes: config.scopes,
      });

      // Exchange code for tokens
      const result = await window.canopy.oauth.exchange('whoop', code, {
        tokenUrl: config.tokenUrl,
        clientId,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      // Load the new access token
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
  
  getLastSync: async () => {
    return getLastSyncTime();
  },
  
  sync: async (since?: Date) => {
    const tokens = await getStoredTokens();
    if (!tokens) throw new Error('Not connected to WHOOP');
    
    api.setAccessToken(tokens.accessToken);
    
    const signals: IntegrationSignal[] = [];
    
    // Fetch recovery data
    try {
      const recoveries = await api.getRecovery(since);
      const sleeps = await api.getSleep(since);
      
      for (const recovery of recoveries) {
        // Find matching sleep
        const sleep = sleeps.find(s => s.id === recovery.sleep_id);
        
        signals.push({
          id: `whoop-recovery-${recovery.cycle_id}`,
          source: 'whoop',
          type: 'recovery',
          timestamp: new Date(recovery.created_at),
          domain: 'health',
          data: {
            score: recovery.score.recovery_score,
            hrv: recovery.score.hrv_rmssd_milli,
            rhr: recovery.score.resting_heart_rate,
            spo2: recovery.score.spo2_percentage,
            skinTemp: recovery.score.skin_temp_celsius,
            sleepPerformance: sleep?.score?.sleep_performance_percentage,
          },
          capacityImpact: recoveryToCapacity(recovery, sleep),
        });
      }
      
      // Sleep signals
      for (const sleep of sleeps) {
        if (sleep.nap) continue; // Skip naps for main sleep signal
        
        signals.push({
          id: `whoop-sleep-${sleep.id}`,
          source: 'whoop',
          type: 'sleep',
          timestamp: new Date(sleep.end),
          domain: 'health',
          data: {
            duration: sleep.score.stage_summary.total_in_bed_time_milli,
            performance: sleep.score.sleep_performance_percentage,
            efficiency: sleep.score.sleep_efficiency_percentage,
            consistency: sleep.score.sleep_consistency_percentage,
            respiratoryRate: sleep.score.respiratory_rate,
            stages: {
              light: sleep.score.stage_summary.total_light_sleep_time_milli,
              deep: sleep.score.stage_summary.total_slow_wave_sleep_time_milli,
              rem: sleep.score.stage_summary.total_rem_sleep_time_milli,
              awake: sleep.score.stage_summary.total_awake_time_milli,
            },
            sleepDebt: sleep.score.sleep_needed.need_from_sleep_debt_milli,
          },
        });
      }
    } catch (error) {
      console.error('Failed to fetch recovery/sleep:', error);
    }
    
    // Fetch workouts
    try {
      const workouts = await api.getWorkouts(since);
      
      for (const workout of workouts) {
        signals.push({
          id: `whoop-workout-${workout.id}`,
          source: 'whoop',
          type: 'activity',
          timestamp: new Date(workout.start),
          domain: 'sport',
          data: {
            strain: workout.score.strain,
            calories: Math.round(workout.score.kilojoule * 0.239),
            duration: new Date(workout.end).getTime() - new Date(workout.start).getTime(),
            avgHR: workout.score.average_heart_rate,
            maxHR: workout.score.max_heart_rate,
            distance: workout.score.distance_meter,
            sportId: workout.sport_id,
            zones: workout.score.zone_duration,
          },
        });
      }
    } catch (error) {
      console.error('Failed to fetch workouts:', error);
    }
    
    // Fetch daily strain
    try {
      const cycles = await api.getCycles(since);
      
      for (const cycle of cycles) {
        signals.push({
          id: `whoop-strain-${cycle.id}`,
          source: 'whoop',
          type: 'strain',
          timestamp: new Date(cycle.end || cycle.updated_at),
          domain: 'health',
          data: {
            strain: cycle.score.strain,
            calories: Math.round(cycle.score.kilojoule * 0.239),
            avgHR: cycle.score.average_heart_rate,
            maxHR: cycle.score.max_heart_rate,
          },
        });
      }
    } catch (error) {
      console.error('Failed to fetch cycles:', error);
    }
    
    await setLastSyncTime(new Date());
    
    return signals;
  },
};

// Export for registration
export default whoopPlugin;
