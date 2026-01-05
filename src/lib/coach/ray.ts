// Ray - The Canopy Coach
// Handles onboarding, check-ins, and proactive guidance

export interface RayState {
  // Onboarding
  onboardingComplete: boolean;
  onboardingPhase?: OnboardingPhase;
  
  // What Ray knows about you
  lifeContext: {
    domains: DomainContext[];
    priorities: Priority[];
    upcomingEvents: UpcomingEvent[];
    integrations: IntegrationStatus[];
  };
  
  // Coaching preferences
  preferences: {
    checkInFrequency: 'daily' | 'weekly' | 'never';
    nudgesEnabled: boolean;
    coachingStyle: 'light' | 'medium' | 'direct';
  };
  
  // Wellbeing baseline
  wellbeingContext?: {
    physical?: string;   // "training for ultra-distance"
    emotional?: string;  // "three young kids, busy season"
    economic?: string;   // "running a 45-person studio"
  };
  
  // Last interactions
  lastCheckIn?: string;
  lastActivity?: string;
}

export type OnboardingPhase =
  | 'welcome'
  | 'profile'             // Name, location, optional details
  | 'domains'
  | 'domain-discovery'    // Deep dive into each domain
  | 'work-details'        // Work-specific questions
  | 'family-details'      // Family members
  | 'family-events'       // Upcoming family events
  | 'health-details'      // Health/fitness goals
  | 'persona'             // Digital presence
  | 'integrations'
  | 'review'
  | 'complete';

export interface DomainContext {
  id: string;
  name: string;
  type: 'work' | 'family' | 'sport' | 'personal' | 'health';
  description?: string;
  entities: string[];  // Entity IDs belonging to this domain
}

export interface Priority {
  entityId: string;
  level: 'critical' | 'active' | 'background';
  note?: string;       // "high stakes", "non-negotiable"
  setAt: string;
}

export interface UpcomingEvent {
  entityId: string;
  name: string;
  date: string;
  daysAway: number;
  isNonNegotiable: boolean;
}

export interface IntegrationStatus {
  service: 'whoop' | 'trainingpeaks' | 'calendar' | 'bank' | 'apple-health';
  mentioned: boolean;
  connected: boolean;
  lastSync?: string;
}

