// Apple Health Wellness Provider
// Implements WellnessProvider interface for Apple HealthKit data
// Requires native bridge via Electron (macOS only)

import type {
  WellnessProvider,
  WellnessRecovery,
  WellnessSleep,
  WellnessStrain,
  WellnessActivity,
} from '../types';

// =============================================================================
// HEALTHKIT DATA TYPES
// =============================================================================

// HealthKit uses specific type identifiers
// See: https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier

interface HealthKitSleepAnalysis {
  startDate: string;
  endDate: string;
  value: 'InBed' | 'Asleep' | 'Awake' | 'AsleepCore' | 'AsleepDeep' | 'AsleepREM';
  sourceName: string;
}

interface HealthKitHeartRate {
  startDate: string;
  endDate: string;
  value: number;  // BPM
  motionContext?: 'active' | 'sedentary' | 'notSet';
}

interface HealthKitHRV {
  startDate: string;
  value: number;  // ms (SDNN)
}

interface HealthKitActivity {
  startDate: string;
  endDate: string;
  activityType: string;
  duration: number;
  totalEnergyBurned?: number;
  totalDistance?: number;
  sourceName: string;
}

interface HealthKitDailySummary {
  date: string;
  activeEnergyBurned: number;    // kcal
  basalEnergyBurned: number;     // kcal
  stepCount: number;
  distanceWalkingRunning: number; // meters
  exerciseTime: number;           // minutes
  standHours: number;
}

// =============================================================================
// NATIVE BRIDGE INTERFACE
// =============================================================================

// This would be exposed by Electron's native module
interface AppleHealthBridge {
  isAvailable: () => Promise<boolean>;
  requestAuthorization: (types: string[]) => Promise<boolean>;
  querySleepAnalysis: (startDate: Date, endDate: Date) => Promise<HealthKitSleepAnalysis[]>;
  queryHeartRate: (startDate: Date, endDate: Date) => Promise<HealthKitHeartRate[]>;
  queryHRV: (startDate: Date, endDate: Date) => Promise<HealthKitHRV[]>;
  queryWorkouts: (startDate: Date, endDate: Date) => Promise<HealthKitActivity[]>;
  queryDailySummary: (date: Date) => Promise<HealthKitDailySummary | null>;
}

// Access via window.canopy.healthKit (would need to be implemented in Electron)
function getHealthKitBridge(): AppleHealthBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { canopy?: { healthKit?: AppleHealthBridge } }).canopy?.healthKit ?? null;
}

// =============================================================================
// NORMALIZATION FUNCTIONS
// =============================================================================

function normalizeSleepData(raw: HealthKitSleepAnalysis[]): WellnessSleep | null {
  if (raw.length === 0) return null;

  // Group by sleep session (entries within 30 min are same session)
  const sessions: HealthKitSleepAnalysis[][] = [];
  let currentSession: HealthKitSleepAnalysis[] = [];

  const sorted = [...raw].sort((a, b) =>
    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  for (const entry of sorted) {
    if (currentSession.length === 0) {
      currentSession.push(entry);
    } else {
      const lastEnd = new Date(currentSession[currentSession.length - 1].endDate);
      const thisStart = new Date(entry.startDate);
      const gap = thisStart.getTime() - lastEnd.getTime();

      if (gap < 30 * 60 * 1000) {
        // Within 30 min, same session
        currentSession.push(entry);
      } else {
        // New session
        sessions.push(currentSession);
        currentSession = [entry];
      }
    }
  }
  if (currentSession.length > 0) {
    sessions.push(currentSession);
  }

  // Find the main sleep session (longest one, typically at night)
  const mainSession = sessions.reduce((longest, current) => {
    const longestDuration = longest.reduce((sum, e) =>
      sum + (new Date(e.endDate).getTime() - new Date(e.startDate).getTime()), 0);
    const currentDuration = current.reduce((sum, e) =>
      sum + (new Date(e.endDate).getTime() - new Date(e.startDate).getTime()), 0);
    return currentDuration > longestDuration ? current : longest;
  }, sessions[0]);

  if (!mainSession || mainSession.length === 0) return null;

  // Calculate stage durations
  let awake = 0, light = 0, deep = 0, rem = 0;

  for (const entry of mainSession) {
    const duration = new Date(entry.endDate).getTime() - new Date(entry.startDate).getTime();
    switch (entry.value) {
      case 'Awake':
        awake += duration;
        break;
      case 'AsleepCore':
      case 'Asleep':
        light += duration;
        break;
      case 'AsleepDeep':
        deep += duration;
        break;
      case 'AsleepREM':
        rem += duration;
        break;
    }
  }

  const totalSleep = light + deep + rem;
  const totalInBed = awake + totalSleep;

  return {
    duration: totalSleep,
    efficiency: totalInBed > 0 ? Math.round((totalSleep / totalInBed) * 100) : undefined,
    stages: { awake, light, deep, rem },
    startTime: new Date(mainSession[0].startDate),
    endTime: new Date(mainSession[mainSession.length - 1].endDate),
  };
}

function calculateRecoveryFromHealthKit(
  hrv: HealthKitHRV[],
  heartRates: HealthKitHeartRate[],
  sleep: WellnessSleep | null
): WellnessRecovery | null {
  if (hrv.length === 0 && heartRates.length === 0) return null;

  // Get most recent HRV
  const latestHRV = hrv.length > 0
    ? hrv.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0]
    : null;

  // Get resting heart rate (lowest during sleep or sedentary)
  const restingCandidates = heartRates.filter(hr =>
    hr.motionContext === 'sedentary' || hr.motionContext === 'notSet'
  );
  const restingHR = restingCandidates.length > 0
    ? Math.min(...restingCandidates.map(hr => hr.value))
    : undefined;

  // Calculate a recovery score based on HRV and RHR
  // This is a simplified heuristic - real apps use more sophisticated models
  let score = 70; // Default moderate

  if (latestHRV) {
    // HRV contribution (higher is better)
    // Average adult HRV is 20-70ms, athletes can be 100+
    const hrvScore = Math.min(100, Math.max(0, (latestHRV.value / 80) * 100));
    score = hrvScore * 0.6;
  }

  if (restingHR) {
    // RHR contribution (lower is better)
    // Average adult RHR is 60-100, athletes can be 40-60
    const rhrScore = Math.min(100, Math.max(0, ((100 - restingHR) / 50) * 100));
    score += rhrScore * 0.2;
  }

  if (sleep) {
    // Sleep contribution
    const sleepScore = sleep.efficiency ?? 70;
    score += sleepScore * 0.2;
  }

  return {
    score: Math.round(score),
    hrv: latestHRV?.value,
    restingHeartRate: restingHR,
  };
}

