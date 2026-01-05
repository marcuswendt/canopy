/**
 * Test Provider - Direct Anthropic API access for integration tests
 *
 * This provider bypasses Electron IPC and reads the API key from
 * the ANTHROPIC_API_KEY environment variable.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... npm run test:integration
 */

import { v4 as uuid } from 'uuid';
import type {
  AIProvider,
  AIMessage,
  AIResponse,
  AIError,
  StreamCallbacks,
  StreamHandle,
  CompletionOptions,
  ExtractionOptions,
} from '../provider';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

export class TestProvider implements AIProvider {
  readonly name = 'Test Provider (Direct API)';
  readonly id = 'test';

  private getApiKey(): string | null {
    return process.env.ANTHROPIC_API_KEY || null;
  }

  async isConfigured(): Promise<boolean> {
    return !!this.getApiKey();
  }

  async complete(
    messages: AIMessage[],
    options: CompletionOptions = {}
  ): Promise<AIResponse | AIError> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { error: 'ANTHROPIC_API_KEY not set', code: 'NO_API_KEY' };
    }

    try {
      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: options.maxTokens || 1024,
          temperature: options.temperature ?? 0.7,
          system: options.system,
          messages,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { error: error.error?.message || 'API request failed', code: response.status };
      }

      const data = await response.json();
      return {
        content: data.content[0].text,
        usage: data.usage ? {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        } : undefined,
        stopReason: data.stop_reason,
      };
    } catch (error) {
      return { error: (error as Error).message, code: 'NETWORK_ERROR' };
    }
  }

  stream(
    messages: AIMessage[],
    callbacks: StreamCallbacks,
    options: CompletionOptions = {}
  ): StreamHandle {
    const streamId = uuid();
    const apiKey = this.getApiKey();

    if (!apiKey) {
      callbacks.onError('ANTHROPIC_API_KEY not set');
      return { id: streamId, cancel: () => {} };
    }

    // For tests, we can use non-streaming completion and emit as single delta
    // This simplifies the implementation while still testing the logic
    (async () => {
      try {
        const response = await fetch(CLAUDE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: options.maxTokens || 1024,
            temperature: options.temperature ?? 0.7,
            system: options.system,
            messages,
            stream: true,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          callbacks.onError(error.error?.message || 'API request failed');
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          callbacks.onError('No response body');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'content_block_delta') {
                  callbacks.onDelta(parsed.delta.text);
                } else if (parsed.type === 'message_stop') {
                  callbacks.onEnd();
                }
              } catch {
                // Ignore parse errors for partial chunks
              }
            }
          }
        }

        callbacks.onEnd();
      } catch (error) {
        callbacks.onError((error as Error).message);
      }
    })();

    return {
      id: streamId,
      cancel: () => {
        // For simplicity, we don't implement cancellation in test provider
      },
    };
  }

  async extract<T>(
    prompt: string,
    input: string,
    schema: object,
    options: ExtractionOptions = {}
  ): Promise<{ data: T } | AIError> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { error: 'ANTHROPIC_API_KEY not set', code: 'NO_API_KEY' };
    }

    const systemPrompt = `You are an expert information extractor. Extract structured data from the user's input.
RESPOND WITH RAW JSON ONLY - NO MARKDOWN, NO CODE BLOCKS, NO EXPLANATION.
Your entire response must be valid JSON matching this schema:
${JSON.stringify(schema, null, 2)}

Important:
- Only include information explicitly stated or strongly implied
- Use null for missing optional fields
- Be conservative with confidence scores
- Do not invent or hallucinate information
- CRITICAL: Output raw JSON only, not wrapped in \`\`\`json blocks`;

    try {
      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 8192,  // Large enough for comprehensive extractions
          temperature: options.temperature ?? 0.3,
          system: systemPrompt,
          messages: [
            { role: 'user', content: `${prompt}\n\nInput to extract from:\n${input}` }
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { error: error.error?.message || 'API request failed', code: response.status };
      }

      const data = await response.json();
      const text = data.content[0].text;

      // Parse JSON from response - try multiple strategies
      let jsonStr = text.trim();

      // Strategy 1: Remove markdown code blocks if present
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }

      // Strategy 2: If still not valid, try to find JSON object/array boundaries
      if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
        const objectStart = jsonStr.indexOf('{');
        const arrayStart = jsonStr.indexOf('[');
        const start = objectStart >= 0 && arrayStart >= 0
          ? Math.min(objectStart, arrayStart)
          : Math.max(objectStart, arrayStart);
        if (start >= 0) {
          const isObject = jsonStr[start] === '{';
          const end = isObject
            ? jsonStr.lastIndexOf('}')
            : jsonStr.lastIndexOf(']');
          if (end > start) {
            jsonStr = jsonStr.slice(start, end + 1);
          }
        }
      }

      const extracted = JSON.parse(jsonStr);
      return { data: extracted };
    } catch (error) {
      return { error: (error as Error).message, code: 'PARSE_ERROR' };
    }
  }
}

// Export singleton instance
export const testProvider = new TestProvider();
