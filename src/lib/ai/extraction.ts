// AI-powered extraction functions for Canopy
// Uses the AI provider abstraction to extract structured data from user input

import { extract, stream, isError, type AIMessage, type StreamCallbacks } from './index';
import type { Entity } from '$lib/db/types';
import type { ExtractedContent, EntitySuggestion } from '$lib/uploads';
import { get } from 'svelte/store';
import { recentTime, recentWeather, recentRecovery } from '$lib/integrations/registry';

// =============================================================================
// SCHEMAS
// =============================================================================

const DOMAIN_SCHEMA = {
  type: 'object',
  properties: {
    domains: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Human-readable domain name' },
          type: { type: 'string', enum: ['work', 'family', 'sport', 'personal', 'health'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['name', 'type', 'confidence'],
      },
    },
  },
};

const ENTITY_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['person', 'project', 'company', 'event', 'concept', 'place'] },
          domain: { type: 'string', enum: ['work', 'family', 'sport', 'personal', 'health'] },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['critical', 'active', 'background'] },
          relationship: { type: 'string', description: 'For people: wife, son, colleague, etc.' },
          date: { type: 'string', description: 'For events: ISO date or description' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['name', 'type', 'confidence'],
      },
    },
  },
};

const INTEGRATION_SCHEMA = {
  type: 'object',
  properties: {
    integrations: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['whoop', 'trainingpeaks', 'garmin', 'strava', 'apple-health', 'google-calendar', 'apple-calendar'],
      },
    },
  },
};

const DOCUMENT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '1-2 sentence summary' },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['person', 'project', 'company', 'event', 'concept', 'place'] },
          domain: { type: 'string', enum: ['work', 'family', 'sport', 'personal', 'health'] },
          confidence: { type: 'number' },
          details: { type: 'object' },
        },
      },
    },
    title: { type: 'string' },
    author: { type: 'string' },
    date: { type: 'string' },
  },
};

// =============================================================================
// ONBOARDING EXTRACTION
// =============================================================================

export interface ExtractedDomain {
  name: string;
  type: 'work' | 'family' | 'sport' | 'personal' | 'health';
  confidence: number;
}

export async function extractDomains(input: string): Promise<string[]> {
  const result = await extract<{ domains: ExtractedDomain[] }>(
    `Extract the life domains the user mentions. Common domains include:
- work (job, career, clients, projects, business, studio, company)
- family (spouse, children, parents, relatives, partner)
- sport (training, racing, fitness goals, cycling, running, triathlon)
- personal (side projects, hobbies, learning, travel)
- health (wellness, medical, mental health, recovery)

Be generous in interpretation. If they mention "my studio" or "clients", that's work.
If they mention names that sound like family members, that's family.
If they mention training or races, that's sport.`,
    input,
    DOMAIN_SCHEMA
  );

  if (isError(result)) {
    console.error('Domain extraction failed:', result.error);
    return [];
  }

  return result.data.domains
    .filter(d => d.confidence > 0.5)
    .map(d => d.name);
}

export interface ExtractedEntity {
  name: string;
  type: 'person' | 'project' | 'company' | 'event' | 'concept' | 'place';
  domain: 'work' | 'family' | 'sport' | 'personal' | 'health';
  description?: string;
  priority?: 'critical' | 'active' | 'background';
  relationship?: string;
  date?: string;
  confidence: number;
}

export async function extractWorkEntities(input: string): Promise<ExtractedEntity[]> {
  const result = await extract<{ entities: ExtractedEntity[] }>(
    `Extract work-related entities from the user's description.
Look for:
- Projects (with client names, deadlines, stakes)
- Companies (clients, employers, partners)
- People (colleagues, bosses, clients)
- Events (deadlines, meetings, launches)

If they mention something is "big", "high stakes", or "important", mark priority as "critical".
If it's ongoing or current focus, mark as "active".
Include context in the description (e.g., "rebrand project", "Q2 deadline").`,
    input,
    ENTITY_SCHEMA
  );

  if (isError(result)) return [];
  return result.data.entities.filter(e => e.confidence > 0.5);
}

