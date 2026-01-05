// Wellness Integration Types
// Unified interface for biometric data from WHOOP, Oura, Apple Health, etc.

import type { CapacityImpact, IntegrationSignal } from '../types';

// =============================================================================
// UNIFIED WELLNESS DATA
// =============================================================================

/**
 * Normalized recovery data from any wellness provider
 */
export interface WellnessRecovery {
  score: number;              // 0-100 unified scale
  hrv?: number;               // Heart rate variability (ms)
  restingHeartRate?: number;  // BPM
  respiratoryRate?: number;   // Breaths per minute
  spo2?: number;              // Blood oxygen %
  skinTemp?: number;          // Celsius
  bodyBattery?: number;       // Garmin-style 0-100
  readinessScore?: number;    // Oura-style readiness
}

/**
 * Normalized sleep data from any wellness provider
 */
export interface WellnessSleep {
  duration: number;           // Total sleep in ms
  efficiency?: number;        // Sleep efficiency %
  performance?: number;       // How well you slept vs need

  stages?: {
    awake?: number;           // ms
    light?: number;           // ms
    deep?: number;            // ms (slow wave)
    rem?: number;             // ms
  };

  sleepScore?: number;        // 0-100 unified
  sleepDebt?: number;         // ms of accumulated debt
  consistency?: number;       // Schedule consistency %

  startTime: Date;
  endTime: Date;
}

/**
 * Normalized strain/activity data
 */
export interface WellnessStrain {
  score: number;              // 0-21 (WHOOP scale) or normalized
  calories?: number;          // kcal burned
  activeCalories?: number;    // Activity calories only
  steps?: number;
  distance?: number;          // meters

  heartRate?: {
    average?: number;
    max?: number;
    zones?: {
      zone1?: number;         // ms in each zone
      zone2?: number;
      zone3?: number;
      zone4?: number;
      zone5?: number;
    };
  };
}

/**
 * Normalized workout/activity
 */
export interface WellnessActivity {
  type: string;               // 'running', 'cycling', 'strength', etc.
  sportId?: number;           // Provider-specific sport ID

  startTime: Date;
  endTime: Date;
  duration: number;           // ms

  strain?: number;
  calories?: number;
  distance?: number;          // meters
  elevationGain?: number;     // meters

  heartRate?: {
    average?: number;
    max?: number;
  };

  // Provider-specific data
  raw?: Record<string, unknown>;
}

// =============================================================================
// PROVIDER INTERFACE
// =============================================================================

export type WellnessProviderType = 'whoop' | 'oura' | 'apple_health' | 'garmin' | 'fitbit';

export interface WellnessProvider {
  id: WellnessProviderType;
  name: string;
  icon: string;
  description: string;

  // Capabilities
  capabilities: {
    recovery: boolean;
    sleep: boolean;
    strain: boolean;
    activities: boolean;
    heartRate: boolean;
    spo2: boolean;
  };

  // Auth
  authType: 'oauth2' | 'api_key' | 'native';
  authConfig?: {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
  };

  // State
  isConnected: () => Promise<boolean>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;

  // Data fetching - returns normalized data
  getRecovery: (since?: Date) => Promise<WellnessRecovery[]>;
  getSleep: (since?: Date) => Promise<WellnessSleep[]>;
  getStrain: (since?: Date) => Promise<WellnessStrain[]>;
  getActivities: (since?: Date) => Promise<WellnessActivity[]>;
}

// =============================================================================
// CAPACITY CALCULATION
// =============================================================================

/**
 * Calculate capacity impact from normalized wellness data
 */
