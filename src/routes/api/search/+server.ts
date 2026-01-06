import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, apiError, getParam } from '$lib/server/api-helpers';
import * as db from '$lib/server/db-service';

export const GET: RequestHandler = async (event) => {
  const adapter = await getDb();
  const query = getParam(event, 'q');

  if (!query) {
    return apiError('q (query) is required');
  }

  const results = await db.search(adapter, query);
  return json(results);
};
