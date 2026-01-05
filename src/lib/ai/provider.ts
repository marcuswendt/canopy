// AI Provider abstraction for Canopy
// Allows swapping between Claude, Gemini, OpenAI, Ollama, etc.

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIResponse {
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
  stopReason?: string;
}

export interface AIError {
  error: string;
  code: string | number;
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onEnd: () => void;
  onError: (error: string) => void;
}

export interface StreamHandle {
  id: string;
  cancel: () => void;
}

export interface CompletionOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ExtractionOptions {
  temperature?: number;
}

// The main provider interface
export interface AIProvider {
  readonly name: string;
  readonly id: string;

  // Check if provider is configured (has API key, etc.)
  isConfigured(): Promise<boolean>;

  // Standard completion
  complete(
    messages: AIMessage[],
    options?: CompletionOptions
  ): Promise<AIResponse | AIError>;

  // Streaming completion
  stream(
    messages: AIMessage[],
    callbacks: StreamCallbacks,
    options?: CompletionOptions
  ): StreamHandle;

  // Structured extraction (JSON output)
  extract<T>(
    prompt: string,
    input: string,
    schema: object,
    options?: ExtractionOptions
  ): Promise<{ data: T } | AIError>;
}

// Provider registry
const providers = new Map<string, AIProvider>();
let activeProviderId: string | null = null;

export function registerProvider(provider: AIProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id?: string): AIProvider | null {
  if (id) {
    return providers.get(id) || null;
  }
  if (activeProviderId) {
    return providers.get(activeProviderId) || null;
  }
  // Return first available provider
  const first = providers.values().next();
  return first.done ? null : first.value;
}

export function setActiveProvider(id: string): boolean {
  if (providers.has(id)) {
    activeProviderId = id;
    return true;
  }
  return false;
}

export function listProviders(): AIProvider[] {
  return Array.from(providers.values());
}

// Type guard for errors
export function isAIError(result: unknown): result is AIError {
  return typeof result === 'object' && result !== null && 'error' in result;
}

// Supported provider types (for settings UI)
export type ProviderType = 'claude' | 'openai' | 'gemini' | 'ollama';

export const PROVIDER_INFO: Record<ProviderType, { name: string; keyPrefix?: string; configUrl?: string }> = {
  claude: {
    name: 'Claude (Anthropic)',
    keyPrefix: 'sk-ant-',
    configUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    name: 'OpenAI',
    keyPrefix: 'sk-',
    configUrl: 'https://platform.openai.com/api-keys',
  },
  gemini: {
    name: 'Gemini (Google)',
    configUrl: 'https://aistudio.google.com/apikey',
  },
  ollama: {
    name: 'Ollama (Local)',
    // No API key needed, just needs Ollama running locally
  },
};
