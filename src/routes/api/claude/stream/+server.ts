/**
 * Claude Streaming API Route
 *
 * Server-sent events endpoint for Claude streaming responses.
 */

import type { RequestHandler } from './$types';
import { parseBody, apiError } from '$lib/server/api-helpers';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

// Lazy-initialize Anthropic client (reads env at runtime)
let anthropic: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (anthropic) return anthropic;
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  anthropic = new Anthropic({ apiKey });
  return anthropic;
}

export const POST: RequestHandler = async (event) => {
  const client = getClient();
  if (!client) {
    return apiError('Claude API not configured', 503);
  }

  const body = await parseBody<{
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    system?: string;
    maxTokens?: number;
    temperature?: number;
  }>(event);

  if (!body.messages || body.messages.length === 0) {
    return apiError('messages are required');
  }

  // Create a streaming response using Server-Sent Events
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: body.maxTokens || 4096,
          temperature: body.temperature,
          system: body.system,
          messages: body.messages,
          stream: true,
        });

        for await (const event of response) {
          if (event.type === 'content_block_delta') {
            const delta = event.delta;
            if ('text' in delta) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ delta: delta.text })}\n\n`)
              );
            }
          } else if (event.type === 'message_stop') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          }
        }
      } catch (err: any) {
        console.error('Claude streaming error:', err);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: err.message || 'Stream error' })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