export async function extractFamilyEntities(input: string): Promise<ExtractedEntity[]> {
  const result = await extract<{ entities: ExtractedEntity[] }>(
    `Extract family members and family-related entities.
Look for:
- People (spouse, children, parents, siblings) - include relationships and ages if mentioned
- Events (birthdays, trips, milestones, vacations)
- Places (family home, vacation spots)

For people, always include their relationship in the "relationship" field (e.g., "wife", "son", "daughter").
If ages are mentioned, include them in the description (e.g., "son, 4 years old").
Names should be just the first name.`,
    input,
    ENTITY_SCHEMA
  );

  if (isError(result)) return [];
  return result.data.entities.filter(e => e.confidence > 0.5);
}

export async function extractEvents(input: string): Promise<ExtractedEntity[]> {
  const result = await extract<{ entities: ExtractedEntity[] }>(
    `Extract events and time-bound commitments.
Look for:
- Trips and vacations (with dates if mentioned)
- Deadlines and milestones
- Recurring events (weekly meetings, training blocks)
- Special occasions (birthdays, anniversaries)
- Races or competitions

If the user indicates something is "non-negotiable" or "can't miss", mark priority as "critical".
Include dates in the "date" field when mentioned (format: "Jan 12-17" or "March 2026").
The type should be "event".`,
    input,
    ENTITY_SCHEMA
  );

  if (isError(result)) return [];
  return result.data.entities.filter(e => e.type === 'event');
}

export async function extractHealthEntities(input: string): Promise<ExtractedEntity[]> {
  const result = await extract<{ entities: ExtractedEntity[] }>(
    `Extract fitness, sport, and health-related entities.
Look for:
- Training goals (races, events, targets like "sub-3 marathon")
- Sports activities (cycling, running, swimming, triathlon)
- Health focuses (weight, sleep, stress management, recovery)
- Competitions or events with dates

For races/events, try to extract dates if mentioned.
Set domain to "sport" for training/racing, "health" for wellness.`,
    input,
    ENTITY_SCHEMA
  );

  if (isError(result)) return [];
  return result.data.entities;
}

export async function extractIntegrations(input: string): Promise<string[]> {
  const result = await extract<{ integrations: string[] }>(
    `Identify any tracking services, apps, or integrations the user mentions.
Common ones:
- WHOOP (sleep, recovery, strain tracking)
- TrainingPeaks (training plans, cycling/running)
- Garmin (GPS watches, cycling computers)
- Strava (activity tracking, social fitness)
- Apple Health (health data aggregation)
- Google Calendar, Apple Calendar (scheduling)

Only include ones explicitly mentioned or clearly implied.`,
    input,
    INTEGRATION_SCHEMA
  );

  if (isError(result)) return [];
  return result.data.integrations;
}

// =============================================================================
// CHAT RESPONSE
// =============================================================================

const RAY_SYSTEM_PROMPT = `You are Ray, a personal coach AI in Canopy.

Your personality:
- Direct and efficient - no fluff or excessive pleasantries
- Warm but not saccharine
- You understand the user's full life context
- You make connections across domains (work, family, health, etc.)
- You're proactive about spotting conflicts and trade-offs
- You speak like a trusted advisor, not a chatbot

Response style:
- Keep responses focused and actionable
- Use bullet points for lists
- Bold key entities or concepts with **asterisks**
- Reference entities by name when relevant
- Acknowledge the full picture, then focus on what's actionable
- Don't end with questions unless genuinely needed

You have access to the user's entities and context. Use this to give personalized, relevant responses.`;

/**
 * Get time-appropriate greeting period
 */
function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

/**
 * Build temporal context string with current time info
 */
function getTemporalContext(userName?: string): string {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  let context = `Current time: ${formatter.format(now)}
Timezone: ${timezone}
Time of day: ${getTimeOfDay()}`;

  if (userName) {
    context += `\nUser's name: ${userName}`;
  }

  return context;
}

/**
 * Build context from plugin signals
 * Uses time, weather, and health signals from the plugin system
 */
