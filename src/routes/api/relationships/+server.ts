import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, parseBody, apiError } from '$lib/server/api-helpers';
import * as db from '$lib/server/db-service';

export const GET: RequestHandler = async () => {
  const adapter = await getDb();
  const relationships = await db.getRelationships(adapter);
  return json(relationships);
};

export const POST: RequestHandler = async (event) => {
  const adapter = await getDb();
  const body = await parseBody<{
    sourceId: string;
    targetId: string;
    type: string;
    weight?: number;
  }>(event);

  if (!body.sourceId || !body.targetId || !body.type) {
    return apiError('sourceId, targetId, and type are required');
  }

  const result = await db.upsertRelationship(adapter, body);
  return json(result);
};
