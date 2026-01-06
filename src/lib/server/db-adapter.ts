/**
 * Database Adapter - Unified interface for SQLite backends
 *
 * Supports:
 * - better-sqlite3 (Electron, local development)
 * - @libsql/client (Turso, Vercel deployment)
 *
 * All methods are async to support both sync and async backends.
 */

import type { Client as TursoClient } from '@libsql/client';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';

export interface QueryResult {
  rows: any[];
  rowsAffected: number;
  lastInsertRowid?: number | bigint;
}

export interface DatabaseAdapter {
  execute(sql: string, params?: any[]): Promise<QueryResult>;
  executeMany(sql: string, paramsList: any[][]): Promise<void>;
  close(): Promise<void>;
}

/**
 * Adapter for better-sqlite3 (Electron/local)
 */
export class BetterSqlite3Adapter implements DatabaseAdapter {
  constructor(private db: BetterSqlite3Database) {}

  async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    // Determine if it's a SELECT or mutation
    const isSelect = sql.trim().toUpperCase().startsWith('SELECT');

    if (isSelect) {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);
      return { rows, rowsAffected: 0 };
    } else {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...params);
      return {
        rows: [],
        rowsAffected: result.changes,
        lastInsertRowid: result.lastInsertRowid,
      };
    }
  }

  async executeMany(sql: string, paramsList: any[][]): Promise<void> {
    const stmt = this.db.prepare(sql);
    const insertMany = this.db.transaction((list: any[][]) => {
      for (const params of list) {
        stmt.run(...params);
      }
    });
    insertMany(paramsList);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

/**
 * Adapter for @libsql/client (Turso/Vercel)
 */
export class TursoAdapter implements DatabaseAdapter {
  constructor(private client: TursoClient) {}

  async execute(sql: string, params: any[] = []): Promise<QueryResult> {
    const result = await this.client.execute({ sql, args: params });
    return {
      rows: result.rows as any[],
      rowsAffected: result.rowsAffected,
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  async executeMany(sql: string, paramsList: any[][]): Promise<void> {
    // Turso supports batch operations
    await this.client.batch(
      paramsList.map((params) => ({ sql, args: params })),
      'write'
    );
  }

  async close(): Promise<void> {
    this.client.close();
  }
}

/**
 * Schema definition - same for both backends
 */
export const SCHEMA = `
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
`;

export const INDEXES = `
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
 * Initialize schema on a database adapter
 */
export async function initSchema(adapter: DatabaseAdapter): Promise<void> {
  // Split schema into individual statements and execute
  const statements = SCHEMA.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const sql of statements) {
    await adapter.execute(sql + ';');
  }

  // Create indexes
  const indexStatements = INDEXES.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const sql of indexStatements) {
    await adapter.execute(sql + ';');
  }
}
