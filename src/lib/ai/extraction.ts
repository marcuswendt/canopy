// AI-powered extraction functions for Canopy
// Uses the AI provider abstraction to extract structured data from user input

import { extract, stream, isError, type AIMessage, type StreamCallbacks } from './index';
import type { Entity, Memory } from '$lib/db/types';
import type { ExtractedContent, EntitySuggestion } from '$lib/uploads';
import { get } from 'svelte/store';
import { recentTime, recentWeather, recentRecovery, todayEvents } from '$lib/integrations/registry';
import { gatherReferenceContext, formatContextForPrompt, type ReferenceContext } from '$lib/reference/registry';
import { formatMemoriesForContext } from './memory';

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
// ONBOARDING DOCUMENT EXTRACTION (Stage 1)
// =============================================================================

/**
 * Schema for comprehensive document extraction during onboarding.
 * This processes the full document and extracts all relevant entities.
 */
const ONBOARDING_DOCUMENT_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'A 2-3 sentence summary of who this person is and what matters to them',
    },
    domains: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['work', 'family', 'sport', 'personal', 'health'] },
          description: { type: 'string', description: 'Brief description of this life area' },
        },
        required: ['type'],
      },
    },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['person', 'project', 'company', 'event', 'goal', 'focus'] },
          domain: { type: 'string', enum: ['work', 'family', 'sport', 'personal', 'health'] },
          description: { type: 'string' },
          relationship: { type: 'string', description: 'For people: wife, husband, son, daughter, colleague, etc.' },
          priority: { type: 'string', enum: ['critical', 'active', 'background'] },
          date: { type: 'string', description: 'For events/goals: relevant date or timeframe' },
          needsConfirmation: { type: 'boolean', description: 'True if this is interpretive (focuses, inferred goals)' },
        },
        required: ['name', 'type', 'domain'],
      },
    },
    topicsNotCovered: {
      type: 'array',
      items: { type: 'string' },
      description: 'Life areas or topics NOT mentioned that would be good to ask about',
    },
  },
  required: ['summary', 'domains', 'entities'],
};

export interface OnboardingDocumentExtraction {
  summary: string;
  domains: Array<{
    type: 'work' | 'family' | 'sport' | 'personal' | 'health';
    description?: string;
  }>;
  entities: Array<{
    name: string;
    type: 'person' | 'project' | 'company' | 'event' | 'goal' | 'focus';
    domain: 'work' | 'family' | 'sport' | 'personal' | 'health';
    description?: string;
    relationship?: string;
    priority?: 'critical' | 'active' | 'background';
    date?: string;
    needsConfirmation?: boolean;
  }>;
  topicsNotCovered?: string[];
}

/**
 * Extract comprehensive information from an onboarding document.
 * This is Stage 1 - processes the full document to extract structured data.
 * The results are then passed to the conversational flow (Stage 2).
 */
export async function extractFromOnboardingDocument(
  content: string,
  filename?: string
): Promise<OnboardingDocumentExtraction | null> {
  const prompt = `You are an expert at understanding people's lives from their personal documents.
Analyze this onboarding document comprehensively and extract ALL relevant information.

EXTRACTION RULES:
1. PEOPLE: Extract everyone mentioned with their relationship to the user
   - Include ages/birthdays if mentioned (create birthday events too)
   - For children, note their birthdate for birthday events

2. DOMAINS: Identify which life areas are covered
   - work: career, business, clients, projects
   - family: spouse, children, parents, home
   - sport: fitness, training, races, health goals
   - personal: hobbies, side projects, learning
   - health: wellness, medical, mental health

3. GOALS: Things the user wants to achieve
   - "I want to...", "I need to...", "my goal is...", "hoping to..."
   - Set priority based on emotional weight

4. FOCUSES: Interpretive life themes (ALWAYS set needsConfirmation=true)
   - Read between the lines for underlying concerns
   - Examples: "Work-Life Balance", "Body & Fertility", "Structure & Control"

5. EVENTS: Birthdays, anniversaries, races, deadlines
   - Create birthday events from birthdates mentioned
   - Include recurring events (anniversaries)

6. PROJECTS: Active work or personal initiatives

7. TOPICS NOT COVERED: What's missing that would be good to ask about?
   - If no fitness mentioned, note it
   - If work details sparse, note it
   - This helps the conversation know what to explore

CRITICAL: Only extract what is EXPLICITLY mentioned. Do not invent or hallucinate.
For focuses (interpretive themes), ALWAYS set needsConfirmation=true.

${filename ? `Document: ${filename}` : ''}`;

  const result = await extract<OnboardingDocumentExtraction>(
    prompt,
    content, // Pass full document as input
    ONBOARDING_DOCUMENT_SCHEMA,
    { temperature: 0.3 } // Low temperature for accurate extraction
  );

  if (isError(result)) {
    console.error('Onboarding document extraction failed:', result.error, 'code:', result.code);
    return null;
  }

  console.log(`Extracted from document: ${result.data.entities.length} entities, ${result.data.domains.length} domains`);
  return result.data;
}

