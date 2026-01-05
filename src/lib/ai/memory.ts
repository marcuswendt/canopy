// Memory Extraction System
// Extracts memorable facts from conversations and stores them

import { extract, isError } from './index';
import type { Entity, Memory } from '$lib/db/types';

// =============================================================================
// TYPES
// =============================================================================

export interface ExtractedFact {
  content: string;
  importance: 'high' | 'medium' | 'low';
  category: 'preference' | 'fact' | 'event' | 'decision' | 'insight';
  entities: string[]; // Entity names mentioned
  tags: string[];
  expiresAt?: string; // ISO date if temporal
}

interface ExtractionResult {
  facts: ExtractedFact[];
  shouldRemember: boolean;
}

// =============================================================================
// SCHEMA
// =============================================================================

const MEMORY_SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The memorable fact, written as a statement about the user',
          },
          importance: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'How important is this to remember long-term',
          },
          category: {
            type: 'string',
            enum: ['preference', 'fact', 'event', 'decision', 'insight'],
          },
          entities: {
            type: 'array',
            items: { type: 'string' },
            description: 'Names of people, projects, or concepts mentioned',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Relevant tags for this fact',
          },
          expiresAt: {
            type: 'string',
            description: 'ISO date if this fact is time-bound (e.g., "meeting on Friday")',
          },
        },
        required: ['content', 'importance', 'category', 'entities', 'tags'],
      },
    },
    shouldRemember: {
      type: 'boolean',
      description: 'Whether there are facts worth storing from this conversation',
    },
  },
  required: ['facts', 'shouldRemember'],
};

// =============================================================================
// EXTRACTION
// =============================================================================

const EXTRACTION_PROMPT = `You are analyzing a conversation to extract memorable facts about the user.

Extract facts that would be useful to remember for future conversations:
- User preferences (how they like to work, communicate, etc.)
- Personal facts (family members, pets, important dates)
- Decisions made (chose X over Y, committed to something)
- Events (upcoming trips, deadlines, milestones)
- Insights (patterns they've noticed, lessons learned)

IMPORTANT:
- Write facts as statements about the user: "User prefers X" or "User's wife is named Sarah"
- Only extract concrete, specific information - not general conversation
- Skip greetings, pleasantries, and meta-conversation
- High importance: life events, major decisions, key relationships
- Medium importance: preferences, ongoing projects, regular activities
- Low importance: one-off mentions, minor details

If the conversation is just casual chat with nothing memorable, set shouldRemember to false.`;

/**
 * Extract memorable facts from a conversation exchange
 */
export async function extractMemories(
  userMessage: string,
  assistantResponse: string,
  existingEntities: Entity[] = []
): Promise<ExtractedFact[]> {
  // Skip very short exchanges
  if (userMessage.length < 20 && assistantResponse.length < 50) {
    return [];
  }

  // Build context with entity names for better extraction
  const entityContext = existingEntities.length > 0
    ? `\n\nKnown entities: ${existingEntities.map(e => `${e.name} (${e.type})`).join(', ')}`
    : '';

  const conversationText = `User: ${userMessage}\n\nAssistant: ${assistantResponse}`;

  const result = await extract<ExtractionResult>(
    EXTRACTION_PROMPT + entityContext,
    conversationText,
    MEMORY_SCHEMA
  );

  if (isError(result)) {
    console.error('Memory extraction failed:', result.error);
    return [];
  }

  if (!result.data.shouldRemember || result.data.facts.length === 0) {
    return [];
  }

  return result.data.facts;
}

/**
 * Extract memories from a batch of messages (e.g., when summarizing a thread)
 */
