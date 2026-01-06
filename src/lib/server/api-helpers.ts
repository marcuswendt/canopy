/**
 * API Route Helpers
 *
 * Shared utilities for API routes.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { createAdapter } from './db-connection.js';
import type { DatabaseAdapter } from './db-adapter.js';

// Singleton adapter for serverless (reused across requests)
let dbAdapter: DatabaseAdapter | null = null;

/**
 * Get the database adapter (creates one if needed)
 */
export async function getDb(): Promise<DatabaseAdapter> {
  if (!dbAdapter) {
    dbAdapter = await createAdapter();
  }
  return dbAdapter;
}

/**
 * Standard JSON response helper
 */
export function success<T>(data: T) {
  return json(data);
}

/**
 * Standard error response helper
 */
export function apiError(message: string, status: number = 400) {
  return json({ error: message }, { status });
}

/**
 * Parse JSON body from request
 */
export async function parseBody<T>(event: RequestEvent): Promise<T> {
  try {
    return await event.request.json();
  } catch {
    throw error(400, 'Invalid JSON body');
  }
}

/**
 * Get query parameter
 */
export function getParam(event: RequestEvent, name: string): string | null {
  return event.url.searchParams.get(name);
}

/**
 * Get numeric query parameter
 */
export function getNumParam(event: RequestEvent, name: string, defaultValue?: number): number | undefined {
  const value = event.url.searchParams.get(name);
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}
