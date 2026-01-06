import { writable, derived } from 'svelte/store';
import {
  getEntities,
  getRelationships,
  getRecencyScore,
  getRelatedEntities as fetchRelatedEntities,
  getEntityGraph as fetchEntityGraph,
  getThreadsForEntity
} from '$lib/client/db/client';
import type { Entity, Relationship, Thread } from '$lib/client/db/types';

// Main stores
export const entities = writable<Entity[]>([]);
export const relationships = writable<Relationship[]>([]);
export const isLoading = writable(false);

// Load entities from database
export async function loadEntities() {
  isLoading.set(true);
  try {
    const data = await getEntities();
    entities.set(data);
  } catch (error) {
    console.error('Failed to load entities:', error);
  } finally {
    isLoading.set(false);
  }
}

// Load relationships from database
export async function loadRelationships() {
  try {
    const data = await getRelationships();
    relationships.set(data);
  } catch (error) {
    console.error('Failed to load relationships:', error);
  }
}

// Derived: entities sorted by recency
export const entitiesByRecency = derived(entities, ($entities) => {
  return [...$entities].sort((a, b) => {
    const aScore = getRecencyScore(a.last_mentioned);
    const bScore = getRecencyScore(b.last_mentioned);
    return bScore - aScore;
  });
});

// Derived: entities grouped by domain
export const entitiesByDomain = derived(entities, ($entities) => {
  const grouped: Record<string, Entity[]> = {
    work: [],
    family: [],
    sport: [],
    personal: [],
    health: [],
  };
  
  for (const entity of $entities) {
    if (grouped[entity.domain]) {
      grouped[entity.domain].push(entity);
    }
  }
  
  return grouped;
});

// Get entity by ID
export function getEntityById(id: string, $entities: Entity[]): Entity | undefined {
  return $entities.find(e => e.id === id);
}

// Get related entities (sync, from store data)
export function getRelatedEntitiesSync(
  entityId: string,
  $relationships: Relationship[],
  $entities: Entity[]
): Entity[] {
  const relatedIds = $relationships
    .filter(r => r.source_id === entityId || r.target_id === entityId)
    .map(r => r.source_id === entityId ? r.target_id : r.source_id);

  return $entities.filter(e => relatedIds.includes(e.id));
}

// ============ Graph Queries ============

/**
 * Get entities related to a given entity through relationships.
 * Returns entities sorted by relationship weight (strongest connections first).
 */
export async function getRelatedEntitiesWithWeight(
  entityId: string,
  relationshipTypes?: Relationship['type'][]
): Promise<{ entity: Entity; relationship: Relationship }[]> {
  return fetchRelatedEntities(entityId, relationshipTypes);
}

/**
 * Get entities that frequently co-occur with the given entity.
 * Useful for finding contextually related items.
 */
export async function getCoOccurringEntities(
  entityId: string
): Promise<{ entity: Entity; weight: number }[]> {
  const related = await fetchRelatedEntities(entityId, ['mentioned_with']);
  return related.map(r => ({
    entity: r.entity,
    weight: r.relationship.weight
  }));
}

/**
 * Get all threads that mention a specific entity.
 */
export async function getEntityThreads(entityId: string): Promise<Thread[]> {
  return getThreadsForEntity(entityId);
}

/**
 * Build a relationship graph starting from an entity.
 * Traverses up to `depth` levels of connections.
 */
export async function buildEntityGraph(
  startEntityId: string,
  depth: number = 2
): Promise<{
  nodes: Map<string, Entity>;
  edges: Relationship[];
}> {
  return fetchEntityGraph(startEntityId, depth);
}

/**
 * Find the shortest path between two entities through relationships.
 * Returns null if no path exists within maxDepth.
 */
export async function findEntityPath(
  fromId: string,
  toId: string,
  maxDepth: number = 4
): Promise<Entity[] | null> {
  const { nodes, edges } = await fetchEntityGraph(fromId, maxDepth);

  if (!nodes.has(toId)) return null;

  // BFS to find shortest path
  const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, path } = queue.shift()!;

    if (id === toId) {
      return path.map(nodeId => nodes.get(nodeId)!);
    }

    if (visited.has(id)) continue;
    visited.add(id);

    // Find neighbors
    const neighbors = edges
      .filter(e => e.source_id === id || e.target_id === id)
      .map(e => e.source_id === id ? e.target_id : e.source_id)
      .filter(n => !visited.has(n) && nodes.has(n));

    for (const neighbor of neighbors) {
      queue.push({ id: neighbor, path: [...path, neighbor] });
    }
  }

  return null;
}
