/**
 * Database Connection Factory
 *
 * Creates database adapters for different environments:
 * - Electron: better-sqlite3 (local file)
 * - Web/Vercel: @libsql/client (Turso cloud)
 */

import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import { BetterSqlite3Adapter, TursoAdapter, initSchema, type DatabaseAdapter } from './db-adapter.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ============ Turso (Vercel/Web) ============

export interface TursoConfig {
  url: string;
  authToken: string;
}

/**
 * Create a Turso database adapter for web deployment
 */
export async function createTursoAdapter(config: TursoConfig): Promise<DatabaseAdapter> {
  const client = createClient({
    url: config.url,
    authToken: config.authToken,
  });

  const adapter = new TursoAdapter(client);

  // Initialize schema if needed
  await initSchema(adapter);

  return adapter;
}

/**
 * Get Turso config from environment variables
 */
export function getTursoConfig(): TursoConfig | null {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    return null;
  }

  return { url, authToken };
}

// ============ Better-sqlite3 (Electron/Local) ============

export interface LocalConfig {
  dbPath: string;
  uploadsDir: string;
  secretsFile: string;
}

/**
 * Create a better-sqlite3 adapter for Electron/local development
 */
export async function createLocalAdapter(config: LocalConfig): Promise<DatabaseAdapter> {
  // Ensure directories exist
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  if (!fs.existsSync(config.uploadsDir)) {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
  }

  const db = new Database(config.dbPath);
  db.pragma('foreign_keys = ON');

  const adapter = new BetterSqlite3Adapter(db);

  // Initialize schema
  await initSchema(adapter);

  console.log(`Local database opened: ${config.dbPath}`);

  return adapter;
}

// ============ Electron Profile Management ============

const BUILT_IN_PROFILES = {
  live: { db: 'canopy.db', uploads: 'uploads', label: 'Live', builtIn: true },
  test: { db: 'canopy-test.db', uploads: 'uploads-test', label: 'Test', builtIn: true },
};

/**
 * Get the Canopy directory for Electron (single-user local mode)
 */
export function getElectronCanopyDir(): string {
  return path.join(os.homedir(), '.canopy');
}

/**
 * Get config for an Electron profile
 */
export function getElectronProfileConfig(
  canopyDir: string,
  profileId: string,
  customProfiles: Record<string, any> = {}
): LocalConfig {
  const allProfiles = { ...BUILT_IN_PROFILES, ...customProfiles };
  const profile = allProfiles[profileId] || BUILT_IN_PROFILES.live;

  return {
    dbPath: path.join(canopyDir, profile.db),
    uploadsDir: path.join(canopyDir, profile.uploads),
    secretsFile: path.join(canopyDir, 'secrets.json'),
  };
}

// ============ Environment Detection ============

export type Environment = 'electron' | 'vercel' | 'local-dev';

/**
 * Detect the current runtime environment
 */
export function detectEnvironment(): Environment {
  // Check for Vercel
  if (process.env.VERCEL === '1' || process.env.TURSO_DATABASE_URL) {
    return 'vercel';
  }

  // Check for Electron (will be set by electron main process)
  if (process.env.ELECTRON === '1') {
    return 'electron';
  }

  // Default to local development
  return 'local-dev';
}

/**
 * Create the appropriate database adapter for the current environment
 */
export async function createAdapter(): Promise<DatabaseAdapter> {
  const env = detectEnvironment();

  switch (env) {
    case 'vercel': {
      const config = getTursoConfig();
      if (!config) {
        throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set for Vercel deployment');
      }
      return createTursoAdapter(config);
    }

    case 'electron':
    case 'local-dev': {
      // For local dev, use a local SQLite database
      const canopyDir = getElectronCanopyDir();
      const config = getElectronProfileConfig(canopyDir, 'live');
      return createLocalAdapter(config);
    }
  }
}
