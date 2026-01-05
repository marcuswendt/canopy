// Notion Reference Plugin
// Searches your Notion workspace on demand — doesn't bulk sync

import type { 
  ReferencePlugin, 
  SearchOptions, 
  SearchResult, 
  ReferenceItem,
  OAuthConfig,
} from './types';

// =============================================================================
// NOTION API TYPES
// =============================================================================

interface NotionPage {
  id: string;
  object: 'page';
  created_time: string;
  last_edited_time: string;
  parent: {
    type: 'database_id' | 'page_id' | 'workspace';
    database_id?: string;
    page_id?: string;
  };
  properties: Record<string, NotionProperty>;
  url: string;
  icon?: { type: string; emoji?: string };
}

interface NotionProperty {
  id: string;
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  number?: number;
  select?: { name: string };
  multi_select?: { name: string }[];
  date?: { start: string; end?: string };
  checkbox?: boolean;
  url?: string;
  email?: string;
  phone_number?: string;
}

interface NotionSearchResponse {
  results: NotionPage[];
  has_more: boolean;
  next_cursor?: string;
}

interface NotionBlocksResponse {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor?: string;
}

interface NotionBlock {
  id: string;
  type: string;
  paragraph?: { rich_text: { plain_text: string }[] };
  heading_1?: { rich_text: { plain_text: string }[] };
  heading_2?: { rich_text: { plain_text: string }[] };
  heading_3?: { rich_text: { plain_text: string }[] };
  bulleted_list_item?: { rich_text: { plain_text: string }[] };
  numbered_list_item?: { rich_text: { plain_text: string }[] };
  to_do?: { rich_text: { plain_text: string }[]; checked: boolean };
  quote?: { rich_text: { plain_text: string }[] };
  code?: { rich_text: { plain_text: string }[]; language: string };
  callout?: { rich_text: { plain_text: string }[]; icon?: { emoji?: string } };
}

// =============================================================================
// NOTION API CLIENT
// =============================================================================

class NotionAPI {
  private baseUrl = 'https://api.notion.com/v1';
  private accessToken: string | null = null;
  private notionVersion = '2022-06-28';
  
  setAccessToken(token: string) {
    this.accessToken = token;
  }
  
  clearToken() {
    this.accessToken = null;
  }
  
  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Notion');
    }
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Notion-Version': this.notionVersion,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Notion authentication expired');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(`Notion API error: ${error.message || response.status}`);
    }
    
    return response.json();
  }
  
  async search(query: string, options?: {
    filter?: { property: string; value: string };
    sort?: { direction: 'ascending' | 'descending'; timestamp: 'last_edited_time' };
    pageSize?: number;
    startCursor?: string;
  }): Promise<NotionSearchResponse> {
    return this.fetch<NotionSearchResponse>('/search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        filter: options?.filter,
        sort: options?.sort,
        page_size: options?.pageSize || 10,
        start_cursor: options?.startCursor,
      }),
    });
  }
  
  async getPage(pageId: string): Promise<NotionPage> {
    return this.fetch<NotionPage>(`/pages/${pageId}`);
  }
  
  async getBlocks(pageId: string, startCursor?: string): Promise<NotionBlocksResponse> {
    const params = startCursor ? `?start_cursor=${startCursor}` : '';
    return this.fetch<NotionBlocksResponse>(`/blocks/${pageId}/children${params}`);
  }
  
  async getDatabase(databaseId: string): Promise<any> {
    return this.fetch(`/databases/${databaseId}`);
  }
  
  async queryDatabase(databaseId: string, options?: {
    filter?: any;
    sorts?: any[];
    pageSize?: number;
    startCursor?: string;
  }): Promise<NotionSearchResponse> {
    return this.fetch<NotionSearchResponse>(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        filter: options?.filter,
        sorts: options?.sorts,
        page_size: options?.pageSize || 10,
        start_cursor: options?.startCursor,
      }),
    });
  }
}

const api = new NotionAPI();

// =============================================================================
// HELPERS
// =============================================================================

function extractTitle(page: NotionPage): string {
  // Find title property
  for (const [key, prop] of Object.entries(page.properties)) {
    if (prop.type === 'title' && prop.title) {
      return prop.title.map(t => t.plain_text).join('');
    }
  }
  return 'Untitled';
}

function extractPlainText(blocks: NotionBlock[]): string {
  const texts: string[] = [];
  
  for (const block of blocks) {
    let richText: { plain_text: string }[] | undefined;
    
    switch (block.type) {
      case 'paragraph':
        richText = block.paragraph?.rich_text;
        break;
      case 'heading_1':
        richText = block.heading_1?.rich_text;
        break;
      case 'heading_2':
        richText = block.heading_2?.rich_text;
        break;
      case 'heading_3':
        richText = block.heading_3?.rich_text;
        break;
      case 'bulleted_list_item':
        richText = block.bulleted_list_item?.rich_text;
        break;
      case 'numbered_list_item':
        richText = block.numbered_list_item?.rich_text;
        break;
      case 'to_do':
        richText = block.to_do?.rich_text;
        break;
      case 'quote':
        richText = block.quote?.rich_text;
        break;
      case 'callout':
        richText = block.callout?.rich_text;
        break;
    }
    
    if (richText) {
      texts.push(richText.map(t => t.plain_text).join(''));
    }
  }
  
  return texts.join('\n');
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// =============================================================================
// STORAGE
// =============================================================================

const STORAGE_KEY = 'canopy_notion_token';

async function getStoredToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  // In production, use Electron's secure storage
  return localStorage.getItem(STORAGE_KEY);
}

