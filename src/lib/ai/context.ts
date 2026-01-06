// Context Window Management for AI Provider
// Handles token estimation, summarization, and smart compaction

import { complete, isError, type AIMessage } from './index';
import type { Entity, Message } from '$lib/client/db/types';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Claude Sonnet 4 has 200K context, but we want headroom for response
const MAX_CONTEXT_TOKENS = 150000;
const TARGET_CONTEXT_TOKENS = 100000; // Compact when we exceed this
const MIN_RECENT_MESSAGES = 4; // Always keep at least this many recent messages
const SUMMARY_THRESHOLD = 10; // Summarize when we have more than this many messages

// Rough token estimation: ~4 chars per token for English
const CHARS_PER_TOKEN = 4;

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessageTokens(messages: AIMessage[]): number {
  return messages.reduce((sum, msg) => {
    // Add overhead for message structure
    return sum + estimateTokens(msg.content) + 10;
  }, 0);
}

export function estimateContextTokens(context: {
  systemPrompt: string;
  messages: AIMessage[];
  entities?: Entity[];
}): number {
  let total = estimateTokens(context.systemPrompt);
  total += estimateMessageTokens(context.messages);

  if (context.entities) {
    for (const entity of context.entities) {
      total += estimateTokens(entity.name) + estimateTokens(entity.description || '') + 20;
    }
  }

  return total;
}

// =============================================================================
// CONTEXT WINDOW MANAGEMENT
// =============================================================================

export interface ThreadContext {
  messages: AIMessage[];
  summary?: string;
  summaryUpToIndex?: number; // Messages up to this index are summarized
}

export interface ManagedContext {
  messages: AIMessage[];
  summary?: string;
  wasCompacted: boolean;
  estimatedTokens: number;
}

/**
 * Prepare messages for the context window, compacting if necessary
 */
export async function prepareContext(
  threadHistory: AIMessage[],
  existingSummary?: string,
  summaryUpToIndex: number = 0
): Promise<ManagedContext> {
  // If we have few messages, no compaction needed
  if (threadHistory.length <= MIN_RECENT_MESSAGES) {
    return {
      messages: threadHistory,
      summary: existingSummary,
      wasCompacted: false,
      estimatedTokens: estimateMessageTokens(threadHistory),
    };
  }

  const totalTokens = estimateMessageTokens(threadHistory);

  // If under threshold, return as-is with existing summary prefix
  if (totalTokens < TARGET_CONTEXT_TOKENS) {
    const messages = existingSummary
      ? [{ role: 'user' as const, content: `[Previous conversation summary: ${existingSummary}]` }, ...threadHistory.slice(summaryUpToIndex)]
      : threadHistory;

    return {
      messages,
      summary: existingSummary,
      wasCompacted: false,
      estimatedTokens: estimateMessageTokens(messages),
    };
  }

  // Need to compact - summarize older messages
  const messagesToSummarize = threadHistory.slice(summaryUpToIndex, -MIN_RECENT_MESSAGES);
  const recentMessages = threadHistory.slice(-MIN_RECENT_MESSAGES);

  if (messagesToSummarize.length < SUMMARY_THRESHOLD - MIN_RECENT_MESSAGES) {
    // Not enough to summarize, just truncate
    const messages = existingSummary
      ? [{ role: 'user' as const, content: `[Previous conversation summary: ${existingSummary}]` }, ...recentMessages]
      : recentMessages;

    return {
      messages,
      summary: existingSummary,
      wasCompacted: true,
      estimatedTokens: estimateMessageTokens(messages),
    };
  }

  // Generate summary of older messages
  const newSummary = await summarizeConversation(messagesToSummarize, existingSummary);

  const messages: AIMessage[] = [
    { role: 'user', content: `[Conversation context: ${newSummary}]` },
    ...recentMessages,
  ];

  return {
    messages,
    summary: newSummary,
    wasCompacted: true,
    estimatedTokens: estimateMessageTokens(messages),
  };
}

// =============================================================================
// SUMMARIZATION
// =============================================================================

/**
 * Summarize a portion of conversation history
 */
export async function summarizeConversation(
  messages: AIMessage[],
  existingSummary?: string
): Promise<string> {
  if (messages.length === 0) {
    return existingSummary || '';
  }

  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Ray'}: ${m.content}`)
    .join('\n\n');

  const prompt = existingSummary
    ? `Previous summary: ${existingSummary}\n\nNew conversation to incorporate:\n${conversationText}`
    : conversationText;

  const result = await complete(
    [{ role: 'user', content: prompt }],
    {
      system: `You are summarizing a conversation between a user and Ray (an AI coach) in the Canopy app.

Create a concise summary (2-4 sentences) that captures:
- Key topics and decisions discussed
- Important entities mentioned (people, projects, events)
- Any commitments or action items
- Emotional context or concerns raised

Focus on information Ray would need to continue helping the user effectively.
Write in third person (e.g., "The user discussed..." not "You discussed...").
Do not include pleasantries or meta-commentary.`,
      maxTokens: 300,
      temperature: 0.3,
    }
  );

  if (isError(result)) {
    console.error('Failed to summarize conversation:', result.error);
    // Fall back to simple truncation summary
    return existingSummary
      ? `${existingSummary} [Additional conversation occurred but could not be summarized]`
      : '[Previous conversation occurred but could not be summarized]';
  }

  return result.content;
}