export function calculateCapacityFromWellness(
  recovery: WellnessRecovery | null,
  sleep: WellnessSleep | null
): CapacityImpact {
  // Default to moderate capacity if no data
  if (!recovery && !sleep) {
    return {
      physical: 70,
      cognitive: 70,
      emotional: 70,
      confidence: 0.3,
      note: 'No wellness data available',
    };
  }

  const recoveryScore = recovery?.score ?? 70;
  const sleepScore = sleep?.sleepScore ?? sleep?.performance ?? 70;
  const hrv = recovery?.hrv;

  // Physical capacity primarily from recovery
  const physical = recoveryScore;

  // Cognitive capacity from sleep + HRV
  const hrvBonus = hrv ? Math.min(20, (hrv - 50) / 5) : 0;  // Bonus for high HRV
  const cognitive = Math.round(Math.min(100, sleepScore * 0.7 + recoveryScore * 0.3 + hrvBonus));

  // Emotional is blend of both
  const emotional = Math.round((physical + cognitive) / 2);

  // Generate contextual note
  let note = '';
  if (recoveryScore < 34) {
    note = 'Low recovery - body needs rest';
  } else if (recoveryScore < 67) {
    if (hrv && hrv > 80) {
      note = 'Moderate recovery but HRV is solid';
    } else {
      note = 'Moderate recovery - pace yourself';
    }
  } else {
    note = 'Good recovery - capacity available';
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
    confidence: recovery ? 0.9 : 0.5,
    note,
  };
}

// =============================================================================
// SIGNAL CONVERSION
// =============================================================================

/**
 * Convert normalized wellness data to IntegrationSignals
 */
export function wellnessToSignals(
  providerId: WellnessProviderType,
  data: {
    recovery?: WellnessRecovery[];
    sleep?: WellnessSleep[];
    strain?: WellnessStrain[];
    activities?: WellnessActivity[];
  }
): IntegrationSignal[] {
  const signals: IntegrationSignal[] = [];

  // Recovery signals
  if (data.recovery) {
    for (const r of data.recovery) {
      const matchingSleep = data.sleep?.find(s =>
        Math.abs(s.endTime.getTime() - new Date().getTime()) < 12 * 60 * 60 * 1000
      );

      signals.push({
        id: `${providerId}-recovery-${Date.now()}`,
        source: providerId,
        type: 'recovery',
        timestamp: new Date(),
        domain: 'health',
        data: {
          score: r.score,
          hrv: r.hrv,
          rhr: r.restingHeartRate,
          spo2: r.spo2,
          skinTemp: r.skinTemp,
          sleepPerformance: matchingSleep?.performance,
        },
        capacityImpact: calculateCapacityFromWellness(r, matchingSleep ?? null),
      });
    }
  }

  // Sleep signals
  if (data.sleep) {
    for (const s of data.sleep) {
      signals.push({
        id: `${providerId}-sleep-${s.endTime.getTime()}`,
        source: providerId,
        type: 'sleep',
        timestamp: s.endTime,
        domain: 'health',
        data: {
          duration: s.duration,
          performance: s.performance,
          efficiency: s.efficiency,
          consistency: s.consistency,
          stages: s.stages,
          sleepDebt: s.sleepDebt,
          sleepScore: s.sleepScore,
        },
      });
    }
  }

  // Strain signals
  if (data.strain) {
    for (const st of data.strain) {
      signals.push({
        id: `${providerId}-strain-${Date.now()}`,
        source: providerId,
        type: 'strain',
        timestamp: new Date(),
        domain: 'health',
        data: {
          strain: st.score,
          calories: st.calories,
          steps: st.steps,
          distance: st.distance,
          avgHR: st.heartRate?.average,
          maxHR: st.heartRate?.max,
        },
      });
    }
  }

  // Activity signals
  if (data.activities) {
    for (const a of data.activities) {
      signals.push({
        id: `${providerId}-activity-${a.startTime.getTime()}`,
        source: providerId,
        type: 'activity',
        timestamp: a.startTime,
        domain: 'sport',
        data: {
          type: a.type,
          duration: a.duration,
          strain: a.strain,
          calories: a.calories,
          distance: a.distance,
          elevationGain: a.elevationGain,
          avgHR: a.heartRate?.average,
          maxHR: a.heartRate?.max,
        },
      });
    }
  }

  return signals;
}
