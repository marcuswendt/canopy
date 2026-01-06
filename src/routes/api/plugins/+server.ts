import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, parseBody, apiError, getParam } from '$lib/server/api-helpers';
import * as db from '$lib/server/db-service';

export const GET: RequestHandler = async (event) => {
  const adapter = await getDb();
  const pluginId = getParam(event, 'id');

  if (pluginId) {
    const state = await db.getPluginState(adapter, pluginId);
    return json(state ?? null);
  }

  const states = await db.getAllPluginStates(adapter);
  return json(states);
};

export const POST: RequestHandler = async (event) => {
  const adapter = await getDb();
  const body = await parseBody<{
    pluginId: string;
    enabled?: boolean;
    connected?: boolean;
    lastSync?: string;
    settings?: any;
  }>(event);

  if (!body.pluginId) {
    return apiError('pluginId is required');
  }

  const result = await db.setPluginState(adapter, body);
  return json(result);
};
