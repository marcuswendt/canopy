// Digital Persona Store
// Manages persona state and sync

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { 
  type DigitalPersona, 
  type PersonaPlatform, 
  type PersonaContent,
  type ExtractedPersonaContext,
  getDefaultPersona,
  createPlatform,
  PLATFORM_CONFIGS,
} from './types';

// =============================================================================
// STORE
// =============================================================================

const STORAGE_KEY = 'canopy_persona';

function createPersonaStore() {
  // Load from localStorage
  const initial: DigitalPersona = browser && localStorage.getItem(STORAGE_KEY)
    ? JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    : getDefaultPersona();
  
  const { subscribe, set, update } = writable<DigitalPersona>(initial);
  
  // Persist on changes
  if (browser) {
    subscribe(state => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    });
  }
  
  return {
    subscribe,
    set,
    update,
    
    // Add a platform
    addPlatform: (url: string, scope?: 'personal' | 'work') => {
      const platform = createPlatform(url, scope);
      if (!platform) return null;
      
      update(state => {
        // Don't add duplicates
        if (state.platforms.some(p => p.id === platform.id)) {
          return state;
        }
        return {
          ...state,
          platforms: [...state.platforms, platform],
        };
      });
      
      return platform;
    },
    
    // Remove a platform
    removePlatform: (platformId: string) => {
      update(state => ({
        ...state,
        platforms: state.platforms.filter(p => p.id !== platformId),
      }));
    },
    
    // Update platform scope
    setPlatformScope: (platformId: string, scope: 'personal' | 'work') => {
      update(state => ({
        ...state,
        platforms: state.platforms.map(p =>
          p.id === platformId ? { ...p, scope } : p
        ),
      }));
    },
    
    // Toggle sync enabled
    togglePlatformSync: (platformId: string) => {
      update(state => ({
        ...state,
        platforms: state.platforms.map(p =>
          p.id === platformId ? { ...p, syncEnabled: !p.syncEnabled } : p
        ),
      }));
    },
    
    // Update platform profile
    setPlatformProfile: (platformId: string, profile: PersonaPlatform['profile']) => {
      update(state => ({
        ...state,
        platforms: state.platforms.map(p =>
          p.id === platformId ? { ...p, profile, connected: true } : p
        ),
      }));
    },
    
    // Add content to platform
    addPlatformContent: (platformId: string, content: PersonaContent[]) => {
      update(state => ({
        ...state,
        platforms: state.platforms.map(p => {
          if (p.id !== platformId) return p;
          
          // Merge content, avoiding duplicates
          const existingIds = new Set(p.recentContent.map(c => c.id));
          const newContent = content.filter(c => !existingIds.has(c.id));
          
          return {
            ...p,
            recentContent: [...newContent, ...p.recentContent].slice(0, 50),  // Keep last 50
            lastSync: new Date(),
            lastError: null,
          };
        }),
      }));
    },
    
    // Set sync error
    setPlatformError: (platformId: string, error: string) => {
      update(state => ({
        ...state,
        platforms: state.platforms.map(p =>
          p.id === platformId ? { ...p, lastError: error } : p
        ),
      }));
    },
    
    // Update extracted context
    setExtractedContext: (context: Partial<ExtractedPersonaContext>) => {
      update(state => ({
        ...state,
        extractedContext: {
          ...state.extractedContext,
          ...context,
        },
        lastRefresh: new Date(),
      }));
    },
    
    // Full refresh
    markRefreshed: () => {
      update(state => ({
        ...state,
        lastRefresh: new Date(),
      }));
    },
    
    // Reset
    reset: () => {
      set(getDefaultPersona());
    },
  };
}

export const persona = createPersonaStore();

// =============================================================================
// DERIVED STORES
// =============================================================================

export const platforms = derived(persona, $p => $p.platforms);

export const personalPlatforms = derived(
  persona,
  $p => $p.platforms.filter(p => p.scope === 'personal')
);

