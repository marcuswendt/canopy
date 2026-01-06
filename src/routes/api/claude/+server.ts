/**
 * Claude API Route
 *
 * Server-side Claude API proxy for web deployment.
 * Uses ANTHROPIC_API_KEY from environment variables.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseBody, apiError } from '$lib/server/api-helpers';
import Anthropic from '@anthropic-ai/sdk';

// Lazy-initialize Anthropic client (reads env at runtime)
let anthropic: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (anthropic) return anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  anthropic = new Anthropic({ apiKey });
  return anthropic;
}

export const GET: RequestHandler = async () => {
  // Health check - returns whether API key is configured
  return json({ configured: !!process.env.ANTHROPIC_API_KEY });
};

export const POST: RequestHandler = async (event) => {
  const client = getClient();
  if (!client) {
    return apiError('Claude API not configured', 503);
  }

  const body = await parseBody<{
    action: 'complete' | 'extract';
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    system?: string;
    maxTokens?: number;
    temperature?: number;
    // For extraction
    prompt?: string;
    input?: string;
    schema?: object;
  }>(event);

  if (body.action === 'complete') {
    if (!body.messages || body.messages.length === 0) {
      return apiError('messages are required for completion');
    }

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: body.maxTokens || 4096,
        temperature: body.temperature,
        system: body.system,
        messages: body.messages,
      });

      const textContent = response.content.find((c) => c.type === 'text');
      return json({
        content: textContent?.text || '',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      });
    } catch (err: any) {
      console.error('Claude API error:', err);
      if (err.status === 429) {
        return apiError('Rate limited', 429);
      }
      return apiError(err.message || 'Claude API error', 500);
    }
  }

  if (body.action === 'extract') {
    if (!body.prompt || !body.input || !body.schema) {
      return apiError('prompt, input, and schema are required for extraction');
    }

    console.log('[API Extract] Received extraction request, input length:', body.input.length);

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: body.maxTokens || 4096,
        temperature: body.temperature ?? 0,
        system: `${body.prompt}\n\nRespond with ONLY valid JSON matching this schema:\n${JSON.stringify(body.schema, null, 2)}`,
        messages: [{ role: 'user', content: body.input }],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      const text = textContent?.text || '{}';

      console.log('[API Extract] Raw Claude response:', text.slice(0, 200));

      // Parse JSON from response
      let data;
      try {
        // Handle potential markdown code blocks
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        data = JSON.parse(jsonMatch ? jsonMatch[1] : text);
      } catch {
        console.error('[API Extract] Failed to parse JSON:', text.slice(0, 500));
        return apiError('Failed to parse extraction result', 500);
      }

      console.log('[API Extract] Parsed data:', JSON.stringify(data).slice(0, 300));
      return json({ data });
    } catch (err: any) {
      console.error('[API Extract] Claude API error:', err);
      return apiError(err.message || 'Extraction failed', 500);
    }
  }

  return apiError('Invalid action');
};