async function storeToken(token: string): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, token);
}

async function clearToken(): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

// =============================================================================
// PLUGIN DEFINITION
// =============================================================================

export const notionPlugin: ReferencePlugin = {
  id: 'notion',
  name: 'Notion',
  description: 'Search your Notion workspace',
  icon: '📝',
  
  platform: 'all',
  
  authType: 'oauth2',
  authConfig: {
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    clientId: '', // Set from environment
    scopes: [],   // Notion uses integration capabilities, not scopes
  },
  
  connected: false,
  
  capabilities: {
    search: true,
    getPage: true,
    embed: true,
    link: true,
    write: false,
  },
  
  relevanceSignals: [
    'notion',
    'notes',
    'journal',
    'wrote',
    'documented',
    'database',
    'page',
    'wiki',
  ],
  
  connect: async () => {
    // In Electron, this would open OAuth flow
    // For now, check if token exists
    const token = await getStoredToken();
    if (token) {
      api.setAccessToken(token);
      notionPlugin.connected = true;
    } else {
      throw new Error('OAuth flow not implemented - set token manually');
    }
  },
  
  disconnect: async () => {
    await clearToken();
    api.clearToken();
    notionPlugin.connected = false;
  },
  
  testConnection: async () => {
    try {
      const token = await getStoredToken();
      if (!token) return false;
      
      api.setAccessToken(token);
      // Try a simple search to verify connection
      await api.search('', { pageSize: 1 });
      return true;
    } catch {
      return false;
    }
  },
  
  search: async (query: string, options?: SearchOptions): Promise<SearchResult[]> => {
    const token = await getStoredToken();
    if (!token) throw new Error('Not connected to Notion');
    
    api.setAccessToken(token);
    
    try {
      // If specific database requested
      if (options?.database) {
        const response = await api.queryDatabase(options.database, {
          pageSize: options?.limit || 10,
        });
        
        return response.results.map(page => ({
          id: page.id,
          source: 'notion',
          title: extractTitle(page),
          snippet: '', // Would need to fetch blocks for content
          url: page.url,
          type: 'database_item' as const,
          createdAt: new Date(page.created_time),
          updatedAt: new Date(page.last_edited_time),
          icon: page.icon?.emoji,
        }));
      }
      
      // General search
      const response = await api.search(query, {
        pageSize: options?.limit || 10,
        sort: options?.sortBy === 'date' 
          ? { direction: options.sortOrder === 'asc' ? 'ascending' : 'descending', timestamp: 'last_edited_time' }
          : undefined,
      });
      
      // Fetch snippets for top results
      const results: SearchResult[] = [];
      
      for (const page of response.results) {
        if (page.object !== 'page') continue;
        
        let snippet = '';
        try {
          const blocks = await api.getBlocks(page.id);
          const text = extractPlainText(blocks.results);
          snippet = truncate(text, 200);
        } catch {
          // Skip snippet if blocks fail
        }
        
        results.push({
          id: page.id,
          source: 'notion',
          title: extractTitle(page),
          snippet,
          url: page.url,
          type: page.parent.type === 'database_id' ? 'database_item' : 'page',
          createdAt: new Date(page.created_time),
          updatedAt: new Date(page.last_edited_time),
          icon: page.icon?.emoji,
        });
      }
      
      return results;
      
    } catch (error) {
      console.error('Notion search failed:', error);
      throw error;
    }
  },
  
  getItem: async (pageId: string): Promise<ReferenceItem | null> => {
    const token = await getStoredToken();
    if (!token) throw new Error('Not connected to Notion');
    
    api.setAccessToken(token);
    
    try {
      const page = await api.getPage(pageId);
      
      // Fetch all blocks
      let allBlocks: NotionBlock[] = [];
      let cursor: string | undefined;
      
      do {
        const response = await api.getBlocks(pageId, cursor);
        allBlocks = [...allBlocks, ...response.results];
        cursor = response.has_more ? response.next_cursor : undefined;
      } while (cursor);
      
      const content = extractPlainText(allBlocks);
      
      return {
        id: page.id,
        source: 'notion',
        title: extractTitle(page),
        content,
        url: page.url,
        type: page.parent.type === 'database_id' ? 'database_item' : 'page',
        createdAt: new Date(page.created_time),
        updatedAt: new Date(page.last_edited_time),
        properties: page.properties,
        preview: truncate(content, 500),
      };
      
    } catch (error) {
      console.error('Failed to get Notion page:', error);
      return null;
    }
  },
};

export default notionPlugin;