// =============================================================================
// ONBOARDING EXTRACTION (Legacy)
// =============================================================================

export interface ExtractedDomain {
  name: string;
  type: 'work' | 'family' | 'sport' | 'personal' | 'health';
  confidence: number;
}

const ACKNOWLEDGMENT_SCHEMA = {
  type: 'object',
  properties: {
    response: { type: 'string', description: 'A brief, natural acknowledgment' },
  },
  required: ['response'],
};

/**
 * Generate a contextual acknowledgment for what the user just shared during onboarding.
 * Uses AI to respond naturally to the specific content, not just generic templates.
 */
export async function generateDomainAcknowledgment(
  userInput: string,
  extractedDomains: string[],
  existingDomains: string[] = []
): Promise<string> {
  // Check if URLs were provided
  const hasUrls = userInput.includes('[User provided') && userInput.includes('URL');

  const result = await extract<{ response: string }>(
    `You are Ray, a personal coach. The user just shared part of their life during onboarding.

Generate a brief, warm acknowledgment (1-2 short sentences, max 20 words) that:
- Actually responds to WHAT they said, not just that they said something
- Feels conversational and natural, like a real coach listening
- Avoids generic phrases like "Got it" or "Thanks for sharing"
- Can reference specific things they mentioned (names, activities, roles, company names)
- Shows you understood the meaning, not just the words
${hasUrls ? '- If URLs/links were shared, briefly acknowledge you\'ll check those out to learn more about them' : ''}

Previously collected domains: ${existingDomains.join(', ') || 'none yet'}
New domains identified: ${extractedDomains.join(', ')}

Examples of good responses:
- "Sarah and the kids—family's clearly central for you."
- "A design studio with 45 people—that's a lot of plates spinning."
- "Ultra-distance cycling. That takes serious commitment."
- "Three young kids and a business—no wonder you're busy."
- "FIELD.IO in London and Berlin—I'll take a look at those links to get the full picture."
- "Founder and Creative CEO. The links will help me understand more about what you've built."

Examples of bad responses:
- "Got it: Family." (too generic)
- "Thanks for sharing about your work." (too formal)
- "I understand you have family." (robotic)
- "I will look at your URLs." (awkward)`,
    userInput,
    ACKNOWLEDGMENT_SCHEMA,
    { temperature: 0.8 }
  );

  if (isError(result)) {
    // Fallback to simple acknowledgment if AI fails
    return `${extractedDomains.join(', ')}—noted.`;
  }

  return result.data.response;
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
 * Uses time, weather, health, and calendar signals from the plugin system
 */
export function buildPluginContext(userName?: string): {
  temporal: string;
  weather?: string;
  capacity?: string;
  agenda?: string;
} {
  const result: { temporal: string; weather?: string; capacity?: string; agenda?: string } = {
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

  // Calendar context from Google Calendar plugin (if connected)
  const events = get(todayEvents);
  if (events && events.length > 0) {
    const eventLines = events.slice(0, 5).map(e => {
      const data = e.data as {
        title: string;
        formattedTime: string;
        hasVideoCall?: boolean;
        attendeeCount?: number;
      };
      let line = `- ${data.formattedTime}: ${data.title}`;
      if (data.hasVideoCall) line += ' (video call)';
      if (data.attendeeCount && data.attendeeCount > 0) {
        line += ` (${data.attendeeCount} attendees)`;
      }
      return line;
    });
    result.agenda = `Today's agenda:\n${eventLines.join('\n')}`;
  }

  return result;
}

export function generateChatResponse(
  query: string,
  context: {
    entities: Entity[];
    memories?: Memory[] | string[];
    threadHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    location?: string;
    userName?: string;
    weather?: string; // Formatted weather string e.g. "24°C, partly cloudy"
    usePluginContext?: boolean; // Use plugin signals for time/weather/capacity
    referenceContext?: ReferenceContext; // Search results from reference plugins
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

  // Calendar agenda (if connected)
  if (pluginCtx?.agenda) {
    contextSection += `\n${pluginCtx.agenda}\n`;
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

  // Format memories - handle both Memory objects and strings
  if (context.memories && context.memories.length > 0) {
    contextSection += '\nRelevant memories:\n';
    const memoryStrings = typeof context.memories[0] === 'string'
      ? context.memories as string[]
      : formatMemoriesForContext(context.memories as Memory[]);
    for (const memory of memoryStrings.slice(0, 5)) {
      contextSection += `- ${memory}\n`;
    }
  }

  // Add reference context from external sources (Notion, Apple Notes, etc.)
  if (context.referenceContext) {
    const refPrompt = formatContextForPrompt(context.referenceContext);
    if (refPrompt) {
      contextSection += refPrompt;
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
// BONSAI SUGGESTION EXTRACTION
// =============================================================================

/**
 * Schema for extracting entities and memories from a chat exchange
 * Used for the Bonsai confirmation system
 */
const CHAT_SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the person, project, company, etc.' },
          type: { type: 'string', enum: ['person', 'project', 'company', 'event', 'goal', 'focus'] },
          domain: { type: 'string', enum: ['work', 'family', 'sport', 'personal', 'health'] },
          description: { type: 'string', description: 'Brief description or context' },
          relationship: { type: 'string', description: 'For people: their role or relationship (e.g., "Nike" for someone at Nike)' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['name', 'type', 'domain', 'confidence'],
      },
    },
    memories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The memorable fact, written as a statement' },
          importance: { type: 'string', enum: ['high', 'medium', 'low'] },
          category: { type: 'string', enum: ['preference', 'fact', 'event', 'decision', 'insight'] },
          entityNames: { type: 'array', items: { type: 'string' }, description: 'Names of entities mentioned' },
        },
        required: ['content', 'importance', 'category', 'entityNames'],
      },
    },
  },
  required: ['entities', 'memories'],
};

const CHAT_SUGGESTION_PROMPT = `Analyze this conversation exchange and extract NEW entities and memorable facts.

## ENTITIES TO EXTRACT
People, projects, companies, events, goals mentioned that the user might want to track.

ONLY extract entities that are:
- Explicitly named in the user's message
- Not already known (check the existing entities list)
- Specific enough to be useful (not generic terms)

For people, include their relationship/context (e.g., "colleague at Nike", "wife").

## MEMORIES TO EXTRACT
Facts about the user worth remembering for future conversations:
- Preferences (how they like to work, communicate)
- Personal facts (family, important dates)
- Decisions made
- Events or deadlines mentioned
- Insights or patterns they've noticed

CRITICAL - DO NOT EXTRACT:
- Information already in the "existing entities" or "existing memories" lists
- Generic statements or pleasantries
- Things the assistant said (only extract what the USER reveals)
- Duplicate or near-duplicate information

Set confidence based on how clearly the entity/fact was mentioned:
- 0.9-1.0: Explicitly named with details
- 0.7-0.8: Clearly mentioned but less context
- 0.5-0.6: Inferred from context (lower priority)

Return empty arrays if there's nothing new worth extracting.`;

export interface ChatSuggestionResult {
  entities: Array<{
    name: string;
    type: Entity['type'];
    domain: Entity['domain'];
    description?: string;
    relationship?: string;
    confidence: number;
  }>;
  memories: Array<{
    content: string;
    importance: 'high' | 'medium' | 'low';
    category: 'preference' | 'fact' | 'event' | 'decision' | 'insight';
    entityNames: string[];
  }>;
}

/**
 * Extract entity and memory suggestions from a chat exchange
 * Returns suggestions for user confirmation (Bonsai principle)
 */
export async function extractChatSuggestions(
  userMessage: string,
  assistantResponse: string,
  existingEntities: Entity[] = [],
  existingMemories: Memory[] = []
): Promise<ChatSuggestionResult> {
  // Skip very short exchanges
  if (userMessage.length < 15) {
    return { entities: [], memories: [] };
  }

  // Build context about what we already know
  let context = '';

  if (existingEntities.length > 0) {
    const entityList = existingEntities
      .slice(0, 30)
      .map(e => `${e.name} (${e.type}, ${e.domain})`)
      .join(', ');
    context += `\n\nExisting entities (DO NOT re-extract these): ${entityList}`;
  }

  if (existingMemories.length > 0) {
    const memoryList = existingMemories
      .slice(0, 20)
      .map(m => m.content)
      .join('; ');
    context += `\n\nExisting memories (DO NOT duplicate these): ${memoryList}`;
  }

  const conversationText = `User message: ${userMessage}\n\nAssistant response: ${assistantResponse}`;

  const result = await extract<ChatSuggestionResult>(
    CHAT_SUGGESTION_PROMPT + context,
    conversationText,
    CHAT_SUGGESTION_SCHEMA
  );

  if (isError(result)) {
    console.error('Chat suggestion extraction failed:', result.error);
    return { entities: [], memories: [] };
  }

  // Filter by confidence threshold
  const filteredEntities = (result.data.entities || []).filter(e => e.confidence >= 0.6);
  const filteredMemories = result.data.memories || [];

  return {
    entities: filteredEntities,
    memories: filteredMemories,
  };
}

/**
 * Gather reference context for a user message
 * Searches connected reference plugins (Notion, Apple Notes) for relevant content
 */
export async function getReferencesForQuery(
  query: string,
  entities: Entity[]
): Promise<ReferenceContext> {
  const entityNames = entities.map(e => e.name);
  const entityTypes = entities.map(e => e.type);
  return gatherReferenceContext(query, entityNames, entityTypes);
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
// AI-DRIVEN ONBOARDING
// =============================================================================

export interface OnboardingContext {
  // Conversation so far
  messages: Array<{ role: 'ray' | 'user'; content: string }>;

  // What we've collected
  collected: {
    domains: string[];
    entities: Array<{ name: string; type: string; domain: string; description?: string }>;
    urls: string[];
    integrations: string[];
    userName?: string;
    location?: string;
  };

  // Pre-extracted document data (Stage 1 output - use extractFromOnboardingDocument first)
  documentExtraction?: OnboardingDocumentExtraction;

  // What integrations are available to offer
  availableIntegrations: Array<{ id: string; name: string; description: string }>;

  // Which integrations have already been offered/connected
  offeredIntegrations: string[];
  connectedIntegrations: string[];
}

export interface OnboardingResponse {
  // What Ray says next
  response: string;

  // Whether onboarding is complete enough to move on
  isComplete: boolean;

  // If AI wants to suggest an integration, which one
  suggestIntegration?: string;

  // Entities extracted from the user's last message
  extractedEntities?: Array<{
    name: string;
    type: 'person' | 'project' | 'company' | 'event' | 'goal' | 'focus';
    domain: 'work' | 'family' | 'sport' | 'personal' | 'health';
    description?: string;
    relationship?: string;
    needsConfirmation?: boolean;  // True if entity type is ambiguous and needs user confirmation
    priority?: 'critical' | 'active' | 'background';  // For goals and focuses: how important
    targetDate?: string;  // For goals: when to achieve (e.g., "May 2026", "this year")
    date?: string;  // For events: the date (e.g., "March 30" for birthdays)
  }>;

  // Domains extracted from the user's last message
  extractedDomains?: Array<{
    name: string;
    type: 'work' | 'family' | 'sport' | 'personal' | 'health';
  }>;
}

const ONBOARDING_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    response: {
      type: 'string',
      description: 'Ray\'s response - acknowledgment + question or wrap-up'
    },
    isComplete: {
      type: 'boolean',
      description: 'True if we have enough context to start (at least 2 domains with some depth)'
    },
    suggestIntegration: {
      type: 'string',
      description: 'Integration ID to suggest based on what user mentioned (e.g., "whoop" for fitness, "google-calendar" for work)'
    },
    extractedEntities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['person', 'project', 'company', 'event', 'goal', 'focus'] },
          domain: { type: 'string', enum: ['work', 'family', 'sport', 'personal', 'health'] },
          description: { type: 'string' },
          relationship: { type: 'string' },
          needsConfirmation: {
            type: 'boolean',
            description: 'True if this entity type is ambiguous and needs user confirmation (especially for companies/organisations)'
          },
          priority: {
            type: 'string',
            enum: ['critical', 'active', 'background'],
            description: 'For goals: critical = must achieve, active = working on, background = nice to have'
          },
          targetDate: {
            type: 'string',
            description: 'For goals: when to achieve (e.g., "May 2026", "this year", "Q2 2026")'
          },
          date: {
            type: 'string',
            description: 'For events: the date (e.g., "March 30" for birthdays, "Aug 15" for races)'
          }
        },
        required: ['name', 'type', 'domain']
      }
    },
    extractedDomains: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['work', 'family', 'sport', 'personal', 'health'] }
        },
        required: ['name', 'type']
      }
    }
  },
  required: ['response', 'isComplete']
};