export function buildPluginContext(userName?: string): {
  temporal: string;
  weather?: string;
  capacity?: string;
} {
  const result: { temporal: string; weather?: string; capacity?: string } = {
    temporal: '',
  };

  // Time context from time plugin
  const timeSignal = get(recentTime);
  if (timeSignal) {
    const t = timeSignal.data as {
      formattedTime: string;
      dayOfWeek: string;
      date: string;
      timezone: string;
      timeOfDay: string;
    };
    result.temporal = `Current time: ${t.dayOfWeek}, ${t.date} at ${t.formattedTime}
Timezone: ${t.timezone}
Time of day: ${t.timeOfDay}`;
    if (userName) {
      result.temporal += `\nUser's name: ${userName}`;
    }
  } else {
    // Fallback to direct calculation
    result.temporal = getTemporalContext(userName);
  }

  // Weather context from weather plugin
  const weatherSignal = get(recentWeather);
  if (weatherSignal) {
    const w = weatherSignal.data as {
      formatted?: string;
      temperature: number;
      condition: string;
      windSpeed: number;
    };
    if (w.formatted) {
      result.weather = w.formatted;
    } else {
      let weather = `${w.temperature}°C, ${w.condition}`;
      if (w.windSpeed > 15) {
        weather += `, windy (${w.windSpeed} km/h)`;
      }
      result.weather = weather;
    }
  }

  // Capacity context from WHOOP plugin (if connected)
  const recoverySignal = get(recentRecovery);
  if (recoverySignal) {
    const r = recoverySignal.data as {
      recoveryScore?: number;
      hrvStatus?: string;
    };
    if (r.recoveryScore !== undefined) {
      result.capacity = `Recovery: ${r.recoveryScore}%`;
      if (r.hrvStatus) {
        result.capacity += ` (${r.hrvStatus})`;
      }
    }
  }

  return result;
}

export function generateChatResponse(
  query: string,
  context: {
    entities: Entity[];
    memories?: string[];
    threadHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    location?: string;
    userName?: string;
    weather?: string; // Formatted weather string e.g. "24°C, partly cloudy"
    usePluginContext?: boolean; // Use plugin signals for time/weather/capacity
  },
  callbacks: StreamCallbacks
): { streamId: string; cancel: () => void } {
  // Build context section
  let contextSection = '\n\n--- CURRENT CONTEXT ---\n';

  // Get context from plugins or use provided values
  const pluginCtx = context.usePluginContext !== false ? buildPluginContext(context.userName) : null;

  // Time context (prefer plugin, fall back to direct)
  if (pluginCtx) {
    contextSection += pluginCtx.temporal + '\n';
  } else {
    contextSection += getTemporalContext(context.userName) + '\n';
  }

  if (context.location) {
    contextSection += `Location: ${context.location}\n`;
  }

  // Weather context (prefer explicit, then plugin)
  const weather = context.weather || pluginCtx?.weather;
  if (weather) {
    contextSection += `Weather: ${weather}\n`;
  }

  // Capacity context from WHOOP (if connected)
  if (pluginCtx?.capacity) {
    contextSection += `${pluginCtx.capacity}\n`;
  }

  if (context.entities.length > 0) {
    contextSection += '\n--- USER CONTEXT ---\n';
    contextSection += 'Active entities:\n';
    for (const entity of context.entities.slice(0, 15)) {
      contextSection += `- ${entity.name} (${entity.type}, ${entity.domain})`;
      if (entity.description) contextSection += `: ${entity.description}`;
      contextSection += '\n';
    }
  }

  if (context.memories && context.memories.length > 0) {
    contextSection += '\nRelevant memories:\n';
    for (const memory of context.memories.slice(0, 5)) {
      contextSection += `- ${memory}\n`;
    }
  }

  const messages: AIMessage[] = [
    ...(context.threadHistory || []),
    { role: 'user', content: query },
  ];

  return stream(messages, callbacks, {
    system: RAY_SYSTEM_PROMPT + contextSection,
    maxTokens: 1024,
    temperature: 0.7,
  });
}

// =============================================================================
// DOCUMENT PROCESSING
// =============================================================================

