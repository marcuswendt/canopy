// AI module - abstracted provider layer
// Currently supports Claude, designed for future providers

export * from './provider';
export { claudeProvider } from './providers/claude';
export { claudeWebProvider } from './providers/claude-web';

import { registerProvider, setActiveProvider, getProvider } from './provider';
import { claudeProvider } from './providers/claude';
import { claudeWebProvider } from './providers/claude-web';

// Environment detection
const isBrowser = typeof window !== 'undefined';
const isElectron = isBrowser && (window as any).canopy?.claude !== undefined;

if (isBrowser) {
  console.log('[ai] module init - isBrowser:', isBrowser, 'isElectron:', isElectron);
}

// Register default providers (but don't override if test provider is already set)
// This allows integration tests to register their provider before importing extraction functions
registerProvider(claudeProvider);
registerProvider(claudeWebProvider);

if (!getProvider('test')) {
  // Use web provider on Vercel/web, Electron provider on desktop
  if (isBrowser && !isElectron) {
    console.log('[ai] setting active provider to claude-web');
    setActiveProvider('claude-web');
  } else {
    if (isBrowser) console.log('[ai] setting active provider to claude');
    setActiveProvider('claude');
  }
}

// Re-export commonly used functions with provider abstraction
import { isAIError } from './provider';
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
  console.log('[ai] hasApiKey - provider:', provider?.id);
  if (!provider) return false;
  const result = await provider.isConfigured();
  console.log('[ai] hasApiKey - result:', result);
  return result;
}

export { isAIError as isError };

// Error message helper
export function getFallbackMessage(error: { code: string | number }): string {
  switch (error.code) {
    case 'NO_API_KEY':
      return "I need an API key to respond. You can add one in Settings.";
    case 'NOT_ELECTRON':
      return "Please run Canopy as a desktop app (npm run electron:dev).";
    case 429:
      return "I'm receiving too many requests right now. Please try again in a moment.";
    case 'NETWORK_ERROR':
      return "I couldn't connect to the AI service. Check your internet connection.";
    default:
      return "Something went wrong. Please try again.";
  }
}
