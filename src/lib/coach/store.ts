import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { DEFAULT_RAY_STATE, type RayState, type OnboardingPhase, daysUntil } from './ray';

// Main Ray state store
const STORAGE_KEY = 'canopy_ray_state';
const PLUGIN_ID = 'ray_coach';

// Track whether the store has finished loading from persistence
export const rayStateLoaded = writable(false);

// Helper to check if we're in Electron with canopy API
// Must be called at runtime, not module load time, because preload script may not be ready
function checkIsElectron(): boolean {
  return typeof window !== 'undefined' && window.canopy?.getPluginState !== undefined;
}

function createRayStore() {
  const { subscribe, set, update } = writable<RayState>(DEFAULT_RAY_STATE);

  // Load state asynchronously
  if (browser) {
    (async () => {
      try {
        // Check at runtime - preload script should be ready by now
        const isElectron = checkIsElectron();

        if (isElectron) {
          // Load from database via Electron IPC
          // The state is stored in the settings field as JSON
          const saved = await window.canopy!.getPluginState(PLUGIN_ID);
          if (saved?.settings) {
            // settings is stored as JSON string in the database
            const settings = typeof saved.settings === 'string'
              ? JSON.parse(saved.settings)
              : saved.settings;
            set(settings);
          }
        } else {
          // Fallback to localStorage for web dev mode
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            set(JSON.parse(saved));
          }
        }
      } catch (e) {
        console.error('Failed to load ray state:', e);
      } finally {
        // Mark as loaded regardless of success/failure
        rayStateLoaded.set(true);
      }
    })();
  } else {
    // Not in browser, mark as loaded immediately
    rayStateLoaded.set(true);
  }

  // Persist on changes
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  if (browser) {
    subscribe(state => {
      // Debounce saves
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        // Check at runtime for Electron API availability
        if (checkIsElectron()) {
          // Store the entire ray state in the settings field (which is JSON)
          window.canopy!.setPluginState({
            pluginId: PLUGIN_ID,
            enabled: true,
            connected: true,
            settings: state  // Pass the state object directly, it will be JSON.stringified by the IPC handler
          });
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
      }, 100);
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
