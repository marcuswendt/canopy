// Reference Plugins
// Unlike signal plugins (WHOOP, Strava) that sync data IN,
// reference plugins let Ray SEARCH external sources on demand

// =============================================================================
// TYPES
// =============================================================================

export interface ReferencePlugin {
  id: string;
  name: string;
  description: string;
  icon: string;
  
  // Platform requirements
  platform?: 'darwin' | 'win32' | 'linux' | 'all';
  
  // Auth
  authType: 'oauth2' | 'api_key' | 'local' | 'none';
  authConfig?: OAuthConfig;
  
  // State
  connected: boolean;
  
  // Capabilities
  capabilities: {
    search: boolean;        // Can search across content
    getPage: boolean;       // Can retrieve specific items
    embed: boolean;         // Can show inline previews
    link: boolean;          // Can link to original
    write?: boolean;        // Can create/update (usually false)
  };
  
  // Methods
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  testConnection: () => Promise<boolean>;
  
  search: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
  getItem?: (id: string) => Promise<ReferenceItem | null>;
  
  // For Ray to decide when to search
  relevanceSignals: string[];  // Keywords that suggest this source might help
}

export interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes: string[];
}

export interface SearchOptions {
  // Filters
  database?: string;        // For Notion: specific database
  folder?: string;          // For Notes: specific folder
  tags?: string[];
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Sorting
  sortBy?: 'relevance' | 'date' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult {
  id: string;
  source: string;           // Plugin ID
  title: string;
  snippet: string;          // Preview text
  url?: string;             // Link to original
  
  // Metadata
  type: 'page' | 'note' | 'database_item' | 'journal_entry';
  createdAt?: Date;
  updatedAt?: Date;
  
  // For display
  icon?: string;
  tags?: string[];
  
  // Relevance
  score?: number;           // Search relevance score
}

export interface ReferenceItem {
  id: string;
  source: string;
  title: string;
  content: string;          // Full content (markdown)
  url?: string;
  
  type: string;
  createdAt?: Date;
  updatedAt?: Date;
  
  // Extracted
  entities?: string[];
  topics?: string[];
  
  // For Notion
  properties?: Record<string, any>;
  
  // For embedding in conversation
  preview?: string;         // Shortened version for context
}

// =============================================================================
// WHEN TO SEARCH
// =============================================================================

/**
 * Signals that suggest Ray should search reference sources
 */
export const SEARCH_TRIGGERS = {
  explicit: [
    'my notes',
    'i wrote',
    'i noted',
    'check my',
    'find my',
    'search my',
    'look up',
    'remember when',
    'we discussed',
    'i was thinking about',
  ],
  
  contextual: [
    'strategy',
    'plan',
    'decision',
    'thinking',
    'approach',
    'framework',
    'model',
    'structure',
  ],
  
  // Entity types that likely have history
  entityTypes: [
    'project',
    'company', 
    'concept',
  ],
};

/**
 * Determine if Ray should search reference sources
 */
export function shouldSearchReferences(
  message: string,
  entities: string[],
  entityTypes: string[]
): boolean {
  const lowerMessage = message.toLowerCase();
  
  // Explicit triggers — always search
  if (SEARCH_TRIGGERS.explicit.some(t => lowerMessage.includes(t))) {
    return true;
  }
  
  // Contextual + entity type match
  const hasContextualTrigger = SEARCH_TRIGGERS.contextual.some(t => 
    lowerMessage.includes(t)
  );
  const hasRelevantEntityType = entityTypes.some(t =>
    SEARCH_TRIGGERS.entityTypes.includes(t)
  );
  
  if (hasContextualTrigger && hasRelevantEntityType) {
    return true;
  }
  
  // Named entities mentioned — might have history
  if (entities.length > 0 && lowerMessage.length > 50) {
    return true;
  }
  
  return false;
}

/**
 * Build search query from conversation context
 */
export function buildSearchQuery(
  message: string,
  entities: string[],
  recentTopics: string[]
): string {
  // Extract key terms from message
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);
  
  const words = message
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  
  // Combine with entities
  const queryTerms = [...new Set([...entities, ...words.slice(0, 5)])];
  
  return queryTerms.join(' ');
}

// =============================================================================
// REFERENCE CONTEXT FOR RAY
// =============================================================================

export interface ReferenceContext {
  searched: boolean;
  sources: string[];          // Which plugins were searched
  results: SearchResult[];
  
  // For Ray's prompt
  summary?: string;           // "Found 3 related notes from Notion"
  relevantExcerpts?: string[]; // Key snippets to include in context
}

/**
 * Format reference results for Ray's context
 */
export function formatReferenceContext(results: SearchResult[]): ReferenceContext {
  if (results.length === 0) {
    return {
      searched: true,
      sources: [],
      results: [],
    };
  }
  
  const sources = [...new Set(results.map(r => r.source))];
  const excerpts = results
    .slice(0, 3)  // Top 3 most relevant
    .map(r => `[${r.title}] ${r.snippet}`);
  
  return {
    searched: true,
    sources,
    results,
    summary: `Found ${results.length} related note${results.length === 1 ? '' : 's'} from ${sources.join(', ')}`,
    relevantExcerpts: excerpts,
  };
}
