/**
 * Web Claude Provider
 *
 * Claude provider for web deployment - uses server-side API routes.
 * The API key is stored server-side, not exposed to the client.
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

// Check if running in browser (not SSR)
const isBrowser = typeof window !== 'undefined';

export class ClaudeWebProvider implements AIProvider {
  readonly name = 'Claude (Web)';
  readonly id = 'claude-web';

  private configuredCache: boolean | null = null;

  async isConfigured(): Promise<boolean> {
    if (!isBrowser) return false;

    // Cache the result to avoid repeated API calls
    if (this.configuredCache !== null) {
      return this.configuredCache;
    }

    try {
      const response = await fetch('/api/claude');
      if (!response.ok) return false;
      const data = await response.json();
      this.configuredCache = data.configured === true;
      return this.configuredCache;
    } catch {
      return false;
    }
  }

  async complete(
    messages: AIMessage[],
    options: CompletionOptions = {}
  ): Promise<AIResponse | AIError> {
    if (!isBrowser) {
      return { error: 'Not available during SSR', code: 'SSR_ERROR' };
    }

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          messages,
          system: options.system,
          maxTokens: options.maxTokens,
          temperature: options.temperature,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          return { error: 'Rate limited', code: 429 };
        }
        return { error: errorData.error || 'API error', code: response.status };
      }

      const data = await response.json();
      return {
        content: data.content,
        usage: data.usage,
      };
    } catch (err: any) {
      return { error: err.message || 'Network error', code: 'NETWORK_ERROR' };
    }
  }

  stream(
    messages: AIMessage[],
    callbacks: StreamCallbacks,
    options: CompletionOptions = {}
  ): StreamHandle {
    const streamId = uuid();

    if (!isBrowser) {
      callbacks.onError('Not available during SSR');
      return { id: streamId, cancel: () => {} };
    }

    let aborted = false;
    const abortController = new AbortController();

    // Start streaming
    (async () => {
      try {
        const response = await fetch('/api/claude/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages,
            system: options.system,
            maxTokens: options.maxTokens,
            temperature: options.temperature,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          callbacks.onError(errorData.error || 'Stream error');
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          callbacks.onError('No response body');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (!aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.delta) {
                  callbacks.onDelta(data.delta);
                } else if (data.done) {
                  callbacks.onEnd();
                  return;
                } else if (data.error) {
                  callbacks.onError(data.error);
                  return;
                }
              } catch {
                // Ignore parse errors for incomplete lines
              }
            }
          }
        }

        callbacks.onEnd();
      } catch (err: any) {
        if (!aborted) {
          callbacks.onError(err.message || 'Stream error');
        }
      }
    })();

    return {
      id: streamId,
      cancel: () => {
        aborted = true;
        abortController.abort();
      },
    };
  }

  async extract<T>(
    prompt: string,
    input: string,
    schema: object,
    options: ExtractionOptions = {}
  ): Promise<{ data: T } | AIError> {
    if (!isBrowser) {
      return { error: 'Not available during SSR', code: 'SSR_ERROR' };
    }

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extract',
          prompt,
          input,
          schema,
          temperature: options.temperature,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { error: errorData.error || 'Extraction failed', code: response.status };
      }

      const data = await response.json();
      return { data: data.data };
    } catch (err: any) {
      return { error: err.message || 'Network error', code: 'NETWORK_ERROR' };
    }
  }
}

// Export singleton instance
export const claudeWebProvider = new ClaudeWebProvider();