export const workPlatforms = derived(
  persona,
  $p => $p.platforms.filter(p => p.scope === 'work')
);

export const connectedPlatforms = derived(
  persona,
  $p => $p.platforms.filter(p => p.connected)
);

export const allRecentContent = derived(
  persona,
  $p => {
    const content: PersonaContent[] = [];
    for (const platform of $p.platforms) {
      content.push(...platform.recentContent);
    }
    return content.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
);

export const extractedContext = derived(
  persona,
  $p => $p.extractedContext
);

// For Ray to check
export const hasPersona = derived(
  persona,
  $p => $p.platforms.length > 0
);

export const needsRefresh = derived(
  persona,
  $p => {
    if (!$p.lastRefresh) return true;
    const hoursSinceRefresh = (Date.now() - new Date($p.lastRefresh).getTime()) / (1000 * 60 * 60);
    
    switch ($p.refreshSchedule) {
      case 'daily': return hoursSinceRefresh >= 24;
      case 'weekly': return hoursSinceRefresh >= 168;
      case 'manual': return false;
    }
  }
);

// =============================================================================
// SYNC FUNCTIONS
// =============================================================================

/**
 * Fetch and process a platform's public content
 * In production, this would call actual APIs/scrapers
 */
export async function syncPlatform(platformId: string): Promise<void> {
  const state = get(persona);
  const platform = state.platforms.find(p => p.id === platformId);
  if (!platform) return;
  
  try {
    // Mock implementation - would call actual fetch functions
    const content = await fetchPlatformContent(platform);
    persona.addPlatformContent(platformId, content);
    
    // Extract profile if not set
    if (!platform.profile) {
      const profile = await fetchPlatformProfile(platform);
      if (profile) {
        persona.setPlatformProfile(platformId, profile);
      }
    }
    
  } catch (error) {
    persona.setPlatformError(
      platformId, 
      error instanceof Error ? error.message : 'Sync failed'
    );
  }
}

/**
 * Sync all enabled platforms
 */
export async function syncAllPlatforms(): Promise<void> {
  const state = get(persona);
  
  await Promise.allSettled(
    state.platforms
      .filter(p => p.syncEnabled)
      .map(p => syncPlatform(p.id))
  );
  
  // Update extracted context
  await updateExtractedContext();
  
  persona.markRefreshed();
}

/**
 * Update the extracted context from all platform content
 * In production, this would use Claude to analyze and extract
 */
async function updateExtractedContext(): Promise<void> {
  const state = get(persona);
  
  // Gather all content
  const allContent: PersonaContent[] = [];
  for (const platform of state.platforms) {
    allContent.push(...platform.recentContent);
  }
  
  // Mock extraction - would use Claude API
  const context: Partial<ExtractedPersonaContext> = {};
  
  // Extract from LinkedIn
  const linkedIn = state.platforms.find(p => p.type === 'linkedin');
  if (linkedIn?.profile) {
    context.professional = {
      summary: linkedIn.profile.bio || '',
      currentRole: linkedIn.profile.headline || '',
      company: linkedIn.profile.company || '',
      recentStatements: linkedIn.recentContent
        .filter(c => c.type === 'post' && c.text)
        .slice(0, 5)
        .map(c => c.text!),
      expertise: [],  // Would extract from profile
      lastUpdated: new Date(),
    };
  }
  
  // Extract from Strava
  const strava = state.platforms.find(p => p.type === 'strava');
  if (strava) {
    const activities = strava.recentContent.filter(c => c.activity);
    const recentActivity = activities[0]?.activity;
    
    context.training = {
      focus: detectTrainingFocus(activities),
      recentActivity: recentActivity 
        ? `${recentActivity.type}: ${recentActivity.name}` 
        : '',
      weeklyPattern: detectWeeklyPattern(activities),
      lastUpdated: new Date(),
    };
  }
  
  // Extract from Instagram
  const instagram = state.platforms.find(p => p.type === 'instagram');
  if (instagram) {
    context.life = {
      recentMoments: instagram.recentContent
        .filter(c => c.text)
        .slice(0, 5)
        .map(c => c.text!),
      visualThemes: [],  // Would use vision API
      lastUpdated: new Date(),
    };
  }
  
  // Extract from company site
  const companySite = state.platforms.find(p => p.scope === 'work' && p.type === 'website');
  if (companySite?.profile) {
    context.work = {
      companyDescription: companySite.profile.bio || '',
      recentProjects: [],  // Would extract from site
      clients: [],         // Would extract from site
      lastUpdated: new Date(),
    };
  }
  
  persona.setExtractedContext(context);
}

// =============================================================================
// MOCK FETCH FUNCTIONS (replace with real APIs)
// =============================================================================

async function fetchPlatformContent(platform: PersonaPlatform): Promise<PersonaContent[]> {
  // Simulate API delay
  await new Promise(r => setTimeout(r, 500));
  
  // Return mock content based on platform type
  switch (platform.type) {
    case 'strava':
      return [
        {
          id: `strava-${Date.now()}-1`,
          platformId: platform.id,
          platform: 'strava',
          scope: platform.scope,
          type: 'activity',
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),  // 2 days ago
          activity: {
            type: 'Ride',
            name: 'Saturday long ride',
            distance: 85000,
            duration: 10800,
            elevation: 1200,
          },
        },
      ];
      
    case 'instagram':
      return [
        {
          id: `instagram-${Date.now()}-1`,
          platformId: platform.id,
          platform: 'instagram',
          scope: platform.scope,
          type: 'post',
          timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          text: 'Studio life',
          media: [{ type: 'image', url: '' }],
        },
      ];
      
    case 'linkedin':
      return [
        {
          id: `linkedin-${Date.now()}-1`,
          platformId: platform.id,
          platform: 'linkedin',
          scope: platform.scope,
          type: 'post',
          timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          text: 'Excited to share our latest work on intelligent retail systems...',
          extracted: {
            topics: ['retail', 'AI', 'design'],
            entities: ['Nike', 'FIELD.IO'],
            sentiment: 0.8,
            isPublicStatement: true,
          },
        },
      ];
      
    default:
      return [];
  }
}

