import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, parseBody, apiError, getNumParam } from '$lib/server/api-helpers';
import * as db from '$lib/server/db-service';

export const GET: RequestHandler = async (event) => {
  const adapter = await getDb();
  const limit = getNumParam(event, 'limit', 10);
  const threads = await db.getRecentThreads(adapter, limit);
  return json(threads);
};

export const POST: RequestHandler = async (event) => {
  const adapter = await getDb();
  const body = await parseBody<{ title?: string }>(event);
  const thread = await db.createThread(adapter, body);
  return json(thread, { status: 201 });
};

export const PATCH: RequestHandler = async (event) => {
  const adapter = await getDb();
  const body = await parseBody<{
    threadId: string;
    domains?: string[];
    entityIds?: string[];
    summary?: string;
    summaryUpTo?: number;
  }>(event);

  if (!body.threadId) {
    return apiError('threadId is required');
  }

  const thread = await db.updateThread(adapter, body);
  return json(thread);
};
