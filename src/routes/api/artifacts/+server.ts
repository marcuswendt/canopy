import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, parseBody, apiError, getParam } from '$lib/server/api-helpers';
import * as db from '$lib/server/db-service';

export const GET: RequestHandler = async (event) => {
  const adapter = await getDb();
  const entityIds = getParam(event, 'entityIds');

  if (entityIds) {
    const ids = entityIds.split(',');
    const artifacts = await db.getArtifactsForEntities(adapter, ids);
    return json(artifacts);
  }

  const artifacts = await db.getArtifacts(adapter);
  return json(artifacts);
};

export const POST: RequestHandler = async (event) => {
  const adapter = await getDb();
  const body = await parseBody<{
    id?: string;
    title: string;
    type: string;
    content: string;
    entities?: string[];
    domains?: string[];
    pinned?: boolean;
    metadata?: any;
  }>(event);

  if (!body.title || !body.type || !body.content) {
    return apiError('title, type, and content are required');
  }

  const artifact = await db.createArtifact(adapter, body);
  return json(artifact, { status: 201 });
};

export const PATCH: RequestHandler = async (event) => {
  const adapter = await getDb();
  const body = await parseBody<{
    id: string;
    title?: string;
    content?: string;
    pinned?: boolean;
    entities?: string[];
    domains?: string[];
    metadata?: any;
  }>(event);

  if (!body.id) {
    return apiError('id is required');
  }

  const artifact = await db.updateArtifact(adapter, body);
  return json(artifact);
};

export const DELETE: RequestHandler = async (event) => {
  const adapter = await getDb();
  const id = getParam(event, 'id');

  if (!id) {
    return apiError('id is required');
  }

  const result = await db.deleteArtifact(adapter, id);
  return json(result);
};
