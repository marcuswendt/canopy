// Digital Persona System
// Ingests your public presence to build context without manual input

// =============================================================================
// TYPES
// =============================================================================

export interface DigitalPersona {
  platforms: PersonaPlatform[];
  extractedContext: ExtractedPersonaContext;
  lastRefresh: Date | null;
  refreshSchedule: 'daily' | 'weekly' | 'manual';
}

export interface PersonaPlatform {
  id: string;
  type: PlatformType;
  handle: string;              // @marcuswendt, 13736588, etc.
  url: string;                 // Full URL
  scope: 'personal' | 'work';  // Origin tracking
  
  // Connection state
  connected: boolean;
  authType: 'public' | 'oauth' | 'api_key';
  
  // Profile data
  profile?: PlatformProfile;
  
  // Recent content
  recentContent: PersonaContent[];
  
  // Sync state
  lastSync: Date | null;
  lastError: string | null;
  syncEnabled: boolean;
}

export type PlatformType = 
  | 'instagram'
  | 'strava'
  | 'linkedin'
  | 'twitter'
  | 'website'
  | 'portfolio'
  | 'github'
  | 'youtube'
  | 'substack'
  | 'medium';

export interface PlatformProfile {
  name: string;
  bio?: string;
  avatar?: string;
  url: string;
  
  // Platform-specific stats
  followers?: number;
  following?: number;
  posts?: number;
  location?: string;
  
  // For Strava
  activities?: number;
  
  // For LinkedIn
  headline?: string;
  company?: string;
}

export interface PersonaContent {
  id: string;
  platformId: string;
  platform: PlatformType;
  scope: 'personal' | 'work';  // Inherited from platform
  type: ContentType;
  timestamp: Date;
  url?: string;
  
  // Content
  text?: string;
  media?: MediaItem[];
  
  // For activities (Strava)
  activity?: {
    type: string;           // 'Ride', 'Run', 'Swim'
    name: string;
    distance?: number;      // meters
    duration?: number;      // seconds
    elevation?: number;     // meters
    averageSpeed?: number;
    kudos?: number;
  };
  
  // Extracted insights
  extracted?: {
    topics: string[];
    entities: string[];     // People, companies, places mentioned
    sentiment: number;      // -1 to 1
    isPublicStatement: boolean;  // Quote-worthy professional statement
  };
  
  // Engagement metrics (where available)
  engagement?: {
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
  };
}

export type ContentType = 
  | 'post'
  | 'story'
  | 'reel'
  | 'activity'
  | 'article'
  | 'video'
  | 'photo'
  | 'status'
  | 'page';

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
  thumbnail?: string;
  alt?: string;
}

// =============================================================================
// EXTRACTED CONTEXT - What Ray actually uses
// =============================================================================

export interface ExtractedPersonaContext {
  // Professional narrative (from LinkedIn, personal site, company site)
  professional: {
    summary: string;           // Your distilled professional identity
    currentRole: string;
    company: string;
    recentStatements: string[];  // Public professional statements
    expertise: string[];
    lastUpdated: Date | null;
  };
  
  // Current interests (from Twitter, posts, articles)
  interests: {
    topics: string[];          // What you're thinking about
    recentThemes: string[];    // Patterns in recent content
    lastUpdated: Date | null;
  };
  
  // Life context (from Instagram)
  life: {
    recentMoments: string[];   // Family, travel, experiences
    visualThemes: string[];    // What you choose to share visually
    lastUpdated: Date | null;
  };
  
  // Training context (from Strava)
  training: {
    focus: string;             // 'cycling', 'running', 'triathlon'
    recentActivity: string;    // '3hr ride Saturday'
    weeklyPattern: string;     // 'Training 4x/week, long rides weekends'
    goals?: string;            // Detected from activity names/descriptions
    lastUpdated: Date | null;
  };
  
  // Work context (from company sites)
  work: {
    companyDescription: string;
    recentProjects: string[];
    clients: string[];
    teamSize?: string;
    lastUpdated: Date | null;
  };
}

