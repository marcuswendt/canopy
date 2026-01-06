import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, parseBody, apiError, getNumParam } from '$lib/server/api-helpers';
import * as db from '$lib/server/db-service';

export const GET: RequestHandler = async (event) => {
  const adapter = await getDb();
  const limit = getNumParam(event, 'limit', 50);
  const memories = await db.getMemories(adapter, limit);
  return json(memories);
};

export const POST: RequestHandler = async (event) => {
  const adapter = await getDb();
  const body = await parseBody<{
    content: string;
    sourceType?: string;
    sourceId?: string;
    entities?: string[];
    importance?: number;
  }>(event);

  if (!body.content) {
    return apiError('content is required');
  }

  const memory = await db.createMemory(adapter, body);
  return json(memory, { status: 201 });
};

export const DELETE: RequestHandler = async (event) => {
  const adapter = await getDb();
  const memoryId = event.url.searchParams.get('id');

  if (!memoryId) {
    return apiError('id is required');
  }

  const result = await db.deleteMemory(adapter, memoryId);
  return json(result);
};
