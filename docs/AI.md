# AI System

> The heart of Canopy: extraction, memory, and context management.

## Overview

Canopy uses Claude (Anthropic) as its AI backbone. The AI powers:

1. **Ray** - The attention coach personality
2. **Entity extraction** - NER from conversations and documents
3. **Memory generation** - Long-term pattern recognition
4. **Context management** - Smart conversation compaction
5. **Document processing** - Two-stage extraction pipeline

## Architecture

```
src/lib/ai/
├── index.ts          # Provider abstraction (complete, stream, extract)
├── provider.ts       # Provider interface & registry
├── providers/
│   └── claude.ts     # Claude-specific implementation
├── context.ts        # Context window management & summarization
├── extraction.ts     # Entity extraction & onboarding (THE HEART)
└── memory.ts         # Memory formatting utilities
```

---

## Two-Stage Extraction Architecture

When processing comprehensive documents (onboarding, uploads), Canopy uses a two-stage pipeline to maximize context utilization:

### Stage 1: Document Extraction

**Function:** `extractFromOnboardingDocument(content, filename)`

Processes the **full document** without truncation using the complete context window.

```typescript
interface OnboardingDocumentExtraction {
  summary: string;                    // 2-3 sentence user summary
  domains: Array<{
    type: 'work' | 'family' | 'sport' | 'personal' | 'health';
    description?: string;
  }>;
  entities: Array<{
    name: string;
    type: 'person' | 'project' | 'company' | 'event' | 'goal' | 'focus';
    domain: string;
    description?: string;
    relationship?: string;            // For people: wife, son, colleague
    priority?: 'critical' | 'active' | 'background';
    date?: string;                    // For events
    needsConfirmation?: boolean;      // For interpretive entities
  }>;
  topicsNotCovered?: string[];        // Gaps to explore in conversation
}
```

**Extraction Rules:**
- People: Everyone mentioned with relationship
- Domains: Which life areas are covered
- Goals: Explicit desires ("I want to...", "I need to...")
- Focuses: Interpretive themes (ALWAYS `needsConfirmation=true`)
- Events: Birthdays, anniversaries, deadlines
- Gaps: What's missing that conversation should explore

### Stage 2: Conversational Response

**Function:** `generateOnboardingResponse(context)`

Receives the **structured extraction** (small) rather than raw document (large).

```typescript
// Context includes pre-extracted data
const context: OnboardingContext = {
  messages: [...],
  collected: { domains, entities, urls, integrations },
  documentExtraction: stage1Result,  // Structured, not raw
  availableIntegrations: [...],
};
```

The prompt receives:
```
DOCUMENT PROVIDED - Pre-extracted summary:
"Celine is a 42-year-old mother focused on family, fitness, and fertility..."

Life domains covered: family, health, work

Entities extracted:
  - Marcus (person, family) - husband: Runs his own company
  - Rafael (person, family) - son: Born 02/02/2020
  ...

Topics NOT covered: fitness specifics, work details
```

**Benefits:**
- Full document context utilized in Stage 1
- Compact structured data in Stage 2
- AI knows what's covered vs. what to explore
- No repeated extraction of same entities

---

## Entity Types

### Standard Entities

| Type | Domain | Example |
|------|--------|---------|
| `person` | any | Marcus (husband), Sarah (colleague) |
| `project` | work/personal | Canopy, House Renovation |
| `company` | work | FIELD.IO, Client X |
| `event` | any | Rafael's Birthday, Hellenic Mountain Race |

### Special Entity Types

**Goals** - Things the user wants to achieve
```typescript
{
  name: "Lose Weight",
  type: "goal",
  domain: "health",
  priority: "critical",        // Based on emotional weight
  targetDate: "May 2026",      // When to achieve
  description: "Need to lose weight for health and fertility"
}
```

**Focuses** - Interpretive life themes (ALWAYS need confirmation)
```typescript
{
  name: "Body & Fertility",
  type: "focus",
  domain: "health",
  priority: "critical",
  needsConfirmation: true,     // REQUIRED for focuses
  description: "Weight loss tied to hopes for another child (girl)"
}
```

Good focus names: 2-4 words, thematic
- "Work-Life Balance"
- "Structure & Control"
- "Mental Load"
- "Emotional Processing"

---

## Anti-Hallucination Rules

Critical extraction rules to prevent AI fabrication:

```typescript
// From ONBOARDING_RESPONSE_SCHEMA
CRITICAL ANTI-HALLUCINATION RULES:
1. ONLY extract entities that are EXPLICITLY mentioned in the user's message
2. NEVER infer, assume, or "fill in" entities that weren't stated
3. If the user says "my wife" without a name, extract NOTHING
4. Generic terms are NOT entities unless the user gives them a specific name
5. When in doubt, extract NOTHING rather than guess

DANGEROUS PATTERNS TO AVOID:
- User: "I work at a startup" → DON'T extract "Startup Inc." as a company
- User: "my wife" → DON'T guess her name
- User: "my kids" → DON'T invent children entities
- User: "a project I'm working on" → DON'T create "Project X"
```

