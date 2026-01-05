import { writable, derived } from 'svelte/store';
import { getEntities, getRelationships, getRecencyScore } from '$lib/db/client';
import type { Entity, Relationship } from '$lib/db/types';

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

// Get related entities
export function getRelatedEntities(
  entityId: string, 
  $relationships: Relationship[], 
  $entities: Entity[]
): Entity[] {
  const relatedIds = $relationships
    .filter(r => r.source_id === entityId || r.target_id === entityId)
    .map(r => r.source_id === entityId ? r.target_id : r.source_id);
  
  return $entities.filter(e => relatedIds.includes(e.id));
}
