// AI module - abstracted provider layer
// Currently supports Claude, designed for future providers

export * from './provider';
export { claudeProvider } from './providers/claude';

import { registerProvider, setActiveProvider } from './provider';
import { claudeProvider } from './providers/claude';

// Register default providers
registerProvider(claudeProvider);
setActiveProvider('claude');

// Re-export commonly used functions with provider abstraction
import { getProvider, isAIError } from './provider';
import type { AIMessage, StreamCallbacks, CompletionOptions } from './provider';

// Convenience wrappers that use the active provider
export async function complete(
  messages: AIMessage[],
  options?: CompletionOptions
) {
  const provider = getProvider();
  if (!provider) throw new Error('No AI provider configured');
  return provider.complete(messages, options);
}

export function stream(
  messages: AIMessage[],
  callbacks: StreamCallbacks,
  options?: CompletionOptions
) {
  const provider = getProvider();
  if (!provider) throw new Error('No AI provider configured');
  return provider.stream(messages, callbacks, options);
}

export async function extract<T>(
  prompt: string,
  input: string,
  schema: object,
  options?: { temperature?: number }
) {
  const provider = getProvider();
  if (!provider) throw new Error('No AI provider configured');
  return provider.extract<T>(prompt, input, schema, options);
}

export async function hasApiKey(): Promise<boolean> {
  const provider = getProvider();
  if (!provider) return false;
  return provider.isConfigured();
}

export { isAIError as isError };

// Error message helper
export function getFallbackMessage(error: { code: string | number }): string {
  switch (error.code) {
    case 'NO_API_KEY':
      return "I need an API key to respond. You can add one in Settings.";
    case 429:
      return "I'm receiving too many requests right now. Please try again in a moment.";
    case 'NETWORK_ERROR':
      return "I couldn't connect to the AI service. Check your internet connection.";
    default:
      return "Something went wrong. Please try again.";
  }
}
