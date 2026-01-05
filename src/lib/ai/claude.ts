// Claude API Client for Canopy
// Wraps IPC calls with TypeScript types and error handling

import { v4 as uuid } from 'uuid';

// =============================================================================
// TYPES
// =============================================================================

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  content: string;
  usage?: { input_tokens: number; output_tokens: number };
  stopReason?: string;
}

export interface ClaudeError {
  error: string;
  code: string | number;
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onEnd: () => void;
  onError: (error: string) => void;
}

interface ClaudeAPI {
  complete: (opts: {
    messages: ClaudeMessage[];
    system?: string;
    maxTokens?: number;
    temperature?: number;
  }) => Promise<ClaudeResponse | ClaudeError>;

  stream: (opts: {
    messages: ClaudeMessage[];
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
  }) => Promise<{ data: T; usage?: object } | ClaudeError>;

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

// =============================================================================
// CORE API
// =============================================================================

const isElectron = typeof window !== 'undefined' && window.canopy?.claude !== undefined;

export function isError(result: unknown): result is ClaudeError {
  return typeof result === 'object' && result !== null && 'error' in result;
}

export async function complete(
  messages: ClaudeMessage[],
  options: {
    system?: string;
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<ClaudeResponse | ClaudeError> {
  if (!isElectron) {
    return mockComplete(messages, options);
  }

  return window.canopy!.claude!.complete({
    messages,
    system: options.system,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  });
}

export function stream(
  messages: ClaudeMessage[],
  callbacks: StreamCallbacks,
  options: {
    system?: string;
    maxTokens?: number;
    temperature?: number;
  } = {}
): { streamId: string; cancel: () => void } {
  const streamId = uuid();

  if (!isElectron) {
    mockStream(messages, callbacks, streamId);
    return { streamId, cancel: () => {} };
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
    streamId,
    cancel: () => claude.removeStreamListeners(),
  };
}

export async function extract<T>(
  prompt: string,
  input: string,
  schema: object,
  options: { temperature?: number } = {}
): Promise<{ data: T } | ClaudeError> {
  if (!isElectron) {
    return mockExtract<T>(prompt, input, schema);
  }

  return window.canopy!.claude!.extract<T>({
    prompt,
    input,
    schema,
    temperature: options.temperature,
  });
}

export async function hasApiKey(): Promise<boolean> {
  if (!isElectron) return false; // Show setup in web dev mode too
  return window.canopy!.claude!.hasApiKey();
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

export function getFallbackMessage(error: ClaudeError): string {
  switch (error.code) {
    case 'NO_API_KEY':
      return "I need a Claude API key to respond. You can add one in Settings.";
    case 429:
      return "I'm receiving too many requests right now. Please try again in a moment.";
    case 'NETWORK_ERROR':
      return "I couldn't connect to Claude. Check your internet connection.";
    default:
      return "Something went wrong. Please try again.";
  }
}

// =============================================================================
// MOCK IMPLEMENTATIONS (for web dev mode)
// =============================================================================

async function mockComplete(
  messages: ClaudeMessage[],
  _options: { system?: string }
): Promise<ClaudeResponse> {
  await new Promise(r => setTimeout(r, 500));
  const lastMessage = messages[messages.length - 1]?.content || '';
  return {
    content: `[Mock Response] You said: "${lastMessage.slice(0, 50)}..."`,
    usage: { input_tokens: 100, output_tokens: 50 },
    stopReason: 'end_turn',
  };
}

async function mockStream(
  _messages: ClaudeMessage[],
  callbacks: StreamCallbacks,
  _streamId: string
): Promise<void> {
  const response = "This is a mock streaming response. In production, this would be generated by Claude based on your context and question.";
  const words = response.split(' ');

  for (const word of words) {
    await new Promise(r => setTimeout(r, 50));
    callbacks.onDelta(word + ' ');
  }

  callbacks.onEnd();
}

async function mockExtract<T>(
  _prompt: string,
  _input: string,
  _schema: object
): Promise<{ data: T }> {
  await new Promise(r => setTimeout(r, 300));
  // Return empty structure - caller should handle gracefully
  return { data: {} as T };
}
