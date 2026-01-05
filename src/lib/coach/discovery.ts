// Domain Discovery System
// Deep exploration of each life domain during onboarding

// =============================================================================
// TYPES
// =============================================================================

export interface DomainDiscovery {
  domain: string;
  displayName: string;
  icon: string;
  
  // Discovery layers
  layers: DiscoveryLayer[];
  
  // Extracted data
  extracted: {
    fires: ExtractedItem[];
    deadlines: ExtractedItem[];
    strategic: ExtractedItem[];
    people: ExtractedItem[];
    outcomes: string[];
  };
}

export interface DiscoveryLayer {
  id: string;
  name: string;
  prompt: string;
  followUp?: string;
  extractType: 'fires' | 'deadlines' | 'strategic' | 'people' | 'outcomes';
  required: boolean;
}

export interface ExtractedItem {
  name: string;
  type: 'project' | 'task' | 'person' | 'goal' | 'event' | 'issue';
  priority?: 'urgent' | 'high' | 'medium' | 'low';
  deadline?: Date;
  description?: string;
  people?: string[];
  emotionalWeight?: 'heavy' | 'medium' | 'light';
}

// =============================================================================
// DOMAIN CONFIGURATIONS
// =============================================================================

export const DOMAIN_CONFIGS: Record<string, {
  displayName: string;
  icon: string;
  layers: DiscoveryLayer[];
}> = {
  work: {
    displayName: 'Work',
    icon: '◆',
    layers: [
      {
        id: 'fires',
        name: 'Urgent Fires',
        prompt: `Let's map this out properly. What are the urgent fires right now?

The things keeping you up at night—decisions you're avoiding, conversations you're dreading, deadlines breathing down your neck.`,
        followUp: `That sounds heavy. Anything else that's urgent, or shall we move on?`,
        extractType: 'fires',
        required: true,
      },
      {
        id: 'deadlines',
        name: 'Time-Bound',
        prompt: `What has a hard deadline in the next 3 months?

Not everything—just the real deadlines. Launches, commitments, things that can't slip.`,
        extractType: 'deadlines',
        required: true,
      },
      {
        id: 'strategic',
        name: 'Strategic',
        prompt: `Beyond the fires—what are you trying to BUILD?

Not projects, but what you're trying to become. The strategic shifts, the capability you're developing, the position you're moving toward.`,
        extractType: 'strategic',
        required: true,
      },
      {
        id: 'people',
        name: 'Key People',
        prompt: `Who are the key people in this?

The ones you're relying on, the ones you need to make decisions about, the ones who can make or break these priorities.`,
        extractType: 'people',
        required: false,
      },
      {
        id: 'outcomes',
        name: 'Success Picture',
        prompt: `If this year goes really well, what's different?

Paint me the picture. What does success look like—for the business, for you personally, for your team?`,
        extractType: 'outcomes',
        required: false,
      },
    ],
  },
  
  family: {
    displayName: 'Family',
    icon: '♡',
    layers: [
      {
        id: 'people',
        name: 'Family Members',
        prompt: `Tell me about your family—who should I know about?

Names, ages, anything that helps me understand when you mention them.`,
        extractType: 'people',
        required: true,
      },
      {
        id: 'events',
        name: 'Upcoming Events',
        prompt: `Any big family moments coming up?

Birthdays, trips, milestones, school events—things I should have on my radar.`,
        extractType: 'deadlines',
        required: true,
      },
      {
        id: 'tensions',
        name: 'Current Tensions',
        prompt: `Anything you're navigating right now?

Work-life tensions, needs you're trying to meet, things pulling at you. No judgment—just helps me understand the full picture.`,
        extractType: 'fires',
        required: false,
      },
    ],
  },
  
  sport: {
    displayName: 'Sport / Training',
    icon: '🚴',
    layers: [
      {
        id: 'goals',
        name: 'Training Goals',
        prompt: `What are you training toward?

Specific events, time goals, or just general fitness? Be specific—"marathon in October" hits different than "get fit."`,
        extractType: 'strategic',
        required: true,
      },
      {
        id: 'current',
        name: 'Current State',
        prompt: `Where are you in your training right now?

Base building? Peaking for something? Recovering from an event? Just maintaining?`,
        extractType: 'fires',
        required: true,
      },
      {
        id: 'tensions',
        name: 'Training Tensions',
        prompt: `How's training fitting with everything else?

Any conflicts with work or family? Times when you're choosing between a ride and being present?`,
        extractType: 'outcomes',
        required: false,
      },
    ],
  },
  
  health: {
    displayName: 'Health',
    icon: '💚',
    layers: [
      {
        id: 'focus',
        name: 'Health Focus',
        prompt: `Is there anything specific you're working on health-wise?

Sleep, stress, energy, weight, recovery—what's on your mind?`,
        extractType: 'strategic',
        required: true,
      },
      {
        id: 'tracking',
        name: 'Tracking',
        prompt: `Do you track anything? WHOOP, Apple Watch, sleep apps?

If you connect those later, I can factor that data into our conversations.`,
        extractType: 'outcomes',
        required: false,
      },
    ],
  },
  
  personal: {
    displayName: 'Personal',
    icon: '◇',
    layers: [
      {
        id: 'projects',
        name: 'Personal Projects',
        prompt: `Any personal projects or interests taking your attention?

Side projects, learning, hobbies—things that matter to you outside work and family.`,
        extractType: 'strategic',
        required: true,
      },
      {
        id: 'goals',
        name: 'Personal Goals',
        prompt: `Anything you're trying to make happen this year personally?

Not work, not family—just for you.`,
        extractType: 'outcomes',
        required: false,
      },
    ],
  },
};

