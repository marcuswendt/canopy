import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { DEFAULT_RAY_STATE, type RayState, type OnboardingPhase, daysUntil } from './ray';

// Main Ray state store
const STORAGE_KEY = 'canopy_ray_state';

function createRayStore() {
  // Load from localStorage if available
  const initial = browser && localStorage.getItem(STORAGE_KEY)
    ? JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    : DEFAULT_RAY_STATE;
  
  const { subscribe, set, update } = writable<RayState>(initial);
  
  // Persist to localStorage on changes
  if (browser) {
    subscribe(state => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    });
  }
  
  return {
    subscribe,
    set,
    update,
    
    // Onboarding progression
    advanceOnboarding: (phase: OnboardingPhase) => {
      update(state => ({
        ...state,
        onboardingPhase: phase,
        onboardingComplete: phase === 'complete',
      }));
    },
    
    completeOnboarding: () => {
      update(state => ({
        ...state,
        onboardingComplete: true,
        onboardingPhase: 'complete',
      }));
    },
    
    // Domain management
    addDomain: (domain: RayState['lifeContext']['domains'][0]) => {
      update(state => ({
        ...state,
        lifeContext: {
          ...state.lifeContext,
          domains: [...state.lifeContext.domains, domain],
        },
      }));
    },
    
    // Priority management
    setPriority: (entityId: string, level: 'critical' | 'active' | 'background', note?: string) => {
      update(state => {
        const existing = state.lifeContext.priorities.findIndex(p => p.entityId === entityId);
        const newPriority = { entityId, level, note, setAt: new Date().toISOString() };
        
        const priorities = existing >= 0
          ? state.lifeContext.priorities.map((p, i) => i === existing ? newPriority : p)
          : [...state.lifeContext.priorities, newPriority];
        
        return {
          ...state,
          lifeContext: { ...state.lifeContext, priorities },
        };
      });
    },
    
    // Event management
    addUpcomingEvent: (event: Omit<RayState['lifeContext']['upcomingEvents'][0], 'daysAway'>) => {
      update(state => ({
        ...state,
        lifeContext: {
          ...state.lifeContext,
          upcomingEvents: [
            ...state.lifeContext.upcomingEvents,
            { ...event, daysAway: daysUntil(event.date) },
          ],
        },
      }));
    },
    
    // Integration tracking
    markIntegrationMentioned: (service: RayState['lifeContext']['integrations'][0]['service']) => {
      update(state => {
        const existing = state.lifeContext.integrations.find(i => i.service === service);
        if (existing) {
          return {
            ...state,
            lifeContext: {
              ...state.lifeContext,
              integrations: state.lifeContext.integrations.map(i =>
                i.service === service ? { ...i, mentioned: true } : i
              ),
            },
          };
        }
        return {
          ...state,
          lifeContext: {
            ...state.lifeContext,
            integrations: [...state.lifeContext.integrations, { service, mentioned: true, connected: false }],
          },
        };
      });
    },
    
    // Wellbeing context
    setWellbeingContext: (context: RayState['wellbeingContext']) => {
      update(state => ({
        ...state,
        wellbeingContext: { ...state.wellbeingContext, ...context },
      }));
    },
    
    // Preferences
    updatePreferences: (prefs: Partial<RayState['preferences']>) => {
      update(state => ({
        ...state,
        preferences: { ...state.preferences, ...prefs },
      }));
    },
    
    // Activity tracking
    recordActivity: () => {
      update(state => ({
        ...state,
        lastActivity: new Date().toISOString(),
      }));
    },
    
    recordCheckIn: () => {
      update(state => ({
        ...state,
        lastCheckIn: new Date().toISOString(),
      }));
    },
    
    // Reset (for testing)
    reset: () => {
      set(DEFAULT_RAY_STATE);
    },
  };
}

export const rayState = createRayStore();

// Derived: needs onboarding?
export const needsOnboarding = derived(rayState, $ray => !$ray.onboardingComplete);

// Derived: current priorities (critical first)
export const currentPriorities = derived(rayState, $ray => {
  return [...$ray.lifeContext.priorities].sort((a, b) => {
    const order = { critical: 0, active: 1, background: 2 };
    return order[a.level] - order[b.level];
  });
});

// Derived: upcoming events (soonest first)
export const upcomingEvents = derived(rayState, $ray => {
  return [...$ray.lifeContext.upcomingEvents]
    .map(e => ({ ...e, daysAway: daysUntil(e.date) }))
    .filter(e => e.daysAway >= 0)
    .sort((a, b) => a.daysAway - b.daysAway);
});

// Derived: should show check-in prompt?
export const shouldCheckIn = derived(rayState, $ray => {
  if (!$ray.onboardingComplete) return false;
  if ($ray.preferences.checkInFrequency === 'never') return false;
  if (!$ray.lastCheckIn) return true;
  
  const lastCheckIn = new Date($ray.lastCheckIn);
  const now = new Date();
  const daysSince = (now.getTime() - lastCheckIn.getTime()) / (1000 * 60 * 60 * 24);
  
  if ($ray.preferences.checkInFrequency === 'daily') return daysSince >= 1;
  if ($ray.preferences.checkInFrequency === 'weekly') return daysSince >= 7;
  
  return false;
});
