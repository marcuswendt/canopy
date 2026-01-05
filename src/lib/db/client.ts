// Database client for Canopy
// Wraps Electron IPC with nice TypeScript interface + fallbacks for web dev

import type { Entity, Relationship, Capture, Thread, Message, Memory } from './types';

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.canopy !== undefined;

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

// ============ Entities ============

export async function getEntities(): Promise<Entity[]> {
  if (isElectron) {
    const entities = await window.canopy.getEntities();
    return entities.map(transformEntity);
  }
  // Fallback for web dev - return sample data
  return getSampleEntities();
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
  console.log('createEntity (mock):', { type, name, domain });
  return null;
}

export async function updateEntityMention(entityId: string): Promise<void> {
  if (isElectron) {
    await window.canopy.updateEntityMention(entityId);
  }
}

// ============ Relationships ============

export async function getRelationships(): Promise<Relationship[]> {
  if (isElectron) {
    return await window.canopy.getRelationships();
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
      } else {
        // Mock for web dev
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
  if (isElectron) {
    const threads = await window.canopy.getRecentThreads(100);
    return threads.filter(t => {
      const entityIds = parseJsonField<string[]>(t.entity_ids) || [];
      return entityIds.includes(entityId);
    });
  }
  return getSampleThreads().filter(t => t.title?.toLowerCase().includes(entityId));
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
  console.log('createCapture (mock):', content);
  return null;
}

export async function getRecentCaptures(limit?: number): Promise<Capture[]> {
  if (isElectron) {
    return await window.canopy.getRecentCaptures(limit);
  }
  return [];
}

// ============ Threads ============

export async function createThread(title?: string): Promise<Thread | null> {
  if (isElectron) {
    return await window.canopy.createThread(title);
  }
  // Mock for web dev
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
  return getSampleThreads();
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
  // Mock for web dev
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
  console.log('createMemory (mock):', content);
  return null;
}

export async function getMemories(limit?: number): Promise<Memory[]> {
  if (isElectron) {
    return await window.canopy.getMemories(limit);
  }
  return [];
}

// ============ Search ============

export async function search(query: string): Promise<{ entities: Entity[]; memories: Memory[] }> {
  if (isElectron) {
    return await window.canopy.search(query);
  }
  // Mock search in sample data
  const entities = getSampleEntities().filter(e => 
    e.name.toLowerCase().includes(query.toLowerCase())
  );
  return { entities, memories: [] };
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

// ============ Sample Data (for web dev without Electron) ============

function getSampleEntities(): Entity[] {
  // Empty - real entities come from database after onboarding
  return [];
}

function getSampleThreads(): Thread[] {
  // Empty - real threads come from database
  return [];
}