export async function extractMemoriesFromThread(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  existingEntities: Entity[] = []
): Promise<ExtractedFact[]> {
  // Build conversation transcript
  const transcript = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  if (transcript.length < 100) {
    return [];
  }

  const entityContext = existingEntities.length > 0
    ? `\n\nKnown entities: ${existingEntities.map(e => `${e.name} (${e.type})`).join(', ')}`
    : '';

  const result = await extract<ExtractionResult>(
    EXTRACTION_PROMPT + entityContext,
    transcript.slice(0, 10000), // Limit to ~10k chars
    MEMORY_SCHEMA
  );

  if (isError(result)) {
    console.error('Thread memory extraction failed:', result.error);
    return [];
  }

  if (!result.data.shouldRemember) {
    return [];
  }

  return result.data.facts;
}

// =============================================================================
// STORAGE HELPERS
// =============================================================================

/**
 * Convert extracted fact to memory record for storage
 */
export function factToMemory(
  fact: ExtractedFact,
  sourceType: 'capture' | 'thread' | 'manual',
  sourceId?: string,
  entityIds: string[] = []
): Omit<Memory, 'id' | 'created_at'> {
  const importanceScore = {
    high: 0.9,
    medium: 0.6,
    low: 0.3,
  }[fact.importance];

  return {
    content: fact.content,
    source_type: sourceType,
    source_id: sourceId,
    entities: JSON.stringify(entityIds),
    importance: importanceScore,
    tags: JSON.stringify([fact.category, ...fact.tags]),
    expires_at: fact.expiresAt,
  };
}

/**
 * Match extracted entity names to existing entities
 */
export function matchEntitiesToFact(
  fact: ExtractedFact,
  allEntities: Entity[]
): string[] {
  const matched: string[] = [];

  for (const name of fact.entities) {
    const lowerName = name.toLowerCase();
    const entity = allEntities.find(e =>
      e.name.toLowerCase() === lowerName ||
      e.name.toLowerCase().includes(lowerName) ||
      lowerName.includes(e.name.toLowerCase())
    );
    if (entity) {
      matched.push(entity.id);
    }
  }

  return matched;
}

// =============================================================================
// MEMORY RETRIEVAL
// =============================================================================

/**
 * Score memories for relevance to a query
 */
export function scoreMemoryRelevance(
  memory: Memory,
  query: string,
  mentionedEntityIds: string[]
): number {
  let score = 0;

  // Base importance score
  score += memory.importance * 0.3;

  // Query term matches
  const queryTerms = query.toLowerCase().split(/\s+/);
  const contentLower = memory.content.toLowerCase();
  const matchingTerms = queryTerms.filter(t =>
    t.length > 3 && contentLower.includes(t)
  );
  score += (matchingTerms.length / queryTerms.length) * 0.4;

  // Entity overlap
  const memoryEntities = memory.entities
    ? JSON.parse(memory.entities) as string[]
    : [];
  const entityOverlap = mentionedEntityIds.filter(id =>
    memoryEntities.includes(id)
  ).length;
  if (mentionedEntityIds.length > 0) {
    score += (entityOverlap / mentionedEntityIds.length) * 0.3;
  }

  // Recency bonus (within last 7 days)
  const daysSinceCreated = Math.floor(
    (Date.now() - new Date(memory.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceCreated < 7) {
    score += 0.1 * (1 - daysSinceCreated / 7);
  }

  return Math.min(score, 1);
}

/**
 * Select the most relevant memories for a conversation
 */
export function selectRelevantMemories(
  memories: Memory[],
  query: string,
  mentionedEntityIds: string[],
  maxCount: number = 5
): Memory[] {
  const scored = memories
    .map(m => ({
      memory: m,
      score: scoreMemoryRelevance(m, query, mentionedEntityIds),
    }))
    .filter(item => item.score > 0.2) // Minimum relevance threshold
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxCount).map(item => item.memory);
}

/**
 * Format memories for inclusion in Ray's context
 */
export function formatMemoriesForContext(memories: Memory[]): string[] {
  return memories.map(m => {
    const tags = m.tags ? JSON.parse(m.tags) as string[] : [];
    const tagStr = tags.length > 0 ? ` [${tags[0]}]` : '';
    return `${m.content}${tagStr}`;
  });
}