// =============================================================================
// PLATFORM CONFIGS
// =============================================================================

export const PLATFORM_CONFIGS: Record<PlatformType, {
  name: string;
  icon: string;
  defaultScope: 'personal' | 'work';
  authType: 'public' | 'oauth' | 'api_key';
  urlPattern: RegExp;
  handleExtractor: (url: string) => string | null;
  contentTypes: ContentType[];
}> = {
  instagram: {
    name: 'Instagram',
    icon: '📸',
    defaultScope: 'personal',
    authType: 'public',
    urlPattern: /instagram\.com\/([^\/\?]+)/,
    handleExtractor: (url) => url.match(/instagram\.com\/([^\/\?]+)/)?.[1] || null,
    contentTypes: ['post', 'story', 'reel'],
  },
  strava: {
    name: 'Strava',
    icon: '🟠',
    defaultScope: 'personal',
    authType: 'oauth',  // Public profile works, but OAuth gives more
    urlPattern: /strava\.com\/athletes\/(\d+)/,
    handleExtractor: (url) => url.match(/strava\.com\/athletes\/(\d+)/)?.[1] || null,
    contentTypes: ['activity'],
  },
  linkedin: {
    name: 'LinkedIn',
    icon: '💼',
    defaultScope: 'work',
    authType: 'public',
    urlPattern: /linkedin\.com\/in\/([^\/\?]+)/,
    handleExtractor: (url) => url.match(/linkedin\.com\/in\/([^\/\?]+)/)?.[1] || null,
    contentTypes: ['post', 'article'],
  },
  twitter: {
    name: 'Twitter/X',
    icon: '𝕏',
    defaultScope: 'personal',
    authType: 'public',
    urlPattern: /(?:twitter|x)\.com\/([^\/\?]+)/,
    handleExtractor: (url) => url.match(/(?:twitter|x)\.com\/([^\/\?]+)/)?.[1] || null,
    contentTypes: ['post'],
  },
  website: {
    name: 'Personal Site',
    icon: '🌐',
    defaultScope: 'personal',
    authType: 'public',
    urlPattern: /.*/,
    handleExtractor: (url) => new URL(url).hostname,
    contentTypes: ['page'],
  },
  portfolio: {
    name: 'Portfolio',
    icon: '🎨',
    defaultScope: 'work',
    authType: 'public',
    urlPattern: /.*/,
    handleExtractor: (url) => new URL(url).hostname,
    contentTypes: ['page'],
  },
  github: {
    name: 'GitHub',
    icon: '🐙',
    defaultScope: 'work',
    authType: 'public',
    urlPattern: /github\.com\/([^\/\?]+)/,
    handleExtractor: (url) => url.match(/github\.com\/([^\/\?]+)/)?.[1] || null,
    contentTypes: ['page'],
  },
  youtube: {
    name: 'YouTube',
    icon: '📺',
    defaultScope: 'personal',
    authType: 'public',
    urlPattern: /youtube\.com\/@?([^\/\?]+)/,
    handleExtractor: (url) => url.match(/youtube\.com\/@?([^\/\?]+)/)?.[1] || null,
    contentTypes: ['video'],
  },
  substack: {
    name: 'Substack',
    icon: '📰',
    defaultScope: 'personal',
    authType: 'public',
    urlPattern: /([^\.]+)\.substack\.com/,
    handleExtractor: (url) => url.match(/([^\.]+)\.substack\.com/)?.[1] || null,
    contentTypes: ['article'],
  },
  medium: {
    name: 'Medium',
    icon: '📝',
    defaultScope: 'personal',
    authType: 'public',
    urlPattern: /medium\.com\/@?([^\/\?]+)/,
    handleExtractor: (url) => url.match(/medium\.com\/@?([^\/\?]+)/)?.[1] || null,
    contentTypes: ['article'],
  },
};

// =============================================================================
// HELPERS
// =============================================================================

