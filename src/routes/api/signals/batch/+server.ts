import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, parseBody, apiError } from '$lib/server/api-helpers';
import * as db from '$lib/server/db-service';

export const POST: RequestHandler = async (event) => {
  const adapter = await getDb();
  const body = await parseBody<{ signals: any[] }>(event);

  if (!body.signals || !Array.isArray(body.signals)) {
    return apiError('signals array is required');
  }

  const result = await db.addSignals(adapter, body.signals);
  return json(result, { status: 201 });
};