export async function extractFromDocument(
  text: string,
  metadata: { filename: string; mimeType: string }
): Promise<ExtractedContent> {
  const result = await extract<{
    summary?: string;
    entities?: Array<{
      name: string;
      type: string;
      domain?: string;
      confidence: number;
      details?: Record<string, unknown>;
    }>;
    title?: string;
    author?: string;
    date?: string;
  }>(
    `Analyze this document and extract:
1. A brief summary (1-2 sentences)
2. Any entities mentioned (people, companies, projects, events)
3. Title and author if apparent
4. Creation date if mentioned

Document filename: ${metadata.filename}
Document type: ${metadata.mimeType}`,
    text.slice(0, 15000), // Limit content length
    DOCUMENT_SCHEMA,
  );

  if (isError(result)) {
    return { summary: 'Failed to process document' };
  }

  const data = result.data;
  return {
    summary: data.summary,
    title: data.title,
    author: data.author,
    entities: data.entities?.map(e => ({
      name: e.name,
      type: e.type as EntitySuggestion['type'],
      domain: e.domain,
      confidence: e.confidence,
      source: metadata.filename,
      details: e.details,
    })),
  };
}

export async function extractFromUrl(
  content: string,
  url: string
): Promise<ExtractedContent> {
  const result = await extract<{
    summary?: string;
    entities?: Array<{
      name: string;
      type: string;
      domain?: string;
      confidence: number;
      details?: Record<string, unknown>;
    }>;
    title?: string;
    author?: string;
  }>(
    `Analyze this web page and extract:
1. A brief summary of what this page is about
2. Any entities mentioned (people, companies, projects, organizations)
3. The page title
4. The author or organization behind the page

URL: ${url}`,
    content.slice(0, 10000), // Limit content length
    DOCUMENT_SCHEMA,
  );

  if (isError(result)) {
    return { summary: 'Failed to process URL', title: url };
  }

  const data = result.data;
  return {
    summary: data.summary,
    title: data.title || url,
    author: data.author,
    entities: data.entities?.map(e => ({
      name: e.name,
      type: e.type as EntitySuggestion['type'],
      domain: e.domain,
      confidence: e.confidence,
      source: url,
      details: e.details,
    })),
  };
}

// =============================================================================
// PERSONA CONTEXT EXTRACTION
// =============================================================================

export interface ExtractedPersonaContext {
  professional?: {
    summary?: string;
    currentRole?: string;
    company?: string;
    expertise?: string[];
  };
  training?: {
    focus?: string;
    recentActivity?: string;
    weeklyPattern?: string;
    goals?: string;
  };
  life?: {
    recentMoments?: string[];
    visualThemes?: string[];
  };
}

const PERSONA_CONTEXT_SCHEMA = {
  type: 'object',
  properties: {
    professional: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        currentRole: { type: 'string' },
        company: { type: 'string' },
        expertise: { type: 'array', items: { type: 'string' } },
      },
    },
    training: {
      type: 'object',
      properties: {
        focus: { type: 'string' },
        recentActivity: { type: 'string' },
        weeklyPattern: { type: 'string' },
        goals: { type: 'string' },
      },
    },
    life: {
      type: 'object',
      properties: {
        recentMoments: { type: 'array', items: { type: 'string' } },
        visualThemes: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

export async function extractPersonaContext(
  platformContent: Array<{
    platform: string;
    scope: 'personal' | 'work';
    content: string;
  }>
): Promise<ExtractedPersonaContext | null> {
  if (platformContent.length === 0) return null;

  const contentSummary = platformContent
    .map(p => `=== ${p.platform.toUpperCase()} (${p.scope}) ===\n${p.content}`)
    .join('\n\n');

  const result = await extract<ExtractedPersonaContext>(
    `Analyze this user's digital presence and extract context.
Focus on:
- Professional identity (from LinkedIn, company sites)
- Training patterns (from Strava activities)
- Life moments (from Instagram, without being invasive)

Be factual - only include what's clearly stated or strongly implied.`,
    contentSummary,
    PERSONA_CONTEXT_SCHEMA,
  );

  if (isError(result)) {
    return null;
  }

  return result.data;
}
