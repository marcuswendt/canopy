// Claude Provider implementation
// Uses Anthropic's Claude API via Electron IPC

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

interface ClaudeAPI {
  complete: (opts: {
    messages: AIMessage[];
    system?: string;
    maxTokens?: number;
    temperature?: number;
  }) => Promise<AIResponse | AIError>;

  stream: (opts: {
    messages: AIMessage[];
    system?: string;
    maxTokens?: number;
    temperature?: number;
    streamId: string;
  }) => Promise<{ success?: boolean; error?: string }>;

  extract: <T>(opts: {
    prompt: string;
    input: string;
    schema: object;
    temperature?: number;
  }) => Promise<{ data: T; usage?: object } | AIError>;

  hasApiKey: () => Promise<boolean>;

  onStreamDelta: (callback: (data: { streamId: string; delta: string }) => void) => void;
  onStreamEnd: (callback: (data: { streamId: string }) => void) => void;
  onStreamError: (callback: (data: { streamId: string; error: string }) => void) => void;
  removeStreamListeners: () => void;
}

declare global {
  interface Window {
    canopy?: {
      claude?: ClaudeAPI;
      [key: string]: unknown;
    };
  }
}

const isElectron = typeof window !== 'undefined' && window.canopy?.claude !== undefined;

export class ClaudeProvider implements AIProvider {
  readonly name = 'Claude (Anthropic)';
  readonly id = 'claude';

  async isConfigured(): Promise<boolean> {
    if (!isElectron) return false;
    return window.canopy!.claude!.hasApiKey();
  }

  async complete(
    messages: AIMessage[],
    options: CompletionOptions = {}
  ): Promise<AIResponse | AIError> {
    if (!isElectron) {
      return { error: 'Electron required', code: 'NOT_ELECTRON' };
    }

    const result = await window.canopy!.claude!.complete({
      messages,
      system: options.system,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });

    return result;
  }

  stream(
    messages: AIMessage[],
    callbacks: StreamCallbacks,
    options: CompletionOptions = {}
  ): StreamHandle {
    const streamId = uuid();

    if (!isElectron) {
      callbacks.onError('Electron required');
      return { id: streamId, cancel: () => {} };
    }

    const claude = window.canopy!.claude!;

    // Set up listeners
    claude.onStreamDelta(({ streamId: sid, delta }) => {
      if (sid === streamId) callbacks.onDelta(delta);
    });

    claude.onStreamEnd(({ streamId: sid }) => {
      if (sid === streamId) {
        callbacks.onEnd();
        claude.removeStreamListeners();
      }
    });

    claude.onStreamError(({ streamId: sid, error }) => {
      if (sid === streamId) {
        callbacks.onError(error);
        claude.removeStreamListeners();
      }
    });

    // Start stream
    claude.stream({
      messages,
      system: options.system,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      streamId,
    });

    return {
      id: streamId,
      cancel: () => claude.removeStreamListeners(),
    };
  }

  async extract<T>(
    prompt: string,
    input: string,
    schema: object,
    options: ExtractionOptions = {}
  ): Promise<{ data: T } | AIError> {
    if (!isElectron) {
      return { error: 'Electron required', code: 'NOT_ELECTRON' };
    }

    return window.canopy!.claude!.extract<T>({
      prompt,
      input,
      schema,
      temperature: options.temperature,
    });
  }
}

// Export singleton instance
export const claudeProvider = new ClaudeProvider();
