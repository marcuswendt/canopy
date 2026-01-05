/**
 * Test Database Module - Direct SQLite access for integration tests
 *
 * This module bypasses Electron IPC and accesses SQLite directly using better-sqlite3.
 * It uses an isolated test database to protect real user data.
 *
 * Usage:
 *   import { getTestDb, resetTestDatabase } from './test-db';
 *   const db = getTestDb();
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';
import type { Entity, Relationship, Memory, Thread, Message, Capture } from './types';

// Isolated test database path
const CANOPY_DIR = path.join(os.homedir(), '.canopy');
const TEST_DB_PATH = path.join(CANOPY_DIR, 'canopy-integration-test.db');

let db: Database.Database | null = null;

/**
 * Schema creation SQL - mirrors electron/main.js
 */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    description TEXT,
    image_path TEXT,
    icon TEXT,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_mentioned DATETIME
  );

  CREATE TABLE IF NOT EXISTS relationships (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    type TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE,
    UNIQUE(source_id, target_id, type)
  );

  CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    entities JSON,
    domains JSON,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    title TEXT,
    domains JSON,
    entity_ids JSON,
    message_count INTEGER DEFAULT 0,
    summary TEXT,
    summary_up_to INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    entities JSON,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    source_type TEXT,
    source_id TEXT,
    entities JSON,
    importance REAL DEFAULT 0.5,
    tags JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    type TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    domain TEXT,
    entity_ids JSON,
    data JSON NOT NULL,
    capacity_impact JSON,
    processed BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS plugin_state (
    plugin_id TEXT PRIMARY KEY,
    enabled BOOLEAN DEFAULT FALSE,
    connected BOOLEAN DEFAULT FALSE,
    last_sync DATETIME,
    settings JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT,
    nickname TEXT,
    email TEXT,
    date_of_birth TEXT,
    location TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER,
    local_path TEXT,
    source TEXT DEFAULT 'drop',
    original_url TEXT,
    status TEXT DEFAULT 'pending',
    extracted JSON,
    entity_id TEXT,
    thread_id TEXT,
    domain TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    entities JSON,
    domains JSON,
    pinned BOOLEAN DEFAULT FALSE,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_entities_domain ON entities(domain);
  CREATE INDEX IF NOT EXISTS idx_artifacts_updated ON artifacts(updated_at);
  CREATE INDEX IF NOT EXISTS idx_entities_last_mentioned ON entities(last_mentioned);
  CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at);
  CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at);
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
  CREATE INDEX IF NOT EXISTS idx_signals_source ON signals(source);
  CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp);
  CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);
  CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);
`;

/**
 * Get the test database instance, initializing if needed
 */
export function getTestDb(): Database.Database {
  if (!db) {
    // Ensure directory exists
    if (!fs.existsSync(CANOPY_DIR)) {
      fs.mkdirSync(CANOPY_DIR, { recursive: true });
    }

    db = new Database(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA_SQL);
    console.log(`Test database initialized: ${TEST_DB_PATH}`);
  }
  return db;
}

/**
 * Reset the test database - clears all data but preserves schema
 */
export function resetTestDatabase(): void {
  const database = getTestDb();

  // Delete all data in reverse dependency order
  const tables = [
    'messages',
    'threads',
    'relationships',
    'entities',
    'captures',
    'memories',
    'signals',
    'plugin_state',
    'user_profile',
    'uploads',
    'artifacts',
  ];

  for (const table of tables) {
    database.exec(`DELETE FROM ${table}`);
  }

  console.log('Test database reset complete');
}

/**
 * Close the test database connection
 */
export function closeTestDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ============ Entity Operations ============

export function getEntities(): Entity[] {
  const database = getTestDb();
  return database.prepare('SELECT * FROM entities ORDER BY name').all() as Entity[];
}

export function createEntity(
  type: Entity['type'],
  name: string,
  domain: Entity['domain'],
  description?: string,
  icon?: string
): Entity {
  const database = getTestDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO entities (id, type, name, domain, description, icon, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, type, name, domain, description || null, icon || null, now, now);

  return database.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Entity;
}

export function updateEntityMention(entityId: string): void {
  const database = getTestDb();
  database.prepare(`
    UPDATE entities SET last_mentioned = CURRENT_TIMESTAMP WHERE id = ?
  `).run(entityId);
}

// ============ Relationship Operations ============

export function getRelationships(): Relationship[] {
  const database = getTestDb();
  return database.prepare('SELECT * FROM relationships').all() as Relationship[];
}

export function upsertRelationship(
  sourceId: string,
  targetId: string,
  type: Relationship['type'],
  weight: number = 1.0
): void {
  const database = getTestDb();
  const id = randomUUID();

  database.prepare(`
    INSERT INTO relationships (id, source_id, target_id, type, weight)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source_id, target_id, type) DO UPDATE SET weight = ?
  `).run(id, sourceId, targetId, type, weight, weight);
}

// ============ Memory Operations ============

export function getMemories(limit: number = 100): Memory[] {
  const database = getTestDb();
  return database.prepare(`
    SELECT * FROM memories ORDER BY created_at DESC LIMIT ?
  `).all(limit) as Memory[];
}

export function createMemory(
  content: string,
  sourceType?: string,
  sourceId?: string,
  entities?: string[],
  importance: number = 0.5
): Memory {
  const database = getTestDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO memories (id, content, source_type, source_id, entities, importance, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    content,
    sourceType || null,
    sourceId || null,
    entities ? JSON.stringify(entities) : null,
    importance,
    now
  );

  return database.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Memory;
}

// ============ Thread Operations ============

export function getRecentThreads(limit: number = 50): Thread[] {
  const database = getTestDb();
  return database.prepare(`
    SELECT * FROM threads ORDER BY updated_at DESC LIMIT ?
  `).all(limit) as Thread[];
}

export function createThread(title?: string): Thread {
  const database = getTestDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO threads (id, title, message_count, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?)
  `).run(id, title || null, now, now);

  return database.prepare('SELECT * FROM threads WHERE id = ?').get(id) as Thread;
}

