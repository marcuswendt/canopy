import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, parseBody } from '$lib/server/api-helpers';
import * as db from '$lib/server/db-service';

export const GET: RequestHandler = async () => {
  const adapter = await getDb();
  const profile = await db.getUserProfile(adapter);
  return json(profile);
};

export const POST: RequestHandler = async (event) => {
  const adapter = await getDb();
  const body = await parseBody<{
    name?: string;
    nickname?: string;
    email?: string;
    dateOfBirth?: string;
    location?: string;
  }>(event);

  const result = await db.setUserProfile(adapter, body);
  return json(result);
};
