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
  return [
    {
      id: 'samsung',
      type: 'project',
      name: 'Samsung',
      domain: 'work',
      description: 'One UI Visual Language rebrand',
      created_at: '2024-11-01T00:00:00Z',
      updated_at: new Date().toISOString(),
      last_mentioned: new Date().toISOString(),
    },
    {
      id: 'chanel',
      type: 'project',
      name: 'Chanel',
      domain: 'work',
      description: '113 Spring House of Innovation',
      created_at: '2024-06-01T00:00:00Z',
      updated_at: new Date().toISOString(),
      last_mentioned: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 'nike',
      type: 'project',
      name: 'Nike',
      domain: 'work',
      description: 'Rise Intelligent Retail System',
      created_at: '2020-01-01T00:00:00Z',
      updated_at: new Date().toISOString(),
      last_mentioned: new Date(Date.now() - 604800000).toISOString(),
    },
    {
      id: 'celine',
      type: 'person',
      name: 'Celine',
      domain: 'family',
      description: 'Wife',
      created_at: '2019-10-11T00:00:00Z',
      updated_at: new Date().toISOString(),
    },
    {
      id: 'rafael',
      type: 'person',
      name: 'Rafael',
      domain: 'family',
      description: 'Son, born Feb 2020',
      created_at: '2020-02-02T00:00:00Z',
      updated_at: new Date().toISOString(),
    },
    {
      id: 'luca',
      type: 'person',
      name: 'Luca',
      domain: 'family',
      description: 'Son, born May 2022',
      created_at: '2022-05-01T00:00:00Z',
      updated_at: new Date().toISOString(),
    },
    {
      id: 'elio',
      type: 'person',
      name: 'Elio',
      domain: 'family',
      description: 'Son, born March 2025',
      created_at: '2025-03-30T00:00:00Z',
      updated_at: new Date().toISOString(),
    },
    {
      id: 'abel-tasman',
      type: 'event',
      name: 'Abel Tasman',
      domain: 'family',
      description: 'Family trip Jan 12-17',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_mentioned: new Date().toISOString(),
    },
    {
      id: 'hmr-2026',
      type: 'project',
      name: 'HMR 2026',
      domain: 'sport',
      icon: '🚴',
      description: 'Haute Route Mavic - ultra-distance race',
      created_at: '2025-09-01T00:00:00Z',
      updated_at: new Date().toISOString(),
      last_mentioned: new Date(Date.now() - 172800000).toISOString(),
    },
  ];
}

function getSampleThreads(): Thread[] {
  return [
    {
      id: '1',
      title: 'Balancing training and family',
      domains: JSON.stringify(['sport', 'family', 'work']),
      message_count: 5,
      created_at: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: '2',
      title: 'Samsung pitch strategy',
      domains: JSON.stringify(['work']),
      message_count: 12,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: '3',
      title: 'Abel Tasman trip planning',
      domains: JSON.stringify(['family']),
      message_count: 8,
      created_at: new Date(Date.now() - 259200000).toISOString(),
      updated_at: new Date(Date.now() - 259200000).toISOString(),
    },
  ];
}
