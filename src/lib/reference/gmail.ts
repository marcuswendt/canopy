// Gmail Reference Plugin
// Searches your Gmail on demand using the unified Google integration

import type {
  ReferencePlugin,
  SearchOptions,
  SearchResult,
  ReferenceItem,
} from './types';
import { searchGmail, googleApi } from '$lib/integrations/google';

// =============================================================================
// HELPERS
// =============================================================================

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// =============================================================================
// STORAGE (uses same token as Google plugin)
// =============================================================================

const PLUGIN_ID = 'gmail';

async function isGoogleConnected(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.canopy) return false;
  const token = await window.canopy.getSecret('google_access_token');
  return !!token;
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

  // Auth is handled by the unified Google plugin
  authType: 'none', // Piggybacks on Google plugin auth
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
    // Gmail uses the Google plugin's auth
    const connected = await isGoogleConnected();
    if (!connected) {
      throw new Error('Connect to Google first (includes Gmail access)');
    }
    gmailPlugin.connected = true;
  },

  disconnect: async () => {
    // Gmail disconnect is handled by Google plugin
    gmailPlugin.connected = false;
  },

  testConnection: async () => {
    return isGoogleConnected();
  },

  search: async (query: string, options?: SearchOptions): Promise<SearchResult[]> => {
    const connected = await isGoogleConnected();
    if (!connected) {
      throw new Error('Not connected to Google');
    }

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

      // Search using unified Google API
      const results = await searchGmail(gmailQuery, options?.limit || 10);

      return results.map(r => ({
        id: r.id,
        source: PLUGIN_ID,
        title: r.subject,
        snippet: `From: ${r.from}\n${r.snippet}`,
        url: r.link,
        type: 'note' as const,
        createdAt: r.date,
        updatedAt: r.date,
        icon: r.isUnread ? '📬' : '📧',
      }));
    } catch (error) {
      console.error('Gmail search failed:', error);
      throw error;
    }
  },

  getItem: async (messageId: string): Promise<ReferenceItem | null> => {
    const connected = await isGoogleConnected();
    if (!connected) {
      throw new Error('Not connected to Google');
    }

    try {
      // Get token and set it
      const token = await window.canopy!.getSecret('google_access_token');
      if (!token) throw new Error('No Google token');

      googleApi.setAccessToken(token);
      const message = await googleApi.getMessage(messageId, 'full');

      const getHeader = (name: string) =>
        message.payload.headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value;

      const from = getHeader('From') || 'Unknown';
      const to = getHeader('To') || '';
      const subject = getHeader('Subject') || '(no subject)';
      const date = new Date(parseInt(message.internalDate, 10));

      // Extract text content
      let content = message.snippet;

      // Try to get full body
      function findTextPart(parts?: Array<{ mimeType: string; body?: { data?: string }; parts?: any[] }>): string {
        if (!parts) return '';
        for (const part of parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            const base64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
            try { return atob(base64); } catch { return ''; }
          }
          if (part.parts) {
            const text = findTextPart(part.parts);
            if (text) return text;
          }
        }
        return '';
      }

      if (message.payload.mimeType === 'text/plain' && message.payload.body?.data) {
        const base64 = message.payload.body.data.replace(/-/g, '+').replace(/_/g, '/');
        try { content = atob(base64); } catch { /* use snippet */ }
      } else if (message.payload.parts) {
        content = findTextPart(message.payload.parts) || content;
      }

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