**Confidence Scoring:**
- Explicit names with context → High confidence
- Partial information → `needsConfirmation: true`
- Generic mentions → Do not extract

---

## Memory System

### Memory Generation

Memories are extracted from conversations to build long-term understanding:

```typescript
interface Memory {
  id: string;
  content: string;           // The fact or pattern
  source_type: 'thread' | 'capture' | 'upload';
  source_id: string;
  entities: string[];        // Related entity IDs
  importance: number;        // 0-1, affects retrieval
  tags: string[];
  created_at: Date;
  expires_at?: Date;         // For time-sensitive memories
}
```

### Memory Extraction Schema

```typescript
const MEMORY_EXTRACTION_SCHEMA = {
  facts: [{
    content: string,         // The fact to remember
    entities: string[],      // Entity names mentioned
    importance: number,      // 0-1 based on emotional weight
    type: 'fact' | 'preference' | 'goal' | 'relationship'
  }]
};
```

### Pattern Memory

User-confirmed patterns from cross-domain conversations:

```typescript
// When user clicks "Yes, remember this pattern"
await createMemory(
  "Pattern: Work-family interplay - tracking how these domains interact",
  'thread',
  threadId,
  entityIds,
  0.8  // High importance for user-confirmed patterns
);
```

---

## Context Window Management

Claude Sonnet 4 has a 200K token context window. Canopy manages this through smart compaction.

### Configuration

```typescript
const MAX_CONTEXT_TOKENS = 150000;    // Hard limit
const TARGET_CONTEXT_TOKENS = 100000; // Compaction trigger
const MIN_RECENT_MESSAGES = 4;        // Always preserved
const CHARS_PER_TOKEN = 4;            // Estimation ratio
```

### Compaction Flow

```
1. Estimate total token count
2. If under TARGET_CONTEXT_TOKENS → use full history
3. If over threshold:
   a. Keep last 4 messages intact
   b. Summarize older messages via Claude
   c. Store summary in thread.summary
4. On resume, load summary from database
```

### Summary Storage

```sql
threads.summary         -- Compacted summary text
threads.summary_up_to   -- Message index where summary ends
```

---

## API Methods

### `complete(messages, options)`

Non-streaming completion:

```typescript
const result = await complete(
  [{ role: 'user', content: 'Hello' }],
  { system: 'You are helpful.', maxTokens: 1024 }
);
```

### `stream(messages, callbacks, options)`

Streaming with deltas:

```typescript
const { cancel } = stream(
  messages,
  {
    onDelta: (text) => appendToResponse(text),
    onEnd: () => saveMessage(),
    onError: (err) => showError(err),
  },
  { system: raySystemPrompt }
);
```

### `extract<T>(prompt, input, schema, options)`

Structured JSON extraction:

```typescript
const result = await extract<OnboardingResponse>(
  prompt,           // System instructions
  userMessage,      // Content to extract from
  RESPONSE_SCHEMA,  // JSON schema
  { temperature: 0.5 }
);
```

---

## Ray System Prompt

Ray's personality is defined in extraction functions:

```typescript
const rayPrompt = `You are Ray, a personal coach AI in Canopy.

YOUR GOAL: Understand the user's life context to be a useful coach.

Voice:
- Warm but direct—coach, not cheerleader
- Use their names naturally (Marcus, Celine, Rafael)
- Notice patterns (conflicts, overcommitments, neglected areas)
- Concise but thoughtful responses

Context:
- You have access to their entity graph
- Use @mentions for their people/projects
- Remember what they've already told you
`;
```

---

## Error Handling

All AI functions return discriminated unions:

```typescript
type AIResult<T> =
  | { data: T }
  | { error: string; code: string }

function isError(result): result is AIError {
  return 'error' in result;
}
```

**Error Codes:**
- `NO_API_KEY` - API key not configured
- `NOT_ELECTRON` - Running in browser without Electron
- `RATE_LIMITED` - 429 from API
- `PARSE_ERROR` - JSON extraction failed
- `NETWORK_ERROR` - Connection failed

**Fallback Behavior:**

```typescript
if (isError(result)) {
  console.error('Extraction failed:', result.error, 'code:', result.code);
  return fallbackResponse;
}
```

---

## File Reference

| File | Purpose |
|------|---------|
| `extraction.ts:169-226` | `extractFromOnboardingDocument` - Stage 1 |
| `extraction.ts:778-921` | `generateOnboardingResponse` - Stage 2 |
| `extraction.ts:101-162` | `OnboardingDocumentExtraction` schema |
| `context.ts` | Token estimation & summarization |
| `memory.ts` | Memory formatting for context |

---

## Testing Checklist

- [ ] Upload comprehensive document → extracts all entities
- [ ] Paste document text → same extraction
- [ ] Generic mentions ("my wife") → no entity created
- [ ] Focus extraction → always has `needsConfirmation: true`
- [ ] Birthday dates → creates recurring events
- [ ] Goals with dates → captures `targetDate`
- [ ] Large documents → no truncation in Stage 1
- [ ] Stage 2 prompt → compact, structured format