export function updateThread(
  threadId: string,
  updates: {
    domains?: string[];
    entityIds?: string[];
    summary?: string;
    summaryUpTo?: number;
  }
): void {
  const database = getTestDb();
  const sets: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const values: unknown[] = [];

  if (updates.domains !== undefined) {
    sets.push('domains = ?');
    values.push(JSON.stringify(updates.domains));
  }
  if (updates.entityIds !== undefined) {
    sets.push('entity_ids = ?');
    values.push(JSON.stringify(updates.entityIds));
  }
  if (updates.summary !== undefined) {
    sets.push('summary = ?');
    values.push(updates.summary);
  }
  if (updates.summaryUpTo !== undefined) {
    sets.push('summary_up_to = ?');
    values.push(updates.summaryUpTo);
  }

  values.push(threadId);
  database.prepare(`UPDATE threads SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

// ============ Message Operations ============

export function getThreadMessages(threadId: string): Message[] {
  const database = getTestDb();
  return database.prepare(`
    SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC
  `).all(threadId) as Message[];
}

export function addMessage(
  threadId: string,
  role: Message['role'],
  content: string,
  entities?: string[]
): Message {
  const database = getTestDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO messages (id, thread_id, role, content, entities, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, threadId, role, content, entities ? JSON.stringify(entities) : null, now);

  // Update thread message count
  database.prepare(`
    UPDATE threads SET message_count = message_count + 1, updated_at = ? WHERE id = ?
  `).run(now, threadId);

  return database.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Message;
}

// ============ Capture Operations ============

export function getRecentCaptures(limit: number = 50): Capture[] {
  const database = getTestDb();
  return database.prepare(`
    SELECT * FROM captures ORDER BY created_at DESC LIMIT ?
  `).all(limit) as Capture[];
}

export function createCapture(
  content: string,
  source?: string,
  entities?: string[],
  domains?: string[]
): Capture {
  const database = getTestDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO captures (id, content, source, entities, domains, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    content,
    source || 'manual',
    entities ? JSON.stringify(entities) : null,
    domains ? JSON.stringify(domains) : null,
    now
  );

  return database.prepare('SELECT * FROM captures WHERE id = ?').get(id) as Capture;
}

// ============ User Profile Operations ============

export function getUserProfile(): {
  id: number;
  name: string | null;
  nickname: string | null;
  email: string | null;
  date_of_birth: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
} | null {
  const database = getTestDb();
  const row = database.prepare('SELECT * FROM user_profile WHERE id = 1').get();
  return row as typeof row & { id: number } | null;
}

export function setUserProfile(data: {
  name?: string | null;
  nickname?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  location?: string | null;
}): void {
  const database = getTestDb();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO user_profile (id, name, nickname, email, date_of_birth, location, created_at, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = COALESCE(?, name),
      nickname = COALESCE(?, nickname),
      email = COALESCE(?, email),
      date_of_birth = COALESCE(?, date_of_birth),
      location = COALESCE(?, location),
      updated_at = ?
  `).run(
    data.name || null,
    data.nickname || null,
    data.email || null,
    data.dateOfBirth || null,
    data.location || null,
    now,
    now,
    data.name,
    data.nickname,
    data.email,
    data.dateOfBirth,
    data.location,
    now
  );
}

// ============ Search Operations ============

export function search(query: string): { entities: Entity[]; memories: Memory[] } {
  const database = getTestDb();
  const pattern = `%${query}%`;

  const entities = database.prepare(`
    SELECT * FROM entities WHERE name LIKE ? OR description LIKE ?
  `).all(pattern, pattern) as Entity[];

  const memories = database.prepare(`
    SELECT * FROM memories WHERE content LIKE ?
  `).all(pattern) as Memory[];

  return { entities, memories };
}
