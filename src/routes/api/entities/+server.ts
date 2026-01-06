import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, parseBody, apiError } from '$lib/server/api-helpers';
import * as db from '$lib/server/db-service';

export const GET: RequestHandler = async () => {
  const adapter = await getDb();
  const entities = await db.getEntities(adapter);
  return json(entities);
};

export const POST: RequestHandler = async (event) => {
  const adapter = await getDb();
  const body = await parseBody<{
    type: string;
    name: string;
    domain: string;
    description?: string;
    icon?: string;
  }>(event);

  if (!body.type || !body.name || !body.domain) {
    return apiError('type, name, and domain are required');
  }

  const entity = await db.createEntity(adapter, body);
  return json(entity, { status: 201 });
};

export const DELETE: RequestHandler = async (event) => {
  const adapter = await getDb();
  const entityId = event.url.searchParams.get('id');

  if (!entityId) {
    return apiError('id is required');
  }

  const result = await db.deleteEntity(adapter, entityId);
  return json(result);
};

export const PATCH: RequestHandler = async (event) => {
  const adapter = await getDb();
  const body = await parseBody<{ entityId: string }>(event);

  if (!body.entityId) {
    return apiError('entityId is required');
  }

  const result = await db.updateEntityMention(adapter, body.entityId);
  return json(result);
};
