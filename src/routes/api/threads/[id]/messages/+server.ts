import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, parseBody, apiError } from '$lib/server/api-helpers';
import * as db from '$lib/server/db-service';

export const GET: RequestHandler = async (event) => {
  const adapter = await getDb();
  const threadId = event.params.id;
  const messages = await db.getThreadMessages(adapter, threadId);
  return json(messages);
};

export const POST: RequestHandler = async (event) => {
  const adapter = await getDb();
  const threadId = event.params.id;
  const body = await parseBody<{
    role: string;
    content: string;
    entities?: string[];
  }>(event);

  if (!body.role || !body.content) {
    return apiError('role and content are required');
  }

  const message = await db.addMessage(adapter, {
    threadId,
    role: body.role,
    content: body.content,
    entities: body.entities,
  });
  return json(message, { status: 201 });
};