// =============================================================================
// DISCOVERY STATE
// =============================================================================

export interface DiscoveryState {
  currentDomain: string | null;
  currentLayerIndex: number;
  domains: Map<string, DomainDiscovery>;
  completedDomains: string[];
}

export function createDiscoveryState(domainNames: string[]): DiscoveryState {
  const domains = new Map<string, DomainDiscovery>();
  
  for (const name of domainNames) {
    const config = DOMAIN_CONFIGS[name.toLowerCase()] || DOMAIN_CONFIGS.personal;
    
    domains.set(name, {
      domain: name,
      displayName: config.displayName,
      icon: config.icon,
      layers: config.layers,
      extracted: {
        fires: [],
        deadlines: [],
        strategic: [],
        people: [],
        outcomes: [],
      },
    });
  }
  
  return {
    currentDomain: domainNames[0] || null,
    currentLayerIndex: 0,
    domains,
    completedDomains: [],
  };
}

// =============================================================================
// DISCOVERY PROMPTS
// =============================================================================

export function getCurrentPrompt(state: DiscoveryState): string | null {
  if (!state.currentDomain) return null;
  
  const domain = state.domains.get(state.currentDomain);
  if (!domain) return null;
  
  const layer = domain.layers[state.currentLayerIndex];
  if (!layer) return null;
  
  return layer.prompt;
}

export function getFollowUpPrompt(state: DiscoveryState): string | null {
  if (!state.currentDomain) return null;
  
  const domain = state.domains.get(state.currentDomain);
  if (!domain) return null;
  
  const layer = domain.layers[state.currentLayerIndex];
  return layer?.followUp || null;
}

export function advanceDiscovery(state: DiscoveryState): DiscoveryState {
  if (!state.currentDomain) return state;
  
  const domain = state.domains.get(state.currentDomain);
  if (!domain) return state;
  
  // Move to next layer
  const nextLayerIndex = state.currentLayerIndex + 1;
  
  if (nextLayerIndex < domain.layers.length) {
    return {
      ...state,
      currentLayerIndex: nextLayerIndex,
    };
  }
  
  // Domain complete — move to next domain
  const completedDomains = [...state.completedDomains, state.currentDomain];
  const remainingDomains = Array.from(state.domains.keys())
    .filter(d => !completedDomains.includes(d));
  
  return {
    ...state,
    currentDomain: remainingDomains[0] || null,
    currentLayerIndex: 0,
    completedDomains,
  };
}

export function skipCurrentLayer(state: DiscoveryState): DiscoveryState {
  return advanceDiscovery(state);
}