// =============================================================================
// APPLE HEALTH PROVIDER
// =============================================================================

export const appleHealthProvider: WellnessProvider = {
  id: 'apple_health',
  name: 'Apple Health',
  icon: '🍎',
  description: 'Sleep, heart rate, and activity from Apple Health (macOS only)',

  capabilities: {
    recovery: true,   // Derived from HRV + sleep
    sleep: true,
    strain: false,    // No direct strain metric
    activities: true,
    heartRate: true,
    spo2: true,       // If available from Apple Watch
  },

  authType: 'native',
  // No OAuth - uses native HealthKit authorization

  isConnected: async () => {
    const bridge = getHealthKitBridge();
    if (!bridge) return false;

    try {
      return await bridge.isAvailable();
    } catch {
      return false;
    }
  },

  connect: async () => {
    const bridge = getHealthKitBridge();
    if (!bridge) {
      throw new Error('Apple Health not available - requires macOS with HealthKit');
    }

    const authorized = await bridge.requestAuthorization([
      'HKQuantityTypeIdentifierHeartRate',
      'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
      'HKQuantityTypeIdentifierRestingHeartRate',
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKQuantityTypeIdentifierStepCount',
      'HKCategoryTypeIdentifierSleepAnalysis',
      'HKWorkoutType',
    ]);

    if (!authorized) {
      throw new Error('Apple Health authorization denied');
    }
  },

  disconnect: async () => {
    // HealthKit doesn't have a "disconnect" - permissions persist
    // User must revoke in System Settings > Privacy > Health
    console.log('To disconnect Apple Health, revoke permissions in System Settings');
  },

  getRecovery: async (since?: Date): Promise<WellnessRecovery[]> => {
    const bridge = getHealthKitBridge();
    if (!bridge) return [];

    try {
      const endDate = new Date();
      const startDate = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [hrv, heartRates, sleepData] = await Promise.all([
        bridge.queryHRV(startDate, endDate),
        bridge.queryHeartRate(startDate, endDate),
        bridge.querySleepAnalysis(startDate, endDate),
      ]);

      const sleep = normalizeSleepData(sleepData);
      const recovery = calculateRecoveryFromHealthKit(hrv, heartRates, sleep);

      return recovery ? [recovery] : [];
    } catch (error) {
      console.error('Failed to get Apple Health recovery:', error);
      return [];
    }
  },

  getSleep: async (since?: Date): Promise<WellnessSleep[]> => {
    const bridge = getHealthKitBridge();
    if (!bridge) return [];

    try {
      const endDate = new Date();
      const startDate = since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const sleepData = await bridge.querySleepAnalysis(startDate, endDate);
      const normalized = normalizeSleepData(sleepData);

      return normalized ? [normalized] : [];
    } catch (error) {
      console.error('Failed to get Apple Health sleep:', error);
      return [];
    }
  },

  getStrain: async (_since?: Date): Promise<WellnessStrain[]> => {
    // Apple Health doesn't have a strain concept
    // Could derive from activity + heart rate, but leaving empty for now
    return [];
  },

  getActivities: async (since?: Date): Promise<WellnessActivity[]> => {
    const bridge = getHealthKitBridge();
    if (!bridge) return [];

    try {
      const endDate = new Date();
      const startDate = since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const workouts = await bridge.queryWorkouts(startDate, endDate);

      return workouts.map(w => ({
        type: w.activityType.toLowerCase(),
        startTime: new Date(w.startDate),
        endTime: new Date(w.endDate),
        duration: w.duration * 1000, // Convert to ms
        calories: w.totalEnergyBurned,
        distance: w.totalDistance,
      }));
    } catch (error) {
      console.error('Failed to get Apple Health activities:', error);
      return [];
    }
  },
};

export default appleHealthProvider;
