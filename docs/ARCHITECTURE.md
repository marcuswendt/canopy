# Canopy Architecture

> Technical specification for the Canopy attention system.

## Overview

Canopy is an Electron app with a SvelteKit frontend that uses Claude AI to provide personalized attention coaching. The system maintains a knowledge graph of entities (people, projects, events) and uses context-aware AI to help users manage their attention.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │   SQLite    │  │  Claude API  │  │  Secrets Manager   │  │
│  │  Database   │  │   Handlers   │  │  (~/.canopy/)      │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
│                         IPC Bridge                           │
├─────────────────────────────────────────────────────────────┤
│                    SvelteKit Renderer                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │   Stores    │  │  AI Client   │  │    Components      │  │
│  │  (entities) │  │  (streaming) │  │  (Markdown, etc)   │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                      Routes                              ││
│  │  /              Home with quick capture                  ││
│  │  /onboarding    Conversational setup with Ray            ││
│  │  /chat          Full chat with context sidebar           ││
│  │  /settings      Integrations & API key config            ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Data Storage

All data is stored locally in `~/.canopy/`:

| Path | Contents |
|------|----------|
| `~/.canopy/canopy.db` | SQLite database with all entities, messages, memories |
| `~/.canopy/secrets.json` | Encrypted API keys (mode 0o600) |
| `~/.canopy/uploads/` | User-uploaded files |

## Database Schema

### Core Tables

**entities** - People, projects, events, concepts
```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- 'person' | 'project' | 'domain' | 'concept' | 'event'
  name TEXT NOT NULL,
  domain TEXT NOT NULL,      -- 'work' | 'family' | 'sport' | 'personal' | 'health'
  description TEXT,
  image_path TEXT,
  icon TEXT,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_mentioned DATETIME
);
```

**relationships** - Connections between entities
```sql
CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,        -- 'belongs_to' | 'related_to' | 'mentioned_with' | 'parent_of'
  weight INTEGER DEFAULT 1,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**threads** - Conversation threads with context management
```sql
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  title TEXT,
  domains JSON,
  entity_ids JSON,
  message_count INTEGER DEFAULT 0,
  summary TEXT,              -- Compacted conversation summary
  summary_up_to INTEGER DEFAULT 0,  -- Message index where summary ends
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**messages** - Individual messages within threads
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,        -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  entities JSON,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**memories** - Long-term memories extracted from conversations
```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  entities JSON,
  importance INTEGER DEFAULT 5,
  tags JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);
```

**artifacts** - Generated documents, plans, checklists
```sql
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,        -- 'plan' | 'note' | 'document' | 'code' | 'checklist'
  content TEXT NOT NULL,
  entities JSON,
  domains JSON,
  pinned BOOLEAN DEFAULT FALSE,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## IPC API

The Electron preload script exposes `window.canopy` with the following methods:

### Entities
- `getEntities()` - Get all entities
- `createEntity(data)` - Create new entity
- `updateEntityMention(entityId)` - Update last_mentioned timestamp
- `deleteEntity(entityId)` - Delete entity

### Threads & Messages
- `createThread(title?)` - Create new conversation thread
- `getRecentThreads(limit?)` - Get recent threads
- `updateThread(data)` - Update thread (domains, entities, summary)
- `addMessage(data)` - Add message to thread
- `getThreadMessages(threadId)` - Get all messages in thread

### Memories
- `createMemory(data)` - Create long-term memory
- `getMemories(limit?)` - Get recent memories
- `deleteMemory(memoryId)` - Delete memory

### Claude AI
- `claude.complete(opts)` - Non-streaming completion
- `claude.stream(opts)` - Streaming completion with delta events
- `claude.extract(opts)` - Structured JSON extraction
- `claude.hasApiKey()` - Check if API key configured

### Secrets
- `getSecret(key)` - Get secret value
- `setSecret(key, value)` - Store secret
- `deleteSecret(key)` - Remove secret

## File Structure

```
canopy/
├── electron/
│   ├── main.js              # Main process, database, IPC handlers
│   └── preload.js           # Expose safe IPC methods to renderer
├── src/
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── index.ts     # AI provider abstraction
│   │   │   ├── claude.ts    # Claude-specific implementation
│   │   │   ├── context.ts   # Context window management
│   │   │   └── extraction.ts # Domain extraction functions
│   │   ├── components/
│   │   │   ├── Markdown.svelte      # Markdown renderer
│   │   │   ├── MentionInput.svelte  # @mention autocomplete
│   │   │   ├── ArtifactPanel.svelte # Sidebar artifacts
│   │   │   └── DomainBadge.svelte   # Domain color badges
│   │   ├── db/
│   │   │   ├── client.ts    # Database client wrapper
│   │   │   └── types.ts     # TypeScript interfaces
│   │   ├── stores/
│   │   │   ├── entities.ts  # Entities Svelte store
│   │   │   └── artifacts.ts # Artifacts store
│   │   ├── uploads/
│   │   │   └── index.ts     # File upload & extraction
│   │   └── integrations/
│   │       └── registry.ts  # Plugin system
│   └── routes/
│       ├── +page.svelte           # Home
│       ├── +layout.svelte         # App shell with sidebar
│       ├── onboarding/+page.svelte # Ray onboarding
│       ├── chat/+page.svelte      # Chat interface
│       └── settings/+page.svelte  # Settings & integrations
├── docs/
│   ├── ARCHITECTURE.md      # This file
│   └── AI.md                # AI system documentation
└── static/
    └── images/              # Static assets
```

## Key Flows

### Onboarding Flow

1. User launches app for first time
2. Ray guides through conversational onboarding
3. AI extracts entities from each response
4. Entities created in database with relationships
5. Onboarding state tracked in localStorage

### Chat Flow

1. User sends message
2. Extract mentioned entities from text
3. Build context using `buildChatContext()`:
   - Select relevant entities by query
   - Load thread history with potential compaction
   - Apply existing summary if present
4. Stream response from Claude
5. Save response to database
6. Persist summary if compaction occurred

### Context Compaction Flow

1. Estimate token count of full history
2. If under 100K tokens, use full history
3. If over threshold:
   - Keep last 4 messages intact
   - Summarize older messages via Claude
   - Store summary in thread record
4. On thread resume, load summary from database

## Security Considerations

- API keys stored in `~/.canopy/secrets.json` with restricted permissions (0o600)
- All Claude API calls made from main process, not renderer
- Context bridge exposes only specific IPC methods
- No external network calls from renderer