// Ray's voice - prompt fragments for consistent personality
export const RAY_VOICE = {
  greeting: {
    morning: "Good morning. What's on your mind?",
    afternoon: "Good afternoon. What's on your mind?",
    evening: "Good evening. What's on your mind?",
  },
  
  onboarding: {
    welcome: `I'm Ray—your guide through what matters.

I work best when I understand your life. Let's spend 5 minutes so I can actually be useful to you.`,

    askProfile: (guessedLocation?: string) =>
      guessedLocation
        ? `First, what should I call you?${guessedLocation ? `\n\nLooks like you're in ${guessedLocation}—is that right?` : ''}`
        : `First, what should I call you?\n\nAnd where in the world are you based?`,

    confirmProfile: (name: string, location: string) =>
      `Good to meet you, ${name}. ${location ? `I'll keep ${location} in mind for context.` : ''}\n\nNow let's map out what matters to you.`,

    askDomains: `What are the main areas of your life that take your attention?

Most people have 3-5: work, family, health, a side project...`,

    askWorkDetails: `Tell me about work. What's on your plate right now?

Projects, deadlines, people you're working with—whatever comes to mind.`,

    askFamilyDetails: `Now family. Who should I know about?

Names, ages, anything that helps me understand when you mention them.`,

    askHealthDetails: `How about health or fitness? Anything you're working on?

Training goals, wellness focus, things you're tracking...`,

    confirmDomains: (domains: string[]) => 
      `Got it. ${domains.length} domains:\n\n${domains.map(d => `  ◆ ${d}`).join('\n')}\n\nLet's go deep on each one—starting with ${domains[0]}.`,
    
    // Domain transitions
    startDomain: (domain: string, icon: string) =>
      `Let's map out ${domain}.`,
    
    nextDomain: (domain: string, icon: string) =>
      `Good. Now let's talk about ${domain}.`,
      
    domainComplete: (domain: string) =>
      `Got a good picture of ${domain}.`,
    
    // Generic follow-ups
    anythingElse: "Anything else here, or shall we move on?",
    
    // Extraction confirmations
    confirmExtracted: (items: string[]) =>
      `Got it:\n${items.map(i => `  └── ${i}`).join('\n')}`,
    
    askIntegrations: `Do you track with anything? WHOOP, Garmin, calendar apps? I can factor that data in later.`,
    
    askPersona: `One more thing—do you have public profiles I should know about?

I can learn a lot from what you've already shared publicly. Instagram, Strava, LinkedIn, your website...

This helps me understand your professional context, interests, and how you present yourself—without you having to repeat it.`,

    personaPrivacy: `These are your PUBLIC profiles—things you've chosen to share with the world. I'll only look at what's already visible to anyone who searches for you.

I won't bring up personal posts unless you mention them first. Think of it as background context, not surveillance.`,
    
    confirmPersona: (count: number) =>
      `Found ${count} profile${count === 1 ? '' : 's'}. I'll refresh daily to stay current with your public presence.`,
    
    askReferences: `Do you have notes in Notion or Apple Notes you'd want me to reference?

I won't import everything—but I can search them when relevant. Surfaces your past thinking without overwhelming the system.`,
    
    review: (summary: string) => 
      `Here's your life as I understand it:\n\n${summary}\n\nWhat am I missing?`,
      
    complete: `Good foundation. We can always refine this as we go.

What's on your mind right now?`,
  },
  
  // Domain-specific deep discovery prompts
  domainDiscovery: {
    work: {
      fires: `Let's map this out properly. What are the urgent fires right now?

The things keeping you up at night—decisions you're avoiding, conversations you're dreading, deadlines breathing down your neck.`,
      
      deadlines: `What has a hard deadline in the next 3 months?

Not everything—just the real deadlines. Launches, commitments, things that can't slip.`,
      
      strategic: `Beyond the fires—what are you trying to BUILD?

Not projects, but what you're trying to become. The strategic shifts, the capability you're developing, the position you're moving toward.`,
      
      people: `Who are the key people in this?

The ones you're relying on, the ones you need to make decisions about, the ones who can make or break these priorities.`,
      
      success: `If this year goes really well, what's different?

Paint me the picture—for the business, for you personally, for your team.`,
    },
    
    family: {
      people: `Tell me about your family—who should I know about?

Names, ages, anything that helps me understand when you mention them.`,
      
      events: `Any big family moments coming up?

Birthdays, trips, milestones, school events—things I should have on my radar.`,
      
      tensions: `Anything you're navigating right now?

Work-life tensions, needs you're trying to meet, things pulling at you. No judgment—just helps me understand the full picture.`,
    },
    
    sport: {
      goals: `What are you training toward?

Specific events, time goals, or just general fitness? Be specific—"marathon in October" hits different than "get fit."`,
      
      current: `Where are you in your training right now?

Base building? Peaking for something? Recovering from an event? Just maintaining?`,
      
      tensions: `How's training fitting with everything else?

Any conflicts with work or family? Times when you're choosing between a ride and being present?`,
    },
    
    health: {
      focus: `Is there anything specific you're working on health-wise?

Sleep, stress, energy, weight, recovery—what's on your mind?`,
      
      tracking: `Do you track anything? WHOOP, Apple Watch, sleep apps?

If you connect those later, I can factor that data into our conversations.`,
    },
    
    personal: {
      projects: `Any personal projects or interests taking your attention?

Side projects, learning, hobbies—things that matter to you outside work and family.`,
      
      goals: `Anything you're trying to make happen this year personally?

Not work, not family—just for you.`,
    },
  },
  
  coaching: {
    capacityLow: "Your recovery is low. Is today the right day for this?",
    patternNoticed: (pattern: string) => `I've noticed something: ${pattern}. Want me to track this?`,
    weeklyCheckIn: "Quick look at your week. What's the priority order?",
    eventReminder: (event: string, days: number) => 
      `${event} is ${days === 1 ? 'tomorrow' : `${days} days away`}. Just a heads up.`,
    tooMuch: "That's a lot for one week. What's actually non-negotiable?",
    refocus: (topic: string) => `You've mentioned ${topic} several times. Want to talk through what's stuck?`,
    clarify: "I don't have enough context on this—tell me more.",
    
    // Reference-aware responses
    foundNotes: (count: number, source: string) =>
      `Found ${count} related note${count === 1 ? '' : 's'} from ${source}.`,
    referenceContext: (title: string, date: string) =>
      `You wrote about this in "${title}" (${date}).`,
  },
  
  responses: {
    acknowledged: "Got it.",
    noted: "Noted.",
    understood: "Understood.",
    helpful: "That helps.",
    moreContext: "Tell me more.",
  }
};

// Default initial state
export const DEFAULT_RAY_STATE: RayState = {
  onboardingComplete: false,
  onboardingPhase: 'welcome',
  lifeContext: {
    domains: [],
    priorities: [],
    upcomingEvents: [],
    integrations: [],
  },
  preferences: {
    checkInFrequency: 'weekly',
    nudgesEnabled: true,
    coachingStyle: 'medium',
  },
};

// Helper: Calculate days until event
export function daysUntil(dateString: string): number {
  const eventDate = new Date(dateString);
  const now = new Date();
  const diffTime = eventDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Helper: Get time-appropriate greeting
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return RAY_VOICE.greeting.morning;
  if (hour < 17) return RAY_VOICE.greeting.afternoon;
  return RAY_VOICE.greeting.evening;
}

// Helper: Generate life summary for review
export function generateLifeSummary(state: RayState): string {
  const { domains, priorities, upcomingEvents } = state.lifeContext;
  
  let summary = '';
  
  for (const domain of domains) {
    const icon = domain.type === 'work' ? '◆' : 
                 domain.type === 'family' ? '♡' : 
                 domain.type === 'sport' ? '🚴' : '◇';
    
    summary += `${icon} ${domain.name}\n`;
    
    // Add entities under this domain
    if (domain.entities.length > 0) {
      for (const entityId of domain.entities) {
        const priority = priorities.find(p => p.entityId === entityId);
        const priorityNote = priority?.note ? ` (${priority.note})` : '';
        summary += `   └── ${entityId}${priorityNote}\n`;
      }
    }
    
    summary += '\n';
  }
  
  // Add upcoming events
  if (upcomingEvents.length > 0) {
    summary += '⚑ Coming up:\n';
    for (const event of upcomingEvents) {
      summary += `   ${event.name} — ${event.daysAway} days\n`;
    }
  }
  
  return summary.trim();
}
