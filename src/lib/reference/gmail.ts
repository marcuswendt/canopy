// Gmail Reference Plugin
// Searches your Gmail on demand - doesn't bulk sync

import type {
  ReferencePlugin,
  SearchOptions,
  SearchResult,
  ReferenceItem,
  OAuthConfig,
} from './types';

// =============================================================================
// GMAIL API TYPES
// =============================================================================

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body?: { size: number; data?: string };
    parts?: Array<{
      mimeType: string;
      body?: { size: number; data?: string };
      parts?: Array<{ mimeType: string; body?: { size: number; data?: string } }>;
    }>;
  };
  sizeEstimate: number;
  historyId: string;
  internalDate: string;
}

interface GmailMessageList {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate: number;
}

interface GmailThread {
  id: string;
  historyId: string;
  messages: GmailMessage[];
}

// =============================================================================
// GMAIL API CLIENT
// =============================================================================

class GmailAPI {
  private baseUrl = 'https://gmail.googleapis.com/gmail/v1/users/me';
  private accessToken: string | null = null;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  clearToken() {
    this.accessToken = null;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Gmail');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Gmail authentication expired');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(`Gmail API error: ${error.error?.message || response.status}`);
    }

    return response.json();
  }

  /**
   * Search messages
   */
  async searchMessages(query: string, options?: {
    maxResults?: number;
    pageToken?: string;
  }): Promise<GmailMessageList> {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(options?.maxResults || 10),
    });
    if (options?.pageToken) {
      params.set('pageToken', options.pageToken);
    }

    return this.fetch<GmailMessageList>(`/messages?${params}`);
  }

  /**
   * Get full message by ID
   */
  async getMessage(messageId: string, format: 'full' | 'metadata' | 'minimal' = 'full'): Promise<GmailMessage> {
    return this.fetch<GmailMessage>(`/messages/${messageId}?format=${format}`);
  }

  /**
   * Get thread by ID
   */
  async getThread(threadId: string): Promise<GmailThread> {
    return this.fetch<GmailThread>(`/threads/${threadId}?format=full`);
  }
}

const api = new GmailAPI();

// =============================================================================
// HELPERS
// =============================================================================

function getHeader(message: GmailMessage, name: string): string | undefined {
  return message.payload.headers.find(
    h => h.name.toLowerCase() === name.toLowerCase()
  )?.value;
}

function decodeBase64(data: string): string {
  // Gmail uses URL-safe base64
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return atob(base64);
  } catch {
    return '';
  }
}

function extractTextContent(message: GmailMessage): string {
  // Try to get plain text body
  function findTextPart(parts?: Array<{ mimeType: string; body?: { data?: string }; parts?: any[] }>): string {
    if (!parts) return '';

    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
      if (part.parts) {
        const text = findTextPart(part.parts);
        if (text) return text;
      }
    }
    return '';
  }

  // Check if body is directly available
  if (message.payload.mimeType === 'text/plain' && message.payload.body?.data) {
    return decodeBase64(message.payload.body.data);
  }

  // Check parts
  if (message.payload.parts) {
    return findTextPart(message.payload.parts);
  }

  // Fall back to snippet
  return message.snippet;
}

