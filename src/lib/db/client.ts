// Database client for Canopy
// Wraps Electron IPC with nice TypeScript interface + HTTP API for web

import type { Entity, Relationship, Capture, Thread, Message, Memory } from './types';

// Environment detection
const isElectron = typeof window !== 'undefined' && window.canopy !== undefined;
const isBrowser = typeof window !== 'undefined';
const isWeb = isBrowser && !isElectron;

// Helper to parse JSON fields from SQLite
function parseJsonField<T>(value: string | undefined | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

// Transform raw DB entity to typed entity
function transformEntity(raw: any): Entity & {
  parsedMetadata?: Record<string, any>;
  lastMentionedDate?: Date;
} {
  return {
    ...raw,
    parsedMetadata: parseJsonField(raw.metadata),
    lastMentionedDate: raw.last_mentioned ? new Date(raw.last_mentioned) : undefined,
  };
}

// HTTP API helpers for web mode
async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

async function apiPatch<T>(path: string, body: any): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

// ============ Entities ============

export async function getEntities(): Promise<Entity[]> {
  if (isElectron) {
    const entities = await window.canopy.getEntities();
    return entities.map(transformEntity);
  }
  if (isWeb) {
    const entities = await apiGet<Entity[]>('/entities');
    return entities.map(transformEntity);
  }
  return [];
}

export async function createEntity(
  type: Entity['type'],
  name: string,
  domain: Entity['domain'],
  description?: string,
  icon?: string
): Promise<Entity | null> {
  if (isElectron) {
    const entity = await window.canopy.createEntity({ type, name, domain, description, icon });
    return transformEntity(entity);
  }
  if (isWeb) {
    const entity = await apiPost<Entity>('/entities', { type, name, domain, description, icon });
    return transformEntity(entity);
  }
  console.log('createEntity (mock):', { type, name, domain });
  return null;
}

export async function updateEntityMention(entityId: string): Promise<void> {
  if (isElectron) {
    await window.canopy.updateEntityMention(entityId);
  } else if (isWeb) {
    await apiPatch('/entities', { entityId });
  }
}

export async function deleteEntity(entityId: string): Promise<void> {
  if (isElectron) {
    await window.canopy.deleteEntity(entityId);
  } else if (isWeb) {
    await apiDelete(`/entities?id=${entityId}`);
  }
}

// ============ Relationships ============

export async function getRelationships(): Promise<Relationship[]> {
  if (isElectron) {
    return await window.canopy.getRelationships();
  }
  if (isWeb) {
    return await apiGet<Relationship[]>('/relationships');
  }
  return [];
}

export async function upsertRelationship(
  sourceId: string,
  targetId: string,
  type: Relationship['type'],
  weight?: number
): Promise<void> {
  if (isElectron) {
    await window.canopy.upsertRelationship({ sourceId, targetId, type, weight });
  } else if (isWeb) {
    await apiPost('/relationships', { sourceId, targetId, type, weight });
  }
}

/**
 * Record co-occurrence of entities mentioned together.
 * Creates or strengthens 'mentioned_with' relationships between all pairs.
 */
export async function recordCoOccurrence(entityIds: string[]): Promise<void> {
  if (entityIds.length < 2) return;

  // Create relationships between all pairs of entities
  for (let i = 0; i < entityIds.length; i++) {
    for (let j = i + 1; j < entityIds.length; j++) {
      const sourceId = entityIds[i];
      const targetId = entityIds[j];

      if (isElectron) {
        // Get existing relationship to increment weight
        const relationships = await window.canopy.getRelationships();
        const existing = relationships.find(
          r => r.type === 'mentioned_with' &&
          ((r.source_id === sourceId && r.target_id === targetId) ||
           (r.source_id === targetId && r.target_id === sourceId))
        );

        const newWeight = (existing?.weight || 0) + 1;
        await window.canopy.upsertRelationship({
          sourceId,
          targetId,
          type: 'mentioned_with',
          weight: newWeight
        });
      } else if (isWeb) {
        // For web, the server handles weight incrementing via upsert
        await apiPost('/relationships', {
          sourceId,
          targetId,
          type: 'mentioned_with',
        });
      } else {
        console.log(`Co-occurrence: ${sourceId} <-> ${targetId}`);
      }
    }
  }
}

/**
 * Get all entities related to a given entity through any relationship.
 * Returns entities sorted by relationship weight (strongest first).
 */
export async function getRelatedEntities(
  entityId: string,
  relationshipTypes?: Relationship['type'][]
): Promise<{ entity: Entity; relationship: Relationship }[]> {
  const relationships = await getRelationships();
  const entities = await getEntities();

  const entityMap = new Map(entities.map(e => [e.id, e]));

  const related = relationships
    .filter(r => {
      const matchesEntity = r.source_id === entityId || r.target_id === entityId;
      const matchesType = !relationshipTypes || relationshipTypes.includes(r.type);
      return matchesEntity && matchesType;
    })
    .map(r => {
      const relatedId = r.source_id === entityId ? r.target_id : r.source_id;
      const entity = entityMap.get(relatedId);
      return entity ? { entity, relationship: r } : null;
    })
    .filter((item): item is { entity: Entity; relationship: Relationship } => item !== null)
    .sort((a, b) => b.relationship.weight - a.relationship.weight);

  return related;
}

/**
 * Get threads that mention a specific entity.
 */
export async function getThreadsForEntity(entityId: string): Promise<Thread[]> {
  const threads = await getRecentThreads(100);
  return threads.filter(t => {
    const entityIds = parseJsonField<string[]>(t.entity_ids) || [];
    return entityIds.includes(entityId);
  });
}

/**
 * Get a relationship graph starting from an entity.
 * Traverses up to `depth` levels of relationships.
 */
export async function getEntityGraph(
  startEntityId: string,
  depth: number = 2
): Promise<{
  nodes: Map<string, Entity>;
  edges: Relationship[];
}> {
  const nodes = new Map<string, Entity>();
  const edges: Relationship[] = [];
  const visited = new Set<string>();

  const entities = await getEntities();
  const relationships = await getRelationships();

  const entityMap = new Map(entities.map(e => [e.id, e]));

  async function traverse(entityId: string, currentDepth: number) {
    if (visited.has(entityId) || currentDepth > depth) return;
    visited.add(entityId);

    const entity = entityMap.get(entityId);
    if (entity) {
      nodes.set(entityId, entity);
    }

    // Find all relationships for this entity
    const entityRelations = relationships.filter(
      r => r.source_id === entityId || r.target_id === entityId
    );

    for (const rel of entityRelations) {
      // Only add edge once
      if (!edges.find(e => e.id === rel.id)) {
        edges.push(rel);
      }

      // Traverse to connected entity
      const nextId = rel.source_id === entityId ? rel.target_id : rel.source_id;
      await traverse(nextId, currentDepth + 1);
    }
  }

  await traverse(startEntityId, 0);

  return { nodes, edges };
}

// ============ Captures ============

export async function createCapture(
  content: string,
  source?: string,
  entities?: string[],
  domains?: string[]
): Promise<Capture | null> {
  if (isElectron) {
    return await window.canopy.createCapture({ content, source, entities, domains });
  }
  if (isWeb) {
    return await apiPost<Capture>('/captures', { content, source, entities, domains });
  }
  console.log('createCapture (mock):', content);
  return null;
}

export async function getRecentCaptures(limit?: number): Promise<Capture[]> {
  if (isElectron) {
    return await window.canopy.getRecentCaptures(limit);
  }
  if (isWeb) {
    return await apiGet<Capture[]>(`/captures?limit=${limit ?? 20}`);
  }
  return [];
}

// ============ Threads ============

export async function createThread(title?: string): Promise<Thread | null> {
  if (isElectron) {
    return await window.canopy.createThread(title);
  }
  if (isWeb) {
    return await apiPost<Thread>('/threads', { title });
  }
  // Mock for SSR/dev
  return {
    id: crypto.randomUUID(),
    title,
    message_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function getRecentThreads(limit?: number): Promise<Thread[]> {
  if (isElectron) {
    return await window.canopy.getRecentThreads(limit);
  }
  if (isWeb) {
    return await apiGet<Thread[]>(`/threads?limit=${limit ?? 10}`);
  }
  return [];
}

export async function updateThread(
  threadId: string,
  updates: {
    domains?: string[];
    entityIds?: string[];
    summary?: string;
    summaryUpTo?: number;
  }
): Promise<void> {
  if (isElectron) {
    await window.canopy.updateThread({ threadId, ...updates });
  } else if (isWeb) {
    await apiPatch('/threads', { threadId, ...updates });
  }
}

// ============ Messages ============

export async function addMessage(
  threadId: string,
  role: Message['role'],
  content: string,
  entities?: string[]
): Promise<Message | null> {
  if (isElectron) {
    return await window.canopy.addMessage({ threadId, role, content, entities });
  }
  if (isWeb) {
    return await apiPost<Message>(`/threads/${threadId}/messages`, { role, content, entities });
  }
  // Mock for SSR/dev
  return {
    id: crypto.randomUUID(),
    thread_id: threadId,
    role,
    content,
    entities: entities ? JSON.stringify(entities) : undefined,
    created_at: new Date().toISOString(),
  };
}

export async function getThreadMessages(threadId: string): Promise<Message[]> {
  if (isElectron) {
    return await window.canopy.getThreadMessages(threadId);
  }
  if (isWeb) {
    return await apiGet<Message[]>(`/threads/${threadId}/messages`);
  }
  return [];
}

// ============ Memories ============

export async function createMemory(
  content: string,
  sourceType?: string,
  sourceId?: string,
  entities?: string[],
  importance?: number
): Promise<Memory | null> {
  if (isElectron) {
    return await window.canopy.createMemory({ content, sourceType, sourceId, entities, importance });
  }
  if (isWeb) {
    return await apiPost<Memory>('/memories', { content, sourceType, sourceId, entities, importance });
  }
  console.log('createMemory (mock):', content);
  return null;
}

export async function getMemories(limit?: number): Promise<Memory[]> {
  if (isElectron) {
    return await window.canopy.getMemories(limit);
  }
  if (isWeb) {
    return await apiGet<Memory[]>(`/memories?limit=${limit ?? 50}`);
  }
  return [];
}

export async function deleteMemory(memoryId: string): Promise<void> {
  if (isElectron) {
    await window.canopy.deleteMemory(memoryId);
  } else if (isWeb) {
    await apiDelete(`/memories?id=${memoryId}`);
  }
}

// ============ Search ============

export async function search(query: string): Promise<{ entities: Entity[]; memories: Memory[] }> {
  if (isElectron) {
    return await window.canopy.search(query);
  }
  if (isWeb) {
    return await apiGet<{ entities: Entity[]; memories: Memory[] }>(`/search?q=${encodeURIComponent(query)}`);
  }
  return { entities: [], memories: [] };
}

// ============ Helpers ============

export function extractEntitiesFromText(text: string, entities: Entity[]): Entity[] {
  const found: Entity[] = [];
  const lowerText = text.toLowerCase();

  for (const entity of entities) {
    if (lowerText.includes(entity.name.toLowerCase())) {
      found.push(entity);
    }
  }

  return found;
}

export function detectDomains(text: string): string[] {
  const domains: string[] = [];
  const lowerText = text.toLowerCase();

  const domainKeywords: Record<string, string[]> = {
    work: ['work', 'client', 'project', 'meeting', 'deadline', 'presentation', 'samsung', 'chanel', 'nike', 'field', 'pitch'],
    family: ['family', 'kids', 'wife', 'celine', 'rafael', 'luca', 'elio', 'trip', 'vacation', 'abel tasman'],
    sport: ['training', 'ride', 'run', 'race', 'hmr', 'cycling', 'tss', 'recovery', 'workout', 'zwift'],
    personal: ['idea', 'canopy', 'side project', 'learning', 'reading'],
    health: ['sleep', 'recovery', 'stress', 'health', 'doctor', 'wellness', 'whoop'],
  };

  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some(kw => lowerText.includes(kw))) {
      domains.push(domain);
    }
  }

  return domains;
}

export function getRecencyScore(lastMentioned: string | undefined, maxDays: number = 30): number {
  if (!lastMentioned) return 0.3;

  const now = Date.now();
  const lastActive = new Date(lastMentioned).getTime();
  const daysSince = (now - lastActive) / (1000 * 60 * 60 * 24);

  return Math.max(0.3, 1 - (daysSince / maxDays));
}