export function isDiscoveryComplete(state: DiscoveryState): boolean {
  return state.currentDomain === null;
}

// =============================================================================
// EXTRACTION
// =============================================================================

export function addExtractedItems(
  state: DiscoveryState,
  items: ExtractedItem[]
): DiscoveryState {
  if (!state.currentDomain) return state;
  
  const domain = state.domains.get(state.currentDomain);
  if (!domain) return state;
  
  const layer = domain.layers[state.currentLayerIndex];
  if (!layer) return state;
  
  const extractType = layer.extractType;
  
  const updatedDomain: DomainDiscovery = {
    ...domain,
    extracted: {
      ...domain.extracted,
      [extractType]: [...domain.extracted[extractType], ...items],
    },
  };
  
  const updatedDomains = new Map(state.domains);
  updatedDomains.set(state.currentDomain, updatedDomain);
  
  return {
    ...state,
    domains: updatedDomains,
  };
}

// =============================================================================
// SUMMARY GENERATION
// =============================================================================

export function generateDomainSummary(domain: DomainDiscovery): string {
  const lines: string[] = [];
  
  // Header
  lines.push(`${domain.icon} ${domain.displayName}`);
  
  // Fires (urgent)
  if (domain.extracted.fires.length > 0) {
    lines.push(`   🔥 Urgent`);
    for (const item of domain.extracted.fires) {
      const weight = item.emotionalWeight === 'heavy' ? ' ⚡' : '';
      lines.push(`      └── ${item.name}${weight}`);
    }
  }
  
  // Deadlines
  if (domain.extracted.deadlines.length > 0) {
    lines.push(`   📅 Time-bound`);
    for (const item of domain.extracted.deadlines) {
      const deadline = item.deadline ? ` (${formatDeadline(item.deadline)})` : '';
      lines.push(`      └── ${item.name}${deadline}`);
    }
  }
  
  // Strategic
  if (domain.extracted.strategic.length > 0) {
    lines.push(`   🎯 Strategic`);
    for (const item of domain.extracted.strategic) {
      lines.push(`      └── ${item.name}`);
    }
  }
  
  // People
  if (domain.extracted.people.length > 0) {
    lines.push(`   👤 Key People`);
    for (const item of domain.extracted.people) {
      const desc = item.description ? ` — ${item.description}` : '';
      lines.push(`      └── ${item.name}${desc}`);
    }
  }
  
  return lines.join('\n');
}

export function generateFullSummary(state: DiscoveryState): string {
  const summaries: string[] = [];
  
  for (const domain of state.domains.values()) {
    const summary = generateDomainSummary(domain);
    if (summary.split('\n').length > 1) {  // Has more than just header
      summaries.push(summary);
    }
  }
  
  return summaries.join('\n\n');
}

function formatDeadline(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.ceil(days / 7)} weeks`;
  return `${Math.ceil(days / 30)} months`;
}

// =============================================================================
// ENTITY CONVERSION
// =============================================================================

export interface EntityCandidate {
  name: string;
  type: 'project' | 'person' | 'event' | 'concept';
  domain: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low';
  deadline?: Date;
  description?: string;
  relationships?: { targetName: string; type: string }[];
}

export function extractEntityCandidates(state: DiscoveryState): EntityCandidate[] {
  const candidates: EntityCandidate[] = [];
  
  for (const [domainName, domain] of state.domains) {
    // Projects from fires and strategic
    for (const item of [...domain.extracted.fires, ...domain.extracted.strategic]) {
      if (item.type === 'project' || item.type === 'goal') {
        candidates.push({
          name: item.name,
          type: 'project',
          domain: domainName,
          priority: item.priority,
          description: item.description,
        });
      }
    }
    
    // Events from deadlines
    for (const item of domain.extracted.deadlines) {
      if (item.type === 'event' || item.deadline) {
        candidates.push({
          name: item.name,
          type: 'event',
          domain: domainName,
          deadline: item.deadline,
          description: item.description,
        });
      }
    }
    
    // People
    for (const item of domain.extracted.people) {
      candidates.push({
        name: item.name,
        type: 'person',
        domain: domainName,
        description: item.description,
      });
    }
  }
  
  return candidates;
}
