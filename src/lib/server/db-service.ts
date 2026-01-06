/**
 * Canopy Database Service
 *
 * All database operations as async functions using the adapter interface.
 * Works with both better-sqlite3 (Electron) and Turso (Vercel).
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from './db-adapter.js';

// ============ Types ============

export interface Entity {
  id: string;
  type: string;
  name: string;
  domain: string;
  description?: string;
  image_path?: string;
  icon?: string;
  metadata?: string;
  created_at: string;
  updated_at: string;
  last_mentioned?: string;
}

export interface Relationship {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  weight: number;
  metadata?: string;
  created_at: string;
}

export interface Capture {
  id: string;
  content: string;
  source: string;
  entities?: string;
  domains?: string;
  metadata?: string;
  created_at: string;
}

export interface Thread {
  id: string;
  title?: string;
  domains?: string;
  entity_ids?: string;
  message_count: number;
  summary?: string;
  summary_up_to: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  entities?: string;
  metadata?: string;
  created_at: string;
}

export interface Memory {
  id: string;
  content: string;
  source_type?: string;
  source_id?: string;
  entities?: string;
  importance: number;
  tags?: string;
  created_at: string;
  expires_at?: string;
}

export interface Signal {
  id: string;
  source: string;
  type: string;
  timestamp: string;
  domain?: string;
  entity_ids?: string;
  data: string;
  capacity_impact?: string;
  processed: boolean;
  created_at: string;
}

export interface PluginState {
  plugin_id: string;
  enabled: boolean;
  connected: boolean;
  last_sync?: string;
  settings?: string;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: number;
  name?: string;
  nickname?: string;
  email?: string;
  date_of_birth?: string;
  location?: string;
  created_at: string;
  updated_at: string;
}

export interface Upload {
  id: string;
  filename: string;
  mime_type: string;
  size?: number;
  local_path?: string;
  source: string;
  original_url?: string;
  status: string;
  extracted?: string;
  entity_id?: string;
  thread_id?: string;
  domain?: string;
  error?: string;
  created_at: string;
  processed_at?: string;
}

export interface Artifact {
  id: string;
  title: string;
  type: string;
  content: string;
  entities?: string;
  domains?: string;
  pinned: boolean;
  metadata?: string;
  created_at: string;
  updated_at: string;
}

// ============ Entities ============

export async function getEntities(db: DatabaseAdapter): Promise<Entity[]> {
  const result = await db.execute(`
    SELECT * FROM entities
    ORDER BY last_mentioned DESC NULLS LAST, updated_at DESC
  `);
  return result.rows as Entity[];
}

export async function createEntity(
  db: DatabaseAdapter,
  params: { type: string; name: string; domain: string; description?: string; icon?: string }
): Promise<Entity> {
  const id = randomUUID();
  await db.execute(
    `INSERT INTO entities (id, type, name, domain, description, icon) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, params.type, params.name, params.domain, params.description ?? null, params.icon ?? null]
  );

  const result = await db.execute('SELECT * FROM entities WHERE id = ?', [id]);
  return result.rows[0] as Entity;
}

export async function updateEntityMention(db: DatabaseAdapter, entityId: string): Promise<{ success: boolean }> {
  await db.execute(`UPDATE entities SET last_mentioned = CURRENT_TIMESTAMP WHERE id = ?`, [entityId]);
  return { success: true };
}

export async function deleteEntity(db: DatabaseAdapter, entityId: string): Promise<{ success: boolean }> {
  await db.execute('DELETE FROM entities WHERE id = ?', [entityId]);
  return { success: true };
}

// ============ Relationships ============

export async function getRelationships(db: DatabaseAdapter): Promise<Relationship[]> {
  const result = await db.execute('SELECT * FROM relationships');
  return result.rows as Relationship[];
}

export async function upsertRelationship(
  db: DatabaseAdapter,
  params: { sourceId: string; targetId: string; type: string; weight?: number }
): Promise<{ success: boolean }> {
  const id = randomUUID();
  await db.execute(
    `INSERT INTO relationships (id, source_id, target_id, type, weight)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source_id, target_id, type) DO UPDATE SET
       weight = weight + 0.1,
       created_at = CURRENT_TIMESTAMP`,
    [id, params.sourceId, params.targetId, params.type, params.weight ?? 1.0]
  );
  return { success: true };
}

// ============ Captures ============

export async function createCapture(
  db: DatabaseAdapter,
  params: { content: string; source?: string; entities?: any; domains?: any }
): Promise<Capture> {
  const id = randomUUID();
  await db.execute(
    `INSERT INTO captures (id, content, source, entities, domains) VALUES (?, ?, ?, ?, ?)`,
    [id, params.content, params.source ?? 'manual', JSON.stringify(params.entities), JSON.stringify(params.domains)]
  );

  const result = await db.execute('SELECT * FROM captures WHERE id = ?', [id]);
  return result.rows[0] as Capture;
}

export async function getRecentCaptures(db: DatabaseAdapter, limit?: number): Promise<Capture[]> {
  const result = await db.execute(`SELECT * FROM captures ORDER BY created_at DESC LIMIT ?`, [limit ?? 20]);
  return result.rows as Capture[];
}

// ============ Threads ============

export async function createThread(db: DatabaseAdapter, params: { title?: string }): Promise<Thread> {
  const id = randomUUID();
  await db.execute(`INSERT INTO threads (id, title) VALUES (?, ?)`, [id, params.title ?? null]);

  const result = await db.execute('SELECT * FROM threads WHERE id = ?', [id]);
  return result.rows[0] as Thread;
}

export async function getRecentThreads(db: DatabaseAdapter, limit?: number): Promise<Thread[]> {
  const result = await db.execute(`SELECT * FROM threads ORDER BY updated_at DESC LIMIT ?`, [limit ?? 10]);
  return result.rows as Thread[];
}

export async function updateThread(
  db: DatabaseAdapter,
  params: { threadId: string; domains?: any; entityIds?: any; summary?: string; summaryUpTo?: number }
): Promise<Thread> {
  const updates = ['updated_at = CURRENT_TIMESTAMP'];
  const values: any[] = [];

  if (params.domains !== undefined) {
    updates.push('domains = ?');
    values.push(JSON.stringify(params.domains));
  }
  if (params.entityIds !== undefined) {
    updates.push('entity_ids = ?');
    values.push(JSON.stringify(params.entityIds));
  }
  if (params.summary !== undefined) {
    updates.push('summary = ?');
    values.push(params.summary);
  }
  if (params.summaryUpTo !== undefined) {
    updates.push('summary_up_to = ?');
    values.push(params.summaryUpTo);
  }

  values.push(params.threadId);
  await db.execute(`UPDATE threads SET ${updates.join(', ')} WHERE id = ?`, values);

  const result = await db.execute('SELECT * FROM threads WHERE id = ?', [params.threadId]);
  return result.rows[0] as Thread;
}

// ============ Messages ============

export async function addMessage(
  db: DatabaseAdapter,
  params: { threadId: string; role: string; content: string; entities?: any }
): Promise<Message> {
  const id = randomUUID();

  await db.execute(
    `INSERT INTO messages (id, thread_id, role, content, entities) VALUES (?, ?, ?, ?, ?)`,
    [id, params.threadId, params.role, params.content, JSON.stringify(params.entities)]
  );

  await db.execute(
    `UPDATE threads SET message_count = message_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [params.threadId]
  );

  const result = await db.execute('SELECT * FROM messages WHERE id = ?', [id]);
  return result.rows[0] as Message;
}

export async function getThreadMessages(db: DatabaseAdapter, threadId: string): Promise<Message[]> {
  const result = await db.execute(`SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC`, [threadId]);
  return result.rows as Message[];
}

// ============ Memories ============

export async function createMemory(
  db: DatabaseAdapter,
  params: { content: string; sourceType?: string; sourceId?: string; entities?: any; importance?: number }
): Promise<Memory> {
  const id = randomUUID();
  await db.execute(
    `INSERT INTO memories (id, content, source_type, source_id, entities, importance) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, params.content, params.sourceType ?? null, params.sourceId ?? null, JSON.stringify(params.entities), params.importance ?? 0.5]
  );

  const result = await db.execute('SELECT * FROM memories WHERE id = ?', [id]);
  return result.rows[0] as Memory;
}

export async function getMemories(db: DatabaseAdapter, limit?: number): Promise<Memory[]> {
  const result = await db.execute(
    `SELECT * FROM memories ORDER BY importance DESC, created_at DESC LIMIT ?`,
    [limit ?? 50]
  );
  return result.rows as Memory[];
}

export async function deleteMemory(db: DatabaseAdapter, memoryId: string): Promise<{ success: boolean }> {
  await db.execute('DELETE FROM memories WHERE id = ?', [memoryId]);
  return { success: true };
}

// ============ Search ============

export async function search(db: DatabaseAdapter, query: string): Promise<{ entities: any[]; memories: any[] }> {
  const searchTerm = `%${query}%`;

  const entitiesResult = await db.execute(
    `SELECT 'entity' as type, id, name, domain, description
     FROM entities
     WHERE name LIKE ? OR description LIKE ?
     LIMIT 10`,
    [searchTerm, searchTerm]
  );

  const memoriesResult = await db.execute(
    `SELECT 'memory' as type, id, content, importance
     FROM memories
     WHERE content LIKE ?
     LIMIT 10`,
    [searchTerm]
  );

  return { entities: entitiesResult.rows, memories: memoriesResult.rows };
}

// ============ Signals ============

export async function addSignal(
  db: DatabaseAdapter,
  params: {
    id: string;
    source: string;
    type: string;
    timestamp: string;
    domain?: string;
    entityIds?: any;
    data: any;
    capacityImpact?: any;
  }
): Promise<{ success: boolean }> {
  await db.execute(
    `INSERT OR REPLACE INTO signals (id, source, type, timestamp, domain, entity_ids, data, capacity_impact)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      params.source,
      params.type,
      params.timestamp,
      params.domain ?? null,
      JSON.stringify(params.entityIds),
      JSON.stringify(params.data),
      JSON.stringify(params.capacityImpact),
    ]
  );
  return { success: true };
}

export async function addSignals(db: DatabaseAdapter, signals: any[]): Promise<{ success: boolean; count: number }> {
  const paramsList = signals.map((s) => [
    s.id,
    s.source,
    s.type,
    s.timestamp,
    s.domain ?? null,
    JSON.stringify(s.entityIds || []),
    JSON.stringify(s.data),
    JSON.stringify(s.capacityImpact || {}),
  ]);

  await db.executeMany(
    `INSERT OR REPLACE INTO signals (id, source, type, timestamp, domain, entity_ids, data, capacity_impact)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    paramsList
  );

  return { success: true, count: signals.length };
}

export async function getSignals(
  db: DatabaseAdapter,
  params: { source?: string; type?: string; since?: string; limit?: number }
): Promise<Signal[]> {
  let query = 'SELECT * FROM signals WHERE 1=1';
  const values: any[] = [];

  if (params.source) {
    query += ' AND source = ?';
    values.push(params.source);
  }
  if (params.type) {
    query += ' AND type = ?';
    values.push(params.type);
  }
  if (params.since) {
    query += ' AND timestamp > ?';
    values.push(params.since);
  }

  query += ' ORDER BY timestamp DESC LIMIT ?';
  values.push(params.limit ?? 100);

  const result = await db.execute(query, values);
  return result.rows as Signal[];
}

export async function getLatestSignal(db: DatabaseAdapter, source: string, type: string): Promise<Signal | undefined> {
  const result = await db.execute(
    `SELECT * FROM signals WHERE source = ? AND type = ? ORDER BY timestamp DESC LIMIT 1`,
    [source, type]
  );
  return result.rows[0] as Signal | undefined;
}

// ============ Plugin State ============

export async function getPluginState(db: DatabaseAdapter, pluginId: string): Promise<PluginState | undefined> {
  const result = await db.execute('SELECT * FROM plugin_state WHERE plugin_id = ?', [pluginId]);
  return result.rows[0] as PluginState | undefined;
}

export async function setPluginState(
  db: DatabaseAdapter,
  params: { pluginId: string; enabled?: boolean; connected?: boolean; lastSync?: string; settings?: any }
): Promise<{ success: boolean }> {
  await db.execute(
    `INSERT INTO plugin_state (plugin_id, enabled, connected, last_sync, settings, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(plugin_id) DO UPDATE SET
       enabled = excluded.enabled,
       connected = excluded.connected,
       last_sync = excluded.last_sync,
       settings = excluded.settings,
       updated_at = CURRENT_TIMESTAMP`,
    [params.pluginId, params.enabled ? 1 : 0, params.connected ? 1 : 0, params.lastSync ?? null, JSON.stringify(params.settings || {})]
  );
  return { success: true };
}

export async function getAllPluginStates(db: DatabaseAdapter): Promise<PluginState[]> {
  const result = await db.execute('SELECT * FROM plugin_state');
  return result.rows as PluginState[];
}

// ============ User Profile ============

export async function getUserProfile(db: DatabaseAdapter): Promise<UserProfile | null> {
  const result = await db.execute('SELECT * FROM user_profile WHERE id = 1');
  return (result.rows[0] as UserProfile) || null;
}

export async function setUserProfile(
  db: DatabaseAdapter,
  params: { name?: string; nickname?: string; email?: string; dateOfBirth?: string; location?: string }
): Promise<{ success: boolean }> {
  await db.execute(
    `INSERT INTO user_profile (id, name, nickname, email, date_of_birth, location, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       nickname = excluded.nickname,
       email = excluded.email,
       date_of_birth = excluded.date_of_birth,
       location = excluded.location,
       updated_at = CURRENT_TIMESTAMP`,
    [params.name ?? null, params.nickname ?? null, params.email ?? null, params.dateOfBirth ?? null, params.location ?? null]
  );
  return { success: true };
}

// ============ Uploads ============

export async function createUpload(
  db: DatabaseAdapter,
  params: {
    id: string;
    filename: string;
    mimeType: string;
    size?: number;
    localPath?: string;
    source?: string;
    originalUrl?: string;
    status?: string;
    domain?: string;
  }
): Promise<{ success: boolean; id: string }> {
  await db.execute(
    `INSERT INTO uploads (id, filename, mime_type, size, local_path, source, original_url, status, domain)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      params.filename,
      params.mimeType,
      params.size ?? null,
      params.localPath ?? null,
      params.source ?? null,
      params.originalUrl ?? null,
      params.status ?? 'pending',
      params.domain ?? null,
    ]
  );
  return { success: true, id: params.id };
}

export async function updateUploadStatus(
  db: DatabaseAdapter,
  params: { id: string; status: string; error?: string }
): Promise<{ success: boolean }> {
  await db.execute(
    `UPDATE uploads SET status = ?, error = ?, processed_at = CASE WHEN ? = 'complete' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?`,
    [params.status, params.error ?? null, params.status, params.id]
  );
  return { success: true };
}

export async function setUploadExtracted(
  db: DatabaseAdapter,
  params: { id: string; extracted: any }
): Promise<{ success: boolean }> {
  await db.execute(
    `UPDATE uploads SET extracted = ?, status = 'complete', processed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [JSON.stringify(params.extracted), params.id]
  );
  return { success: true };
}

export async function getUploads(
  db: DatabaseAdapter,
  params: { status?: string; entityId?: string; threadId?: string; limit?: number }
): Promise<Upload[]> {
  let query = 'SELECT * FROM uploads WHERE 1=1';
  const values: any[] = [];

  if (params.status) {
    query += ' AND status = ?';
    values.push(params.status);
  }
  if (params.entityId) {
    query += ' AND entity_id = ?';
    values.push(params.entityId);
  }
  if (params.threadId) {
    query += ' AND thread_id = ?';
    values.push(params.threadId);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  values.push(params.limit ?? 50);

  const result = await db.execute(query, values);
  return result.rows as Upload[];
}

export async function getUploadById(db: DatabaseAdapter, id: string): Promise<Upload | undefined> {
  const result = await db.execute('SELECT * FROM uploads WHERE id = ?', [id]);
  return result.rows[0] as Upload | undefined;
}

export async function deleteUpload(db: DatabaseAdapter, id: string): Promise<{ success: boolean }> {
  await db.execute('DELETE FROM uploads WHERE id = ?', [id]);
  return { success: true };
}

// ============ Artifacts ============

export async function getArtifacts(db: DatabaseAdapter): Promise<Artifact[]> {
  const result = await db.execute(`SELECT * FROM artifacts ORDER BY pinned DESC, updated_at DESC`);
  return result.rows as Artifact[];
}

export async function createArtifact(
  db: DatabaseAdapter,
  params: {
    id?: string;
    title: string;
    type: string;
    content: string;
    entities?: any;
    domains?: any;
    pinned?: boolean;
    metadata?: any;
  }
): Promise<Artifact> {
  const artifactId = params.id || randomUUID();
  await db.execute(
    `INSERT INTO artifacts (id, title, type, content, entities, domains, pinned, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      artifactId,
      params.title,
      params.type,
      params.content,
      JSON.stringify(params.entities || []),
      JSON.stringify(params.domains || []),
      params.pinned ? 1 : 0,
      JSON.stringify(params.metadata || {}),
    ]
  );

  const result = await db.execute('SELECT * FROM artifacts WHERE id = ?', [artifactId]);
  return result.rows[0] as Artifact;
}

export async function updateArtifact(
  db: DatabaseAdapter,
  params: {
    id: string;
    title?: string;
    content?: string;
    pinned?: boolean;
    entities?: any;
    domains?: any;
    metadata?: any;
  }
): Promise<Artifact | { success: false; error: string }> {
  const updates: string[] = [];
  const values: any[] = [];

  if (params.title !== undefined) {
    updates.push('title = ?');
    values.push(params.title);
  }
  if (params.content !== undefined) {
    updates.push('content = ?');
    values.push(params.content);
  }
  if (params.pinned !== undefined) {
    updates.push('pinned = ?');
    values.push(params.pinned ? 1 : 0);
  }
  if (params.entities !== undefined) {
    updates.push('entities = ?');
    values.push(JSON.stringify(params.entities));
  }
  if (params.domains !== undefined) {
    updates.push('domains = ?');
    values.push(JSON.stringify(params.domains));
  }
  if (params.metadata !== undefined) {
    updates.push('metadata = ?');
    values.push(JSON.stringify(params.metadata));
  }

  if (updates.length === 0) {
    return { success: false, error: 'No updates provided' };
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(params.id);

  await db.execute(`UPDATE artifacts SET ${updates.join(', ')} WHERE id = ?`, values);

  const result = await db.execute('SELECT * FROM artifacts WHERE id = ?', [params.id]);
  return result.rows[0] as Artifact;
}

export async function deleteArtifact(db: DatabaseAdapter, id: string): Promise<{ success: boolean }> {
  await db.execute('DELETE FROM artifacts WHERE id = ?', [id]);
  return { success: true };
}

export async function getArtifactsForEntities(db: DatabaseAdapter, entityIds: string[]): Promise<Artifact[]> {
  const result = await db.execute(
    `SELECT * FROM artifacts WHERE entities IS NOT NULL ORDER BY pinned DESC, updated_at DESC`
  );

  return (result.rows as Artifact[]).filter((artifact) => {
    try {
      const artEntities = JSON.parse(artifact.entities || '[]');
      return entityIds.some((id) => artEntities.includes(id));
    } catch {
      return false;
    }
  });
}

// ============ Database Reset ============

export async function resetDatabase(db: DatabaseAdapter): Promise<{ success: boolean; error?: string }> {
  try {
    await db.execute('DELETE FROM entities');
    await db.execute('DELETE FROM relationships');
    await db.execute('DELETE FROM captures');
    await db.execute('DELETE FROM threads');
    await db.execute('DELETE FROM messages');
    await db.execute('DELETE FROM memories');
    await db.execute('DELETE FROM signals');
    await db.execute('DELETE FROM uploads');
    await db.execute('DELETE FROM artifacts');
    await db.execute('DELETE FROM plugin_state');
    await db.execute('DELETE FROM user_profile');

    console.log('Database reset complete');
    return { success: true };
  } catch (error: any) {
    console.error('Database reset failed:', error);
    return { success: false, error: error.message };
  }
}