export function detectPlatformFromUrl(url: string): { type: PlatformType; handle: string } | null {
  // Normalize URL
  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith('http')) {
    normalizedUrl = 'https://' + normalizedUrl;
  }
  
  // Check each platform
  for (const [type, config] of Object.entries(PLATFORM_CONFIGS)) {
    const handle = config.handleExtractor(normalizedUrl);
    if (handle && config.urlPattern.test(normalizedUrl)) {
      return { type: type as PlatformType, handle };
    }
  }
  
  // Default to website if it's a valid URL
  try {
    const hostname = new URL(normalizedUrl).hostname;
    return { type: 'website', handle: hostname };
  } catch {
    return null;
  }
}

export function createPlatform(
  url: string, 
  scopeOverride?: 'personal' | 'work'
): PersonaPlatform | null {
  const detected = detectPlatformFromUrl(url);
  if (!detected) return null;
  
  const config = PLATFORM_CONFIGS[detected.type];
  
  return {
    id: `${detected.type}-${detected.handle}`,
    type: detected.type,
    handle: detected.handle,
    url: url.startsWith('http') ? url : `https://${url}`,
    scope: scopeOverride || config.defaultScope,
    connected: false,
    authType: config.authType,
    recentContent: [],
    lastSync: null,
    lastError: null,
    syncEnabled: true,
  };
}

export function getDefaultPersona(): DigitalPersona {
  return {
    platforms: [],
    extractedContext: {
      professional: {
        summary: '',
        currentRole: '',
        company: '',
        recentStatements: [],
        expertise: [],
        lastUpdated: null,
      },
      interests: {
        topics: [],
        recentThemes: [],
        lastUpdated: null,
      },
      life: {
        recentMoments: [],
        visualThemes: [],
        lastUpdated: null,
      },
      training: {
        focus: '',
        recentActivity: '',
        weeklyPattern: '',
        lastUpdated: null,
      },
      work: {
        companyDescription: '',
        recentProjects: [],
        clients: [],
        lastUpdated: null,
      },
    },
    lastRefresh: null,
    refreshSchedule: 'daily',
  };
}

// =============================================================================
// CONTEXT PRIVACY RULES
// =============================================================================

/**
 * Determines if Ray should proactively mention persona content
 * 
 * Rule: Ray knows about public persona but doesn't bring it up
 * unless the user references it first or it's directly relevant.
 */
export function shouldRayMention(
  content: PersonaContent,
  conversationContext: {
    userMentionedTopic: boolean;
    directlyRelevant: boolean;
    userAskedAbout: boolean;
  }
): boolean {
  // Always okay if user asked directly
  if (conversationContext.userAskedAbout) return true;
  
  // Okay if user mentioned the topic and it's relevant
  if (conversationContext.userMentionedTopic && conversationContext.directlyRelevant) {
    return true;
  }
  
  // Don't proactively surface personal life content
  if (content.scope === 'personal' && content.type !== 'activity') {
    return false;
  }
  
  // Training activities can be mentioned if discussing fitness
  if (content.type === 'activity' && conversationContext.directlyRelevant) {
    return true;
  }
  
  // Professional content is okay to reference in work context
  if (content.scope === 'work' && conversationContext.directlyRelevant) {
    return true;
  }
  
  return false;
}

/**
 * Ray's awareness levels for persona content
 */
export type AwarenessLevel = 
  | 'background'    // Ray knows but won't mention
  | 'contextual'    // Ray can reference if relevant
  | 'active';       // Ray can proactively bring up

export function getAwarenessLevel(
  content: PersonaContent,
  platform: PersonaPlatform
): AwarenessLevel {
  // Personal Instagram: background only
  if (platform.type === 'instagram' && platform.scope === 'personal') {
    return 'background';
  }
  
  // Strava activities: contextual (for training discussions)
  if (platform.type === 'strava') {
    return 'contextual';
  }
  
  // LinkedIn professional statements: active in work context
  if (platform.type === 'linkedin' && content.extracted?.isPublicStatement) {
    return 'active';
  }
  
  // Company sites: active
  if (platform.scope === 'work' && platform.type === 'website') {
    return 'active';
  }
  
  // Default: contextual
  return 'contextual';
}
