import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, parseBody, apiError, getParam, getNumParam } from '$lib/server/api-helpers';
import * as db from '$lib/server/db-service';

export const GET: RequestHandler = async (event) => {
  const adapter = await getDb();
  const source = getParam(event, 'source') ?? undefined;
  const type = getParam(event, 'type') ?? undefined;
  const since = getParam(event, 'since') ?? undefined;
  const limit = getNumParam(event, 'limit', 100);

  const signals = await db.getSignals(adapter, { source, type, since, limit });
  return json(signals);
};

export const POST: RequestHandler = async (event) => {
  const adapter = await getDb();
  const body = await parseBody<{
    id: string;
    source: string;
    type: string;
    timestamp: string;
    domain?: string;
    entityIds?: string[];
    data: any;
    capacityImpact?: any;
  }>(event);

  if (!body.id || !body.source || !body.type || !body.timestamp || !body.data) {
    return apiError('id, source, type, timestamp, and data are required');
  }

  const result = await db.addSignal(adapter, body);
  return json(result, { status: 201 });
};
