// Bonsai Confirmation System - Pending Suggestions Store
// "AI can suggest, but nothing becomes permanent until you confirm it"

import { writable, derived, get } from 'svelte/store';
import type { Entity, Memory } from '$lib/client/db/types';
import { createEntity, updateEntityMention, createMemory } from '$lib/client/db/client';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUGGESTION_TTL_MS = 5 * 60 * 1000;  // 5 minutes until auto-expire
const CLEANUP_INTERVAL_MS = 30 * 1000;    // Check for expired every 30s

// =============================================================================
// TYPES
// =============================================================================

export type SuggestionType = 'entity' | 'memory' | 'pattern';
export type SuggestionStatus = 'pending' | 'confirmed' | 'rejected' | 'expired';

export interface EntitySuggestion {
  name: string;
  type: Entity['type'];
  domain: Entity['domain'];
  description?: string;
  relationship?: string;  // e.g., "Nike" for "Sarah (Nike)"
  confidence: number;
}

export interface MemorySuggestion {
  content: string;
  importance: 'high' | 'medium' | 'low';
  category: 'preference' | 'fact' | 'event' | 'decision' | 'insight';
  entityNames: string[];
}

export interface PatternSuggestion {
  description: string;
  domains: string[];
  entityIds: string[];
}

export interface PendingSuggestion {
  id: string;
  type: SuggestionType;
  messageId: string;
  threadId: string;
  createdAt: string;
  expiresAt: string;
  status: SuggestionStatus;

  // Type-specific payload (only one will be set)
  entity?: EntitySuggestion;
  memory?: MemorySuggestion;
  pattern?: PatternSuggestion;
}

// =============================================================================
// STORES
// =============================================================================

// Main suggestions store
export const suggestions = writable<PendingSuggestion[]>([]);

// Derived: only pending (not expired, confirmed, or rejected)
export const pendingSuggestions = derived(suggestions, ($suggestions) =>
  $suggestions.filter(s =>
    s.status === 'pending' &&
    new Date(s.expiresAt) > new Date()
  )
);

// Derived: suggestions grouped by messageId for rendering
export const suggestionsByMessage = derived(pendingSuggestions, ($pending) => {
  const grouped = new Map<string, PendingSuggestion[]>();
  for (const s of $pending) {
    const existing = grouped.get(s.messageId) || [];
    grouped.set(s.messageId, [...existing, s]);
  }
  return grouped;
});

// Derived: count of pending suggestions
export const pendingCount = derived(pendingSuggestions, ($pending) => $pending.length);

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Add a new suggestion to the pending list
 */
export function addSuggestion(
  suggestion: Omit<PendingSuggestion, 'id' | 'createdAt' | 'expiresAt' | 'status'>
): string {
  const now = new Date();
  const id = crypto.randomUUID();

  const newSuggestion: PendingSuggestion = {
    ...suggestion,
    id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SUGGESTION_TTL_MS).toISOString(),
    status: 'pending',
  };

  suggestions.update(list => [...list, newSuggestion]);
  return id;
}

/**
 * Add multiple suggestions at once (for batch extraction results)
 */
export function addSuggestions(
  items: Array<Omit<PendingSuggestion, 'id' | 'createdAt' | 'expiresAt' | 'status'>>
): string[] {
  return items.map(addSuggestion);
}

/**
 * Result of confirming a suggestion - includes created entity if applicable
 */
export interface ConfirmResult {
  success: boolean;
  entity?: Entity;
}

/**
 * Confirm a suggestion - persist to database
 * Returns the created entity if applicable (for adding to context)
 */
export async function confirmSuggestion(id: string): Promise<ConfirmResult> {
  const currentList = get(suggestions);
  const suggestion = currentList.find(s => s.id === id);

  if (!suggestion || suggestion.status !== 'pending') {
    return { success: false };
  }

  // Update status immediately for responsive UI
  suggestions.update(list =>
    list.map(s => s.id === id ? { ...s, status: 'confirmed' as const } : s)
  );

  try {
    // Persist based on type
    if (suggestion.type === 'entity' && suggestion.entity) {
      const created = await createEntity(
        suggestion.entity.type,
        suggestion.entity.name,
        suggestion.entity.domain,
        suggestion.entity.description
      );
      if (created?.id) {
        await updateEntityMention(created.id);
        return { success: true, entity: created };
      }
    } else if (suggestion.type === 'memory' && suggestion.memory) {
      const importanceMap = { high: 0.9, medium: 0.6, low: 0.3 };
      await createMemory(
        suggestion.memory.content,
        'thread',
        suggestion.threadId,
        [], // Entity IDs would need resolution - handled separately
        importanceMap[suggestion.memory.importance]
      );
    }
    // Pattern suggestions handled differently (would create relationships)

    return { success: true };
  } catch (error) {
    console.error('Failed to confirm suggestion:', error);
    // Revert status on error
    suggestions.update(list =>
      list.map(s => s.id === id ? { ...s, status: 'pending' as const } : s)
    );
    return { success: false };
  }
}

/**
 * Reject a suggestion - mark as rejected (won't persist)
 */
export function rejectSuggestion(id: string): void {
  suggestions.update(list =>
    list.map(s => s.id === id ? { ...s, status: 'rejected' as const } : s)
  );
}

/**
 * Confirm all pending suggestions for a specific message
 */
export async function confirmAllForMessage(messageId: string): Promise<void> {
  const currentList = get(suggestions);
  const toConfirm = currentList.filter(
    s => s.messageId === messageId && s.status === 'pending'
  );

  // Confirm each one (sequentially to avoid race conditions)
  for (const suggestion of toConfirm) {
    await confirmSuggestion(suggestion.id);
  }
}

/**
 * Reject all pending suggestions for a specific message
 */
export function rejectAllForMessage(messageId: string): void {
  suggestions.update(list =>
    list.map(s =>
      s.messageId === messageId && s.status === 'pending'
        ? { ...s, status: 'rejected' as const }
        : s
    )
  );
}

/**
 * Clean up expired and old confirmed/rejected suggestions
 */
export function cleanupSuggestions(): void {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  suggestions.update(list =>
    list.filter(s => {
      // Keep pending if not expired
      if (s.status === 'pending') {
        return new Date(s.expiresAt) > now;
      }
      // Keep confirmed/rejected for 1 hour (for UI feedback)
      return new Date(s.createdAt) > oneHourAgo;
    })
  );
}

/**
 * Clear all suggestions (for testing or reset)
 */
export function clearAllSuggestions(): void {
  suggestions.set([]);
}

/**
 * Get suggestions for a specific thread
 */
export function getSuggestionsForThread(threadId: string): PendingSuggestion[] {
  return get(pendingSuggestions).filter(s => s.threadId === threadId);
}

// =============================================================================
// CLEANUP INTERVAL
// =============================================================================

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic cleanup of expired suggestions
 */
export function startCleanupInterval(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(cleanupSuggestions, CLEANUP_INTERVAL_MS);
}

/**
 * Stop the cleanup interval
 */
export function stopCleanupInterval(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// =============================================================================
// HELPER: Check if suggestion is still valid (not expired)
// =============================================================================

export function isSuggestionValid(suggestion: PendingSuggestion): boolean {
  return (
    suggestion.status === 'pending' &&
    new Date(suggestion.expiresAt) > new Date()
  );
}

// =============================================================================
// HELPER: Get time remaining until expiration
// =============================================================================

export function getTimeRemaining(suggestion: PendingSuggestion): number {
  const expiresAt = new Date(suggestion.expiresAt).getTime();
  const now = Date.now();
  return Math.max(0, expiresAt - now);
}