/**
 * AI-driven onboarding: given full context, generate the next response.
 * This replaces the scripted state machine with a single intelligent call.
 */
export async function generateOnboardingResponse(
  context: OnboardingContext
): Promise<OnboardingResponse> {
  // Build conversation history for context
  const conversationHistory = context.messages
    .map(m => `${m.role === 'ray' ? 'Ray' : 'User'}: ${m.content}`)
    .join('\n\n');

  // Build what we know so far
  const collectedSummary = `
Domains discovered: ${context.collected.domains.length > 0 ? context.collected.domains.join(', ') : 'none yet'}
Entities (people, projects, etc.): ${context.collected.entities.length > 0
    ? context.collected.entities.map(e => `${e.name} (${e.type}, ${e.domain})`).join(', ')
    : 'none yet'}
URLs shared: ${context.collected.urls.length > 0 ? context.collected.urls.join(', ') : 'none'}
User name: ${context.collected.userName || 'unknown'}
Location: ${context.collected.location || 'unknown'}
  `.trim();

  // Build integration context
  const integrationContext = context.availableIntegrations.length > 0
    ? `\nAvailable integrations to suggest (if relevant to what user mentions):
${context.availableIntegrations.map(i => `- ${i.id}: ${i.name} - ${i.description}`).join('\n')}
Already offered: ${context.offeredIntegrations.join(', ') || 'none'}
Already connected: ${context.connectedIntegrations.join(', ') || 'none'}`
    : '';

  // Build document context from pre-extracted data (Stage 1 results)
  // This uses structured extraction results, not raw document content
  let documentContext = '';
  if (context.documentExtraction) {
    const ext = context.documentExtraction;
    const entityList = ext.entities.map(e => {
      let desc = `${e.name} (${e.type}, ${e.domain})`;
      if (e.relationship) desc += ` - ${e.relationship}`;
      if (e.description) desc += `: ${e.description}`;
      if (e.date) desc += ` [${e.date}]`;
      return desc;
    }).join('\n  - ');

    const domainList = ext.domains.map(d =>
      d.description ? `${d.type}: ${d.description}` : d.type
    ).join(', ');

    const gapsToExplore = ext.topicsNotCovered?.length
      ? `\nTopics NOT covered (good to ask about): ${ext.topicsNotCovered.join(', ')}`
      : '';

    // Check if document is comprehensive (multiple domains + many entities)
    const isComprehensive = ext.domains.length >= 3 && ext.entities.length >= 10;
    const hasMinimalGaps = !ext.topicsNotCovered || ext.topicsNotCovered.length <= 1;

    documentContext = `\n\n📄 DOCUMENT PROVIDED - Pre-extracted summary:
"${ext.summary}"

Life domains covered: ${domainList}
Entity count: ${ext.entities.length} entities extracted

Sample entities from document:
  - ${entityList}
${gapsToExplore}

🚨 CRITICAL INSTRUCTIONS FOR DOCUMENT-BASED ONBOARDING:
${isComprehensive && hasMinimalGaps ? `
✅ THIS IS A COMPREHENSIVE DOCUMENT - SET isComplete=true
The user provided detailed information about ${ext.domains.length} life domains with ${ext.entities.length} entities.
Your response should:
1. Acknowledge the depth of what they shared (be specific about domains/entities)
2. Summarize what you now understand about their life
3. SET isComplete=true - we have enough context to proceed
4. Do NOT ask for more information - they've given us plenty
` : `
This document covers several areas but may have gaps.
- Do NOT re-extract entities already captured above
- Do NOT ask about topics already covered
- Ask about specific gaps: ${ext.topicsNotCovered?.join(', ') || 'none identified'}
- If gaps are minor, consider marking isComplete=true
`}`;
  }

  const prompt = `You are Ray, a personal coach AI conducting an onboarding conversation.

YOUR GOAL: Understand the user's life context so you can be a useful coach. You need:
1. At least 2-3 life domains (work, family, sport, health, personal projects)
2. Some depth in each area - key people, projects, goals, what keeps them busy
3. The conversation should feel natural, not like an interrogation

CONVERSATION SO FAR:
${conversationHistory}

WHAT WE'VE COLLECTED:
${collectedSummary}
${integrationContext}
${documentContext}

YOUR TASK:
1. Read the user's last message carefully
2. Extract any new domains or entities they mentioned (people, projects, companies, events)
3. Generate a natural response that:
   - Acknowledges what they just said (reference specific details, names, concepts)
   - Asks a follow-up question that deepens understanding OR moves to a new area
   - NEVER asks about something they already told you
   - If they mentioned fitness/training/cycling/running, consider suggesting WHOOP
   - If they mentioned work/calendar/meetings, consider suggesting Google Calendar
4. Decide if we have enough context (2+ domains with meaningful depth)

CRITICAL RULES:
- Your response should be 1-3 sentences max
- Actually respond to what they said - don't be generic
- If they said their role, don't ask "what's your role"
- If they named family members, don't ask "who's in your family"
- When asking follow-ups, be specific: "What's keeping you busiest at FIELD.IO right now?" not "Tell me about work"
- Only suggest an integration if it's directly relevant to what they just mentioned
- Only mark isComplete=true when you have a real picture of their life (not just domain names)

ENTITY EXTRACTION RULES:
⚠️ CRITICAL: NEVER invent or hallucinate entities. ONLY extract entities that are EXPLICITLY mentioned BY NAME in the user's text.
- If the user doesn't mention "Astro", don't extract "Astro"
- If the user doesn't mention "Vercel", don't extract "Vercel"
- If you're not 100% certain the entity was mentioned, don't extract it
- People: First names only, with relationship to user (wife, son, friend, colleague)
- Companies: ONLY extract as 'company' if user explicitly states their role/ownership (e.g., "I'm CEO of", "I founded", "I work at")
- External organizations (race organizers, vendors, services) should NOT be extracted as companies - they are external references
- Events: Races, conferences, deadlines, AND personal milestones (birthdays, anniversaries)
  - When a person is mentioned with a date (e.g., "Elio 30 March 2025"), create BOTH:
    1. A 'person' entity for the person
    2. An 'event' entity for their birthday (e.g., "Elio's Birthday" with date "March 30")
  - For wedding dates, create an anniversary event (e.g., "Wedding Anniversary" with date "Oct 11")
  - Event dates should use the format suitable for annual recurrence (just month and day)
- Projects: Work initiatives, side projects the user is actively working on
- Set needsConfirmation=true for any company where ownership/role is unclear

GOAL EXTRACTION RULES:
- Goals are distinct from projects - they are specific outcomes the user wants to achieve
- Look for phrases like: "I want to", "I need to", "my goal is", "aiming for", "targeting", "hoping to"
- Examples: "lose weight", "complete HMR", "finish renovation by summer", "gain structure and control"
- For races: the race itself is an 'event', but "complete HMR as my A-race" or "finish mid-pack" is a 'goal'
- Set priority based on language: "my main goal", "A-race", "primary focus" = critical; "would like to" = active; "maybe", "someday" = background
- Include targetDate when mentioned (e.g., "this year", "by May", "Q2 2026")
- Goals should have actionable descriptions (what success looks like)

FOCUS EXTRACTION RULES (important - read between the lines):
- Focuses are ongoing life themes or areas requiring sustained attention - NOT concrete deliverables
- Extract implicit themes from emotional language, repeated concerns, or underlying tensions
- Examples from "I have three energetic boys... I want to become a better mother and stay more in control":
  - "Motherhood & Parenting" (focus, family) - not explicitly stated but clearly a major theme
  - "Structure & Control" (focus, personal) - underlying need mentioned across topics
- Examples from "My husband runs his own company... I want to support him in work-life balance":
  - "Partnership & Marriage" (focus, family) - relationship dynamics are clearly important
- Focuses often span multiple explicit mentions - look for patterns
- ⚠️ ALWAYS set needsConfirmation=true for focuses - they are interpretive and need user validation
- Good focus names are 2-4 words, thematic: "Work-Life Balance", "Body & Fertility", "Mental Load", "Emotional Processing"
- Set priority based on emotional weight: deeply felt concerns = critical, ongoing themes = active
- Description should explain the underlying theme (what's really going on)
- Focuses help organize the user's mental model - they're the "pillars" of their life

User's last message: "${context.messages[context.messages.length - 1]?.content || ''}"`;

  // Pass the user's last message as the input, keep the system instructions in prompt
  const userMessage = context.messages[context.messages.length - 1]?.content || '';

  const result = await extract<OnboardingResponse>(
    prompt,
    userMessage, // Pass user message as input, not empty string
    ONBOARDING_RESPONSE_SCHEMA,
    { temperature: 0.5 }
  );

  if (isError(result)) {
    // Log the actual error for debugging
    console.error('Onboarding extraction failed:', result.error, 'code:', result.code);

    // Check if we have comprehensive document data - if so, complete onboarding
    if (context.documentExtraction) {
      const ext = context.documentExtraction;
      const isComprehensive = ext.domains.length >= 3 && ext.entities.length >= 10;

      if (isComprehensive) {
        // We have enough from the document - complete onboarding
        const domainNames = ext.domains.map(d => d.type).join(', ');
        return {
          response: `That's a wealth of context—${ext.domains.length} life domains and ${ext.entities.length} people, projects, and events I can now factor in. I've got a solid picture of your world: ${domainNames}. Let's put this to work.`,
          isComplete: true,
        };
      }
    }

    // Check collected context - maybe we already have enough
    const hasEnoughContext = context.collected.domains.length >= 2 &&
                             context.collected.entities.length >= 5;

    if (hasEnoughContext) {
      return {
        response: "I've captured quite a bit about your world. Ready to dive in whenever you are.",
        isComplete: true,
      };
    }

    // Fallback for when we truly need more info
    return {
      response: context.collected.domains.length > 0
        ? `I've got ${context.collected.domains.join(' and ')} so far. What else takes up mental space for you?`
        : "Tell me more about what keeps you busy day-to-day.",
      isComplete: false,
    };
  }

  return result.data;
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