async function fetchPlatformProfile(platform: PersonaPlatform): Promise<PersonaPlatform['profile'] | null> {
  // Simulate API delay
  await new Promise(r => setTimeout(r, 300));
  
  // Return mock profile
  switch (platform.type) {
    case 'strava':
      return {
        name: 'Marcus Wendt',
        url: platform.url,
        activities: 847,
        location: 'London, UK',
      };
      
    case 'linkedin':
      return {
        name: 'Marcus Wendt',
        bio: 'Founder & CEO at FIELD.IO',
        headline: 'Creative Intelligence Pioneer',
        company: 'FIELD.IO',
        url: platform.url,
        followers: 5000,
      };
      
    case 'instagram':
      return {
        name: 'Marcus Wendt',
        bio: '🌿 FIELD.IO | Creative Intelligence',
        url: platform.url,
        followers: 2500,
        posts: 340,
      };
      
    default:
      return {
        name: platform.handle,
        url: platform.url,
      };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function detectTrainingFocus(activities: PersonaContent[]): string {
  const types: Record<string, number> = {};
  
  for (const activity of activities) {
    if (activity.activity?.type) {
      types[activity.activity.type] = (types[activity.activity.type] || 0) + 1;
    }
  }
  
  const sorted = Object.entries(types).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0]?.toLowerCase() || '';
}

function detectWeeklyPattern(activities: PersonaContent[]): string {
  const count = activities.length;
  if (count === 0) return '';
  
  // Simple pattern detection
  const avgPerWeek = count / 4;  // Assuming ~4 weeks of data
  
  if (avgPerWeek >= 5) return 'Training 5+ times per week';
  if (avgPerWeek >= 3) return 'Training 3-4 times per week';
  if (avgPerWeek >= 1) return 'Training 1-2 times per week';
  return 'Occasional training';
}
