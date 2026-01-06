import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, parseBody, apiError, getNumParam } from '$lib/server/api-helpers';
import * as db from '$lib/server/db-service';

export const GET: RequestHandler = async (event) => {
  const adapter = await getDb();
  const limit = getNumParam(event, 'limit', 20);
  const captures = await db.getRecentCaptures(adapter, limit);
  return json(captures);
};

export const POST: RequestHandler = async (event) => {
  const adapter = await getDb();
  const body = await parseBody<{
    content: string;
    source?: string;
    entities?: string[];
    domains?: string[];
  }>(event);

  if (!body.content) {
    return apiError('content is required');
  }

  const capture = await db.createCapture(adapter, body);
  return json(capture, { status: 201 });
};
