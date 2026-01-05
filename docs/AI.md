# AI System

> Documentation for Canopy's AI integration using Claude.

## Overview

Canopy uses Claude (Anthropic) as its AI backbone. The AI powers:

1. **Ray** - The attention coach personality
2. **Entity extraction** - NER from user messages during onboarding
3. **Document processing** - Extract content from uploads
4. **Context management** - Smart conversation compaction

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  src/lib/ai/                         │
│  ┌───────────────┐  ┌──────────────────────────────┐│
│  │   index.ts    │  │  Exports: complete, stream,  ││
│  │  (provider    │  │  extract, isError, types     ││
│  │  abstraction) │  │                              ││
│  └───────────────┘  └──────────────────────────────┘│
│  ┌───────────────┐  ┌──────────────────────────────┐│
│  │   claude.ts   │  │  Claude-specific impl        ││
│  │  (impl)       │  │  Streaming, web fallbacks    ││
│  └───────────────┘  └──────────────────────────────┘│
│  ┌───────────────┐  ┌──────────────────────────────┐│
│  │  context.ts   │  │  Token estimation            ││
│  │  (context     │  │  Summarization               ││
│  │   mgmt)       │  │  Entity relevance scoring    ││
│  └───────────────┘  └──────────────────────────────┘│
│  ┌───────────────┐  ┌──────────────────────────────┐│
│  │ extraction.ts │  │  Domain extraction           ││
│  │  (domain      │  │  Entity extraction           ││
│  │   specific)   │  │  Chat response generation    ││
│  └───────────────┘  └──────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

## API Methods

### `complete(messages, options)`

Non-streaming completion. Returns full response.

```typescript
const result = await complete(
  [{ role: 'user', content: 'Hello' }],
  { system: 'You are helpful.', maxTokens: 1024 }
);

if (isError(result)) {
  console.error(result.error);
} else {
  console.log(result.content);
}
```

### `stream(messages, callbacks, options)`

Streaming completion with delta events.

```typescript
const { streamId, cancel } = stream(
  [{ role: 'user', content: 'Tell me a story' }],
  {
    onDelta: (text) => console.log(text),
    onEnd: () => console.log('Done'),
    onError: (error) => console.error(error),
  },
  { system: 'You are a storyteller.', maxTokens: 2048 }
);

// To cancel early:
cancel();
```

### `extract(prompt, input, schema, options)`

Structured JSON extraction.

```typescript
const result = await extract(
  'Extract all people mentioned',
  userMessage,
  {
    type: 'object',
    properties: {
      people: { type: 'array', items: { type: 'string' } }
    }
  }
);

if (!isError(result)) {
  console.log(result.data.people);
}
```

## Context Window Management

Claude Sonnet 4 has a 200K token context window. Canopy manages this through smart compaction.

### Configuration

```typescript
const MAX_CONTEXT_TOKENS = 150000;    // Hard limit
const TARGET_CONTEXT_TOKENS = 100000; // Compaction trigger
const MIN_RECENT_MESSAGES = 4;        // Always preserved
const SUMMARY_THRESHOLD = 10;         // Min messages to summarize
const CHARS_PER_TOKEN = 4;            // Estimation ratio
```

### Token Estimation

Simple character-based estimation:

```typescript
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
```

### Compaction Flow

```
┌─────────────────────────────────────────────────────┐
│                  prepareContext()                    │
├─────────────────────────────────────────────────────┤
│  1. If messages <= MIN_RECENT_MESSAGES              │
│     → Return all messages                           │
│                                                     │
│  2. Estimate total tokens                           │
│     → If < TARGET_CONTEXT_TOKENS, return with       │
│       optional summary prefix                       │
│                                                     │
│  3. Need compaction:                                │
│     a. Split: older messages | recent messages      │
│     b. Summarize older via Claude                   │
│     c. Return: [summary message] + recent           │
│     d. Mark wasCompacted = true                     │
└─────────────────────────────────────────────────────┘
```

### Summary Storage

Thread summaries persist in the database:

```sql
threads.summary         -- The compacted summary text
threads.summary_up_to   -- Message index where summary ends
```

When resuming a thread:
1. Load summary from database
2. Pass to `buildChatContext()`
3. Only messages after `summary_up_to` are in full context

### Entity Relevance Scoring

When context is limited, entities are scored for relevance:

```typescript
function selectRelevantEntities(query, allEntities, maxEntities = 15) {
  // Score each entity:
  // +100  Direct name mention in query
  // +20   Name contains query word
  // +10   Description contains query word
  // +15   Domain matches query keywords
  // +30   Mentioned in last 24 hours
  // +15   Mentioned in last week
  // +5    Mentioned in last month
}
```

## Ray System Prompt

Ray has a consistent personality defined in `extraction.ts`:

```typescript
const RAY_SYSTEM_PROMPT = `You are Ray, an AI attention coach in Canopy.

Your role is to help the user manage their attention across life domains:
- Work projects and deadlines
- Family commitments
- Training/fitness goals
- Personal projects and health

Voice:
- Warm but direct—you're a coach, not a cheerleader
- Use their language and entity names naturally
- Notice patterns (conflicts, overcommitments, neglected areas)
- Keep responses concise but thoughtful

You have access to their entity graph and recent context.
Use @mentions naturally when referencing their people/projects.`;
```

## Extraction Functions

### Domain Extraction

Used during onboarding to categorize responses:

```typescript
extractDomains(text: string): Promise<{
  domains: Array<{
    name: string;
    type: 'work' | 'family' | 'sport' | 'personal' | 'health';
  }>;
}>
```

### Entity Extraction

Extract people, projects, events from text:

```typescript
extractWorkEntities(text: string): Promise<{
  projects: EntitySuggestion[];
  people: EntitySuggestion[];
  events: EntitySuggestion[];
}>
```

### Document Extraction

Process uploaded files:

```typescript
extractFromDocument(content: string, filename: string): Promise<{
  title: string;
  summary: string;
  entities: EntitySuggestion[];
  keyDates: string[];
  actionItems: string[];
}>
```

## Mock Mode

When running without Electron (browser dev mode) or without an API key, the system falls back to mock responses:

```typescript
const isElectron = typeof window !== 'undefined'
  && window.canopy?.claude !== undefined;

// Graceful degradation
if (!isElectron) {
  return mockResponse();
}
```

This allows UI development without API costs.

## Error Handling

All AI functions return a discriminated union:

```typescript
type AIResponse =
  | { content: string }           // Success
  | { error: string; code: string } // Error

function isError(result): result is AIError {
  return 'error' in result;
}
```

Common error codes:
- `NO_API_KEY` - API key not configured
- `RATE_LIMITED` - Too many requests
- `STREAM_ERROR` - Streaming connection failed
- `PARSE_ERROR` - JSON extraction failed

## Performance Considerations

1. **Streaming** - Chat always streams to reduce perceived latency
2. **Token estimation** - Cheap heuristic avoids expensive tokenization
3. **Incremental summarization** - Only summarize when needed
4. **Entity caching** - Entities loaded once per session
5. **Summary persistence** - Avoid re-summarizing on thread resume