function formatDate(internalDate: string): Date {
  return new Date(parseInt(internalDate, 10));
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function getEmailType(message: GmailMessage): 'inbox' | 'sent' | 'draft' {
  const labels = message.labelIds || [];
  if (labels.includes('SENT')) return 'sent';
  if (labels.includes('DRAFT')) return 'draft';
  return 'inbox';
}

// =============================================================================
// STORAGE
// =============================================================================

const PLUGIN_ID = 'gmail';

async function getStoredToken(): Promise<string | null> {
  if (typeof window === 'undefined' || !window.canopy) return null;
  return window.canopy.getSecret(`${PLUGIN_ID}_access_token`);
}

async function clearStoredToken(): Promise<void> {
  if (typeof window === 'undefined' || !window.canopy) return;
  await window.canopy.deleteSecret(`${PLUGIN_ID}_access_token`);
  await window.canopy.deleteSecret(`${PLUGIN_ID}_refresh_token`);
}

// =============================================================================
// PLUGIN DEFINITION
// =============================================================================

export const gmailPlugin: ReferencePlugin = {
  id: PLUGIN_ID,
  name: 'Gmail',
  description: 'Search your Gmail inbox',
  icon: '📧',

  platform: 'all',

  authType: 'oauth2',
  authConfig: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: '', // Set from environment or settings
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
  } as OAuthConfig,

  connected: false,

  capabilities: {
    search: true,
    getPage: true,
    embed: false,
    link: true,
    write: false,
  },

  relevanceSignals: [
    'email',
    'gmail',
    'sent',
    'received',
    'inbox',
    'message from',
    'replied',
    'forwarded',
    'attached',
    'attachment',
  ],

  connect: async () => {
    if (typeof window === 'undefined' || !window.canopy?.oauth) {
      throw new Error('OAuth not available');
    }

    const config = gmailPlugin.authConfig!;

    // Start OAuth flow
    const { code } = await window.canopy.oauth.start(PLUGIN_ID, {
      authUrl: config.authUrl,
      clientId: config.clientId,
      scopes: config.scopes,
      redirectUri: 'http://localhost:5173/oauth/callback',
    });

    // Exchange code for tokens
    const result = await window.canopy.oauth.exchange(PLUGIN_ID, code, {
      tokenUrl: config.tokenUrl,
      clientId: config.clientId,
      redirectUri: 'http://localhost:5173/oauth/callback',
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to exchange code for tokens');
    }

    gmailPlugin.connected = true;
  },

  disconnect: async () => {
    await clearStoredToken();
    api.clearToken();
    gmailPlugin.connected = false;
  },

  testConnection: async () => {
    try {
      const token = await getStoredToken();
      if (!token) return false;

      api.setAccessToken(token);
      // Try a simple search to verify connection
      await api.searchMessages('in:inbox', { maxResults: 1 });
      return true;
    } catch {
      return false;
    }
  },

  search: async (query: string, options?: SearchOptions): Promise<SearchResult[]> => {
    const token = await getStoredToken();
    if (!token) throw new Error('Not connected to Gmail');

    api.setAccessToken(token);

    try {
      // Build Gmail search query
      let gmailQuery = query;

      // Add date filters if provided
      if (options?.dateRange?.from) {
        const fromDate = options.dateRange.from.toISOString().split('T')[0];
        gmailQuery += ` after:${fromDate}`;
      }
      if (options?.dateRange?.to) {
        const toDate = options.dateRange.to.toISOString().split('T')[0];
        gmailQuery += ` before:${toDate}`;
      }

      // Search messages
      const searchResult = await api.searchMessages(gmailQuery, {
        maxResults: options?.limit || 10,
      });

      if (!searchResult.messages || searchResult.messages.length === 0) {
        return [];
      }

      // Fetch message details
      const results: SearchResult[] = [];

      for (const msg of searchResult.messages.slice(0, options?.limit || 10)) {
        try {
          const message = await api.getMessage(msg.id, 'metadata');

          const from = getHeader(message, 'From') || 'Unknown';
          const subject = getHeader(message, 'Subject') || '(no subject)';
          const date = formatDate(message.internalDate);

          // Extract sender name from "Name <email>" format
          const senderMatch = from.match(/^([^<]+)?<?([^>]+)?>?$/);
          const senderName = senderMatch?.[1]?.trim() || senderMatch?.[2] || from;

          results.push({
            id: message.id,
            source: PLUGIN_ID,
            title: subject,
            snippet: `From: ${senderName}\n${message.snippet}`,
            url: `https://mail.google.com/mail/u/0/#inbox/${message.id}`,
            type: 'note', // Using 'note' as closest match
            createdAt: date,
            updatedAt: date,
            icon: getEmailType(message) === 'sent' ? '📤' : '📥',
          });
        } catch (err) {
          console.warn(`Failed to fetch message ${msg.id}:`, err);
        }
      }

      return results;
    } catch (error) {
      // Try to refresh token if expired
      if (error instanceof Error && error.message.includes('expired')) {
        if (typeof window !== 'undefined' && window.canopy?.oauth) {
          const config = gmailPlugin.authConfig!;
          const refreshResult = await window.canopy.oauth.refresh(PLUGIN_ID, {
            tokenUrl: config.tokenUrl,
            clientId: config.clientId,
          });

          if (refreshResult.success && refreshResult.accessToken) {
            api.setAccessToken(refreshResult.accessToken);
            // Retry search
            return gmailPlugin.search(query, options);
          }
        }
      }
      throw error;
    }
  },

  getItem: async (messageId: string): Promise<ReferenceItem | null> => {
    const token = await getStoredToken();
    if (!token) throw new Error('Not connected to Gmail');

    api.setAccessToken(token);

    try {
      const message = await api.getMessage(messageId, 'full');

      const from = getHeader(message, 'From') || 'Unknown';
      const to = getHeader(message, 'To') || '';
      const subject = getHeader(message, 'Subject') || '(no subject)';
      const date = formatDate(message.internalDate);
      const content = extractTextContent(message);

      return {
        id: message.id,
        source: PLUGIN_ID,
        title: subject,
        content: `From: ${from}\nTo: ${to}\nDate: ${date.toLocaleString()}\n\n${content}`,
        url: `https://mail.google.com/mail/u/0/#inbox/${message.id}`,
        type: 'note',
        createdAt: date,
        updatedAt: date,
        preview: truncate(content, 500),
      };
    } catch (error) {
      console.error('Failed to get Gmail message:', error);
      return null;
    }
  },
};

export default gmailPlugin;