/**
 * Summarize a thread for long-term storage
 */
export async function summarizeThread(
  messages: Message[],
  entities: Entity[]
): Promise<string> {
  if (messages.length === 0) {
    return '';
  }

  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Ray'}: ${m.content}`)
    .join('\n\n');

  const entityContext = entities.length > 0
    ? `\n\nEntities discussed: ${entities.map(e => e.name).join(', ')}`
    : '';

  const result = await complete(
    [{ role: 'user', content: conversationText + entityContext }],
    {
      system: `Summarize this conversation thread from Canopy (a personal attention system).

Create a summary (3-5 sentences) capturing:
- The main topic and purpose of the conversation
- Key decisions, insights, or realizations
- Any patterns or conflicts identified (work/life, priorities, etc.)
- Actionable outcomes or next steps

This summary will be stored for future reference when the user returns to similar topics.`,
      maxTokens: 400,
      temperature: 0.3,
    }
  );

  if (isError(result)) {
    console.error('Failed to summarize thread:', result.error);
    return `Conversation about ${entities.map(e => e.name).join(', ') || 'various topics'}`;
  }

  return result.content;
}

// =============================================================================
// SMART CONTEXT RETRIEVAL
// =============================================================================

/**
 * Select the most relevant entities for a query
 */
export function selectRelevantEntities(
  query: string,
  allEntities: Entity[],
  maxEntities: number = 15
): Entity[] {
  const queryLower = query.toLowerCase();
  const queryWords = new Set(queryLower.split(/\s+/).filter(w => w.length > 2));

  // Score each entity by relevance
  const scored = allEntities.map(entity => {
    let score = 0;
    const nameLower = entity.name.toLowerCase();
    const descLower = (entity.description || '').toLowerCase();

    // Direct name mention
    if (queryLower.includes(nameLower)) {
      score += 100;
    }

    // Word overlap
    for (const word of queryWords) {
      if (nameLower.includes(word)) score += 20;
      if (descLower.includes(word)) score += 10;
    }

    // Domain relevance (boost if query mentions domain-related words)
    const domainKeywords: Record<string, string[]> = {
      work: ['work', 'project', 'client', 'deadline', 'meeting', 'pitch', 'business'],
      family: ['family', 'wife', 'husband', 'kid', 'children', 'son', 'daughter', 'home'],
      sport: ['training', 'race', 'run', 'bike', 'swim', 'fitness', 'workout', 'exercise'],
      health: ['health', 'sleep', 'recovery', 'stress', 'energy', 'tired', 'sick'],
      personal: ['personal', 'hobby', 'side project', 'learn', 'read', 'travel'],
    };

    const entityDomainWords = domainKeywords[entity.domain] || [];
    for (const word of entityDomainWords) {
      if (queryLower.includes(word)) {
        score += 15;
        break;
      }
    }

    // Recency boost (recently mentioned entities are more relevant)
    if (entity.last_mentioned) {
      const daysSinceMention = (Date.now() - new Date(entity.last_mentioned).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceMention < 1) score += 30;
      else if (daysSinceMention < 7) score += 15;
      else if (daysSinceMention < 30) score += 5;
    }

    return { entity, score };
  });

  // Sort by score and take top N
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxEntities)
    .map(s => s.entity);
}

/**
 * Build optimized context for a chat response
 */
export async function buildChatContext(
  query: string,
  options: {
    threadHistory: AIMessage[];
    allEntities: Entity[];
    existingSummary?: string;
    summaryUpToIndex?: number;
    memories?: string[];
  }
): Promise<{
  messages: AIMessage[];
  entities: Entity[];
  summary?: string;
  wasCompacted: boolean;
}> {
  // Select relevant entities
  const relevantEntities = selectRelevantEntities(query, options.allEntities);

  // Prepare context with potential compaction
  const managed = await prepareContext(
    options.threadHistory,
    options.existingSummary,
    options.summaryUpToIndex || 0
  );

  return {
    messages: managed.messages,
    entities: relevantEntities,
    summary: managed.summary,
    wasCompacted: managed.wasCompacted,
  };
}
