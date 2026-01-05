# Canopy — Product Specification

> **Version:** 0.3
> **Last Updated:** 6 January 2026
> **Status:** MVP Development

---

## Vision

**Canopy** is a personal AI system that helps you navigate what matters. It's not a note-taking app, not a to-do list, not a chat interface—it's a **living representation of your life** that understands context, remembers what you've told it, and helps you stay oriented.

The name comes from looking up through a forest canopy: light filtering through where there's clarity, dense foliage where things are complex, leaves shimmering where there's activity, gaps of blue sky where there's space to breathe.

---

## Core Philosophy

### 1. Organic Growth (The Bonsai Principle)
**This is the most important principle.**

The temptation with AI systems is to auto-import everything—pipe in data from integrations, auto-extract entities, auto-generate summaries. This creates an overwhelming mess. It's why Rewind felt creepy. It's why Notion workspaces become maintenance nightmares.

A bonsai is beautiful because **every branch was intentionally kept or removed**. Auto-growth creates a bush. Human curation creates art.

**Canopy's rule:**
- AI can **suggest** entities, connections, memories
- AI can **surface** patterns, extractions, summaries
- But nothing becomes permanent until **you confirm it**

The knowledge base grows through hundreds of small human decisions:
- "Yes, Samsung is a client" ✓
- "No, that's not important" ✗
- "Yes, connect Xander to this project" ✓

This creates a system that is **yours**—shaped by your judgment, reflecting your priorities, not an AI's assumptions.

### 2. Unified Surface for Thinking
Your thinking is continuous, but existing tools force artificial boundaries. Canopy provides **one place** where thought flows naturally while intelligence organizes in the background.

### 3. AI as Memory, Not Manager
Canopy doesn't tell you what to do. It remembers what you've told it, notices patterns, and helps you stay aware of what matters—like a thoughtful friend with perfect recall.

### 4. Emergent Organization
You don't manually create folders. The system **proposes** structure based on what you discuss, and you accept, reject, or refine. No maintenance nightmare because you're not the architect—but you are the curator.

### 5. Local-First, Your Data
Everything lives on your machine first. You own it, you control it, you can read it in plain files if you want.

### 6. Data Sovereignty

**Your data, your models, your ownership.**

AI-backlash and big-tech skepticism is real. People understand that AI is powerful, but examples of platform lock-in and monopolistic practices hurting users are plenty. A social media platform has different standards than a knowledge system that becomes central to a digital knowledge worker's life.

Canopy is built for trust:

| Mode | AI Models | Data Storage | Use Case |
|------|-----------|--------------|----------|
| **Cloud** | Claude, Gemini, GPT | Local + optional cloud backup | Tech enthusiasts, convenience-first |
| **Hybrid** | Cloud AI, local data | Strictly local, no cloud | Privacy-conscious, European users |
| **Fully Local** | Ollama, DeepSeek, local LLMs | Local only | Confidential enterprise, air-gapped |

**What this means in practice:**
- **Model choice**: Switch between Claude, Gemini, or local models like DeepSeek/Llama
- **Data location**: Keep everything on your machine, or sync to your own cloud storage
- **No lock-in**: Export everything as human-readable files (markdown, JSON, SQLite)
- **No training on your data**: Your conversations never improve our models
- **Audit trail**: See exactly what data exists and where it goes

Whether you're a US west-coast tech enthusiast, a European privacy-conscious user, or a company running highly confidential internal systems—Canopy adapts to your requirements.

### 7. Contextual Awareness (Digital Wellness)

**The system knows where you are—physically, mentally, temporally.**

By listening to real-world signals, Canopy becomes aware of your state and adapts accordingly. This isn't surveillance—it's attunement.

**Signal sources:**

| Signal | Source | What It Tells Us |
|--------|--------|------------------|
| **Time** | System clock | Morning focus vs. evening wind-down |
| **Location** | GPS/WiFi | Home, office, traveling, gym |
| **Weather** | Weather API | Gray day energy, sunny motivation |
| **Biometrics** | WHOOP, Apple Health | Recovery, sleep quality, strain |
| **Calendar** | Google/Apple Calendar | Busy day, back-to-back meetings, free afternoon |
| **Music** | Spotify/Apple Music | Focus playlist = deep work, lo-fi = creative mode |
| **Screen time** | System APIs | Long day at computer, just woke up |

**How Ray uses this:**

*Morning, well-rested, clear calendar:*
> "Good morning. Recovery is 85%—you've got capacity. The Samsung deadline is Thursday. Want to tackle the hard thinking now?"

*Evening, low recovery, after long meeting day:*
> "It's 7pm and you've been in meetings since 9. Recovery was already low. Maybe not the night for strategic planning—want to just capture quick thoughts?"

*At the gym, between sets:*
> "Quick note while you're here?"

*Gray rainy day, working from home:*
> "Cozy day. Good for deep work or reflection. What's been on your mind?"

*Playing focus music, no meetings:*
> Ray stays quiet. Doesn't interrupt flow state.

**Adaptive behaviors:**

| Context | Ray's Adaptation |
|---------|------------------|
| **Low recovery + big meeting** | "Heads up: board presentation at 2pm, recovery is 45%. Prep notes ready?" |
| **High recovery + free morning** | Surfaces strategic/creative work |
| **Travel/airport** | Quick capture mode, no deep questions |
| **Weekend + family location** | Work topics deprioritized unless urgent |
| **Late night** | Shorter responses, suggests sleep |
| **Flow state detected** | Minimal interruption, queues non-urgent items |

**The key insight:** Most productivity tools treat you as a constant. But you're not—you have rhythms, energy cycles, contexts. Canopy adapts to the human, not the other way around.

**Privacy note:** All signals stay local. Canopy observes your context to serve you better, never to report on you. You control which signals are active.

---

## The Coach: Ray

Ray is Canopy's conversational guide—not a chatbot, but a **thinking partner** with memory.

### Ray's Role
- **Onboarding**: Deep discovery of your life domains (work, family, sport, health, personal)
- **Daily awareness**: Knows what's urgent, what has deadlines, what you're trying to build
- **Proactive guidance**: Surfaces reminders, notices patterns, asks the right questions
- **Contextual responses**: Uses your capacity, your history, your preferences

### Ray's Personality Evolution

Ray isn't static. Over time, Ray develops a distinct character based on your interactions:

**Week 1:** Generic, learning
> "What's on your mind?"

**Month 1:** Knows your patterns
> "Monday morning, low recovery—ease into it?"

**Month 6:** Anticipates your needs
> "Samsung deadline Thursday. You usually prep two days out. Today?"

**Year 1:** Feels like a long-term collaborator
> "This feels like the Berlin situation from last spring. Different context, same pattern. Want to talk through it?"

**How personality develops:**
- **Communication style**: Learns if you prefer direct or gentle, brief or detailed
- **Timing intuition**: Knows when to nudge and when to stay quiet
- **Domain expertise**: Gets smarter about your specific work, sport, family dynamics
- **Pattern memory**: References past situations when relevant (not just facts, but feelings)
- **Humor calibration**: Learns what lands and what doesn't

**Not artificial personality:** Ray doesn't pretend to have feelings or fake enthusiasm. The evolution is in *understanding you better*, not performing character traits.

### Ray's Voice Principles
- **Direct, not verbose**: "Got it." not "Thank you for sharing that with me!"
- **Questioning, not telling**: "Is today the right day for this?" not "You should rest."
- **Grounded in your reality**: References your actual projects, people, priorities

### Capacity Model (Not Prescriptive Wellbeing)
Ray understands that "low recovery" doesn't mean "can't take a call." The capacity model tracks:

| Dimension | What It Affects |
|-----------|-----------------|
| **Physical** | Workouts, physical activity |
| **Cognitive** | Deep work, strategy, creative tasks |
| **Emotional** | Difficult conversations, presentations, conflict |

Ray gives contextual advice:
> "Recovery is 45% today. The Samsung call is fine—that's mental, not physical. But maybe skip the evening ride and recover for tomorrow's pitch."

### Onboarding: Deep Domain Discovery
Not just "what are your life areas?" but a multi-layer exploration:

**For each domain:**
1. **🔥 Fires** — What's urgent? Decisions you're avoiding, conversations you're dreading
2. **📅 Deadlines** — What has a hard date in the next 3 months?
3. **🎯 Strategic** — What are you trying to BUILD? Not projects, but direction
4. **👤 Key People** — Who can make or break these priorities?
5. **🏆 Success Picture** — If this year goes well, what's different?

---

## Visual Canvas (Future Phase)

The canvas is the **spatial thinking** mode—your life as a living, breathing visual.

### The Canopy Metaphor (Literal)
Looking up through your life's canopy:
- **Dense, deep green**: Complex, lots going on
- **Shimmering/moving**: Active, recent activity
- **Sparse, light through**: Space, calm, resolved
- **Golden/warm tones**: Needs attention, aging
- **Dark patches**: Neglected, forgotten
- **Bright clearing**: Fresh start, possibility

### Recency-Based Display
Entities appear based on **when you last interacted**, not static position:
- **Center/bright**: Touched today or yesterday
- **Mid-distance/softer**: This week
- **Edges/dim**: Older, fading into background
- **Gone/archived**: Haven't touched in months

### Zoom-Based Detail Revelation
As you move closer to an entity, layers unfold:

| Distance | What You See |
|----------|--------------|
| **Far** | Glyph + name only |
| **Approaching** | + Status, key info |
| **Closer** | + People, timeline, metrics |
| **Inside** | + Visual references, mood |
| **Deep** | + Documents, conversations, files |

**Focus IS being zoomed into one entity.** The conversation interface appears naturally when you're deep enough inside.

### Photo-Native Entities
People aren't text labels—they're **faces**. When you mention "Celine" or "Xander," they appear as their photo in the canvas.

### Day/Twilight/Dark Modes
Not just light/dark themes, but **ambient time awareness**:
- **Day mode**: Full visibility, productive energy
- **Twilight mode**: Softer, transitional, end-of-day review
- **Dark mode**: Quiet, reflective, night thoughts

### Sound Design (Optional)
- Gentle rustling as baseline
- Specific tones for different regions
- Birdsong for positive states
- Wind picking up when things are busy

---

## Data Model

### Core Entities
Everything in Canopy is an **entity**—a thing in your life that has relationships, history, and meaning.

| Entity Type | Examples | Unique Fields |
|-------------|----------|---------------|
| **Person** | Celine, Xander, Daniel | Photo, role, relationship |
| **Project** | Samsung rebrand, HMR 2026 | Status, deadline, people |
| **Company** | FIELD.IO, Nike, Chanel | Logo, relationship type |
| **Event** | Board meeting, Race day | Date, countdown |
| **Concept** | Distributed leadership | Related ideas |

### Captures

Captures are **moments captured visually**—photos, screenshots, voice notes, quick thoughts. They're the raw material that hasn't yet been organized into entities.

**Visual-first design:**
- Photos and images are primary, not afterthoughts
- Voice notes show as waveforms with transcription
- Screenshots capture context (the app, the moment)
- Quick text appears as handwritten-style notes

**Capture properties:**
```typescript
interface Capture {
  id: string;
  type: 'photo' | 'screenshot' | 'voice' | 'text' | 'file';

  // Visual
  thumbnail: string;          // Always has visual representation
  dominantColor: string;      // For canvas placement

  // Content
  content: string;            // Text or transcription
  media?: MediaAttachment;

  // Context (captured automatically)
  capturedAt: Date;
  location?: Location;
  weather?: Weather;
  activeApp?: string;         // What were you doing

  // AI-extracted (pending confirmation)
  suggestedEntities?: string[];
  suggestedConnections?: string[];
  extractedFacts?: string[];

  // State
  status: 'floating' | 'connected' | 'archived';
  connectedTo?: string[];     // Entity IDs once confirmed
}
```

**In the visual canvas:**
- Captures float in the periphery until connected
- Recent captures are larger, brighter
- Old unconnected captures fade and eventually archive
- Connecting a capture to an entity moves it into that entity's orbit

**The key insight:** Captures are visually rich but informationally light until you confirm their meaning. This keeps the canvas alive with imagery while respecting the bonsai principle.

### Relationships
Entities connect to each other:
- Xander **works on** Samsung
- Samsung **belongs to** FIELD.IO
- HMR **requires** training blocks

Relationship types: `works_on`, `belongs_to`, `related_to`, `depends_on`, `parent_of`, `friend_of`, `married_to`

### Goals vs Focuses

A critical distinction that emerged from development:

**Goals** are concrete, achievable outcomes the user explicitly states.
**Focuses** are interpretive life themes—the underlying concerns that connect multiple goals.

#### Goals

Definition: Explicit things the user wants to achieve.

**Detection signals:**
- "I want to..."
- "I need to..."
- "my goal is..."
- "hoping to..."
- "I'm keen to..."
- "key focus" (ironically, often signals a goal)

**Schema:**
```typescript
interface Goal {
  id: string;
  name: string;
  type: 'goal';
  domain: string;
  priority: 'critical' | 'active' | 'background';
  targetDate?: string;        // When to achieve
  description: string;
  relatedFocuses?: string[];  // Connected to which themes
}
```

**Priority logic** (based on emotional weight in text):
- **critical**: Deeply felt, urgent, mentioned repeatedly
- **active**: Current focus, ongoing effort
- **background**: Nice-to-have, mentioned in passing

**Examples:**
- "Lose Weight" (critical) — mentioned 3 times with emotional weight
- "Have Baby Girl" (critical) — deeply felt desire
- "Better Structure/Control" (active) — recurring theme

#### Focuses

Definition: Interpretive life themes that organize the user's mental model. These are the "pillars" of their life—higher-level than goals.

**Key rule: `needsConfirmation: true` ALWAYS.**
Focuses are interpretive, so Ray must ask the user to confirm before creating them.

**Naming convention:** 2-4 words, thematic
- "Work-Life Balance"
- "Body & Fertility"
- "Structure & Control"
- "Mental Load"
- "Emotional Processing"

**Schema:**
```typescript
interface Focus {
  id: string;
  name: string;
  type: 'focus';
  domain: string;
  priority: 'critical' | 'active' | 'background';
  needsConfirmation: true;    // REQUIRED - always true
  description: string;
  connectedGoals: string[];   // Goals this focus encompasses
}
```

**Why focuses matter:**
- They capture underlying concerns not explicit in goals
- They connect multiple goals under one theme
- They help Ray understand what's *really* going on

**Example: "Body & Fertility" focus**

User mentions separately:
- "I need to lose weight"
- "I've put on weight around the belly"
- "hoping to have a baby girl via IVF"
- "If I'm not pregnant at 43 this won't happen"

These are separate goals, but the focus captures the deeper theme: weight loss is emotionally tied to fertility hopes. Understanding this lets Ray respond with appropriate sensitivity.

#### Extraction Rules

**Anti-hallucination for both:**
- Only extract from EXPLICIT mentions
- Never invent or infer names
- "my goal is to get fit" → extract goal, but don't invent "Fitness Goal 2026"

**Special handling for focuses:**
- Read between the lines for underlying concerns
- But ALWAYS mark `needsConfirmation: true`
- Present to user for validation before creating

#### UI Implications

**Goals:** Can be created directly from extraction (still respecting bonsai principle)

**Focuses:** Must trigger confirmation UI:
```
┌─────────────────────────────────────────────────────┐
│ 💭 Ray noticed a theme...                           │
│                                                     │
│ "Body & Fertility"                                  │
│                                                     │
│ Your weight loss goal seems connected to your       │
│ hopes for another child. Should I track this        │
│ as an important theme in your life?                 │
│                                                     │
│            [Yes, track this]  [No, skip]            │
└─────────────────────────────────────────────────────┘
```

**Visual distinction in canvas:**
- Goals: Solid entities with clear targets
- Focuses: Softer, more diffuse visual treatment (they're "meta" entities)
- Focuses can have multiple goals orbiting them

### Domains
High-level life areas that provide context:
- **Work**: FIELD.IO, clients, projects, team
- **Family**: Partner, kids, parents, home
- **Sport**: Training, races, equipment, fitness
- **Health**: Recovery, sleep, energy, medical
- **Personal**: Side projects, hobbies, learning

### Memories
Extracted facts from conversations that persist:
- "Marcus is training for HMR 2026"
- "FIELD has 45 employees across London and Berlin"
- "Celine's birthday is July 17"

---

## Plugin Architecture

### Integration Categories vs Plugins

**Important distinction:** Categories like "Health & Fitness" are UI groupings, not plugins. Individual data sources (WHOOP, Oura, Strava) are the actual plugins that get registered and synced.

| Category | Individual Plugins | Notes |
|----------|-------------------|-------|
| **Health & Fitness** | WHOOP, Oura, Apple Health | Biometrics, recovery, sleep |
| **Activity & Sport** | Strava, Wahoo, Garmin | Training, workouts (future) |
| **Productivity** | Google (Gmail + Calendar), Notion | Events, tasks, email (future) |
| **Context** | Time, Weather | Always enabled, no auth |

This keeps the architecture clean: each integration is self-contained with its own auth, sync schedule, and signal format.

### Single-Instance vs Multi-Instance Plugins

Some plugins are tied to a single identity (WHOOP tracks your body—you only need one). Others can have multiple accounts connected simultaneously.

| Type                 | Examples                   | Use Case                               |
|----------------------|----------------------------|----------------------------------------|
| **Single-instance**  | WHOOP, Oura, Apple Health  | One identity per person                |
| **Multi-instance**   | Google, Notion             | Multiple accounts (work, personal)     |

**Multi-instance plugins display the connected account:**

- Google: `marcus@field.io` (email from OAuth)
- Notion: `Field Studio Workspace` (workspace name)

Users can connect additional accounts of the same type. Each instance syncs independently and stores its own credentials.

### Signal Plugins (Data IN)
Sync external sources into Canopy:

| Plugin | Data Type | Sync Schedule |
|--------|-----------|---------------|
| **WHOOP** | Recovery, sleep, strain | Smart (30min active, 4hr inactive) |
| **Oura** | Recovery, sleep, readiness | Smart (30min active, 4hr inactive) |
| **Apple Health** | Steps, heart rate, workouts | On app launch |
| **Strava** | Activities, training | On activity complete (future) |
| **Calendar** | Events, meetings | Real-time (future) |

All plugins emit **normalized signals**:
```typescript
interface IntegrationSignal {
  id: string;
  source: 'whoop' | 'strava' | 'basecamp';
  type: 'recovery' | 'activity' | 'task_completed';
  timestamp: Date;
  domain: string;
  data: Record<string, any>;
  capacityImpact?: CapacityImpact;
}
```

### Reference Plugins (Search ON DEMAND)
Don't bulk import—search when relevant:

| Plugin | Use Case |
|--------|----------|
| **Notion** | Search your workspace when discussing strategy |
| **Apple Notes** | Find old thoughts when you mention "my notes" |

Ray decides when to search:
- Explicit: "my notes", "I wrote", "we discussed"
- Contextual: Strategic topics + project entities

**This avoids importing an overwhelming amount of data** while still giving Ray access to your historical thinking.

---

## Digital Persona

Canopy can learn from your **public presence** without you having to re-explain yourself:

| Platform | What Ray Learns | Scope |
|----------|-----------------|-------|
| **Instagram** | Visual life, recent moments | Personal (background) |
| **Strava** | Training focus, patterns | Personal (contextual) |
| **LinkedIn** | Professional narrative | Work (active) |
| **Personal site** | Bio, how you present yourself | Personal (contextual) |
| **Company site** | What FIELD does, clients | Work (active) |

### Privacy Levels
- **Background**: Ray knows but won't mention unless you bring it up
- **Contextual**: Ray can reference if relevant to conversation
- **Active**: Ray can proactively bring up in appropriate context

### Refresh Schedule
Daily sync of public profiles to stay current.

---

## Technical Architecture

### Stack
- **Frontend**: SvelteKit
- **Backend**: Electron + Node.js
- **Database**: SQLite (better-sqlite3)
- **AI**: Pluggable — Claude, Gemini, OpenAI, or local (Ollama/DeepSeek)

### Why This Stack?
- **Node ports to server**: Same codebase can become a web service later
- **SQLite is portable**: Human-readable, easy to backup, no server needed
- **Electron works offline**: Local-first, your data on your machine
- **Model abstraction**: Swap AI providers without changing application code

### AI Provider Architecture
```typescript
interface AIProvider {
  id: string;
  name: string;
  type: 'cloud' | 'local';

  // Core capabilities
  chat: (messages: Message[], options?: ChatOptions) => Promise<Response>;
  extract: (content: string, schema: Schema) => Promise<Extracted>;
  embed?: (text: string) => Promise<number[]>;

  // Provider-specific
  requiresApiKey: boolean;
  supportsStreaming: boolean;
  maxContextLength: number;
}

// Implementations
const providers = {
  claude: CloudProvider({ model: 'claude-sonnet-4-20250514' }),
  gemini: CloudProvider({ model: 'gemini-pro' }),
  openai: CloudProvider({ model: 'gpt-4' }),
  ollama: LocalProvider({ endpoint: 'http://localhost:11434' }),
  deepseek: LocalProvider({ model: 'deepseek-coder' }),
};
```

### Data Privacy Modes

**Mode 1: Full Cloud** (default for convenience)
```
User ←→ Canopy ←→ Claude API
              ↓
         Local SQLite (your machine)
         Optional: iCloud/Dropbox backup
```

**Mode 2: Hybrid** (cloud AI, local data)
```
User ←→ Canopy ←→ Claude API (conversations only)
              ↓
         Local SQLite (never leaves machine)
         No cloud backup
```

**Mode 3: Fully Local** (air-gapped capable)
```
User ←→ Canopy ←→ Ollama (localhost)
              ↓
         Local SQLite
         No network required
```

### File Storage
```
~/.canopy/
├── config.json       # Plugin states, preferences
├── secrets.json      # API tokens (0600 permissions)
└── uploads/          # Dropped files

~/Library/Application Support/Canopy/
└── canopy.db         # SQLite database
```

### Database Schema (Core Tables)

```sql
-- Entities
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  domain TEXT,
  description TEXT,
  photo_url TEXT,
  metadata JSON,
  last_mentioned DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Relationships
CREATE TABLE relationships (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  strength REAL DEFAULT 0.5,
  metadata JSON,
  FOREIGN KEY (source_id) REFERENCES entities(id),
  FOREIGN KEY (target_id) REFERENCES entities(id)
);

-- Memories
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source TEXT,
  entity_ids JSON,
  importance TEXT DEFAULT 'normal',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Signals (from integrations)
CREATE TABLE signals (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  domain TEXT,
  entity_ids JSON,
  data JSON NOT NULL,
  capacity_impact JSON
);

-- Plugin State
CREATE TABLE plugin_state (
  plugin_id TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT FALSE,
  connected BOOLEAN DEFAULT FALSE,
  last_sync DATETIME,
  settings JSON
);
```

---

## Market Position

### What Canopy Is
- Personal Claude with memory
- Emergent organization (AI proposes, you confirm)
- Life awareness system (not productivity tool)
- Local-first, your data

### What Canopy Is NOT
- Another Notion (no manual hierarchy building)
- A to-do app (not about checking boxes)
- A calendar replacement (not scheduling)
- A social product (private, personal)

---

## Competitive Positioning

### The Landscape (2026)

The personal AI/memory space is heating up. Key players:

| Product | Approach | Strength | Weakness |
|---------|----------|----------|----------|
| **Pickle OS** | Hardware + always-on capture | Automatic, comprehensive | Creepy, overwhelming, $800+ glasses |
| **Rewind** | Screen recording | Total recall | Privacy nightmare, too much data |
| **Mem** | AI-powered notes | Good writing assistance | Text-heavy, no visual thinking |
| **Notion AI** | AI layer on existing tool | Familiar, powerful structure | Manual maintenance, not personal |
| **Granola** | Meeting transcription | Excellent at one thing | Meeting-only, no life context |
| **Apple Intelligence** | OS-level integration | Seamless, trusted | Shallow, no real memory |

### Canopy's Position

**"The personal knowledge system that grows like a bonsai, not a weed."**

We sit between two extremes:
- **Too automatic** (Pickle, Rewind): Captures everything, overwhelms you
- **Too manual** (Notion, Obsidian): You build everything, maintenance nightmare

Canopy is **AI-assisted, human-curated**. The system proposes, you confirm. Nothing enters your knowledge base without your intent.

### vs. Pickle OS (Direct Competitor)

Pickle is the closest competitor in vision. Key differences:

| Dimension | Pickle | Canopy |
|-----------|--------|--------|
| **Hardware** | Requires $800+ AR glasses | Software-only, any device |
| **Capture** | Always-on (sees/hears everything) | Opt-in (you choose what enters) |
| **Growth** | Automatic organization | Human-confirmed (bonsai principle) |
| **Privacy** | Cloud-processed in enclaves | Local-first, or fully offline |
| **Model** | Their infrastructure only | Your choice (Claude, Gemini, Ollama) |
| **Cost** | $800 hardware + subscription | Software subscription only |
| **Creep factor** | High (constant recording) | Low (you control every entry) |

**Our narrative against Pickle:**
> "Pickle wants to record your entire life and organize it for you. Canopy helps you cultivate what actually matters. One gives you a haystack. The other helps you collect needles."

### vs. Notion + AI

Notion is the incumbent for knowledge workers. Our differentiation:

| Dimension | Notion | Canopy |
|-----------|--------|--------|
| **Organization** | You build the structure | AI proposes, you confirm |
| **Maintenance** | High (your hierarchy rots) | Low (emergent, living) |
| **Context** | None (just documents) | Full (biometrics, calendar, weather) |
| **Visual** | Pages and databases | Spatial canvas, memory bubbles |
| **Personal** | Also for teams | Personal-first |

**Our narrative against Notion:**
> "Notion is where knowledge goes to be organized. Canopy is where knowledge comes alive."

### vs. Rewind

Rewind tried the "record everything" approach and faced backlash.

| Dimension | Rewind | Canopy |
|-----------|--------|--------|
| **Capture** | Screen recording (everything) | Intentional entry only |
| **Privacy** | Local but comprehensive | Local and selective |
| **Usefulness** | Hard to find anything | Curated, searchable |
| **Feeling** | Surveillance | Partnership |

**Our narrative against Rewind:**
> "Rewind watches you. Canopy listens to you. There's a difference."

### The Canopy Difference: Three Pillars

**1. Bonsai, Not Jungle**
Every piece of knowledge is intentionally kept or pruned. Your knowledge base reflects your judgment, not an algorithm's assumptions.

**2. Context-Aware, Not Context-Capturing**
We don't record your life. We understand your state (recovery, calendar, weather, music) and adapt accordingly. Awareness without surveillance.

**3. Your Infrastructure, Your Choice**
Run on Claude, Gemini, or fully local with Ollama. Keep data on your machine or sync to your cloud. No vendor lock-in, no forced trust.

### Target Users (vs. Competitors)

| User Type | Why Not Pickle | Why Not Notion | Why Canopy |
|-----------|----------------|----------------|------------|
| **Privacy-conscious professional** | Always-on recording | Cloud-dependent | Local-first, selective |
| **Overwhelmed founder** | Too much data | Too much maintenance | Emergent organization |
| **Creative knowledge worker** | No visual thinking | Rigid structure | Spatial canvas |
| **European enterprise** | US cloud processing | GDPR concerns | Fully local option |
| **Multi-domain life** | Work-focused | No life context | Domains + contextual awareness |

### Long-Term Moat

1. **Curated data is more valuable than comprehensive data**
   - A bonsai collection of confirmed insights beats a forest of unprocessed captures
   - Our users' knowledge bases get better over time, not just bigger

2. **Trust through transparency**
   - Model choice, data location choice, export anytime
   - Once you trust Canopy with your thinking, switching cost is high

3. **Team expansion path**
   - Personal Canopy → Team Canopy (shared knowledge base)
   - Pickle can't do this without everyone wearing glasses

4. **Platform independence**
   - No hardware dependency
   - Works across all devices, all operating systems
   - Survives regardless of who wins AR hardware wars

### Competitive Landscape

| Product | Strength | Weakness | Canopy Difference |
|---------|----------|----------|-------------------|
| **Granola** | Meeting notes, AI transcription | Meeting-specific only | Full life context |
| **Mem** | AI-powered notes | Text-heavy, no visual | Visual canvas, domains |
| **Rewind** | Screen recording memory | Creepy, privacy concerns | You control what enters |
| **Notion** | Flexible structure | Manual maintenance | Emergent organization |
| **Apple Notes** | Simple, fast | No intelligence | AI-powered memory |

### Target User
- **Knowledge workers** with complex, multi-domain lives
- **Founders/CEOs** juggling business + family + personal goals
- **Creative professionals** collecting inspiration across contexts
- **Athletes** balancing training with demanding careers

---

## Implementation Phases

### Phase 1: Foundation ✓ (Current)
- [x] Electron + SvelteKit scaffold
- [x] SQLite database with core schema
- [x] Ray coach with conversational onboarding
- [x] Deep domain discovery (fires → deadlines → strategic)
- [x] Plugin architecture (signal + reference)
- [x] WHOOP integration ready
- [x] Notion/Notes reference plugins ready
- [x] Digital persona system
- [x] File upload + entity extraction

### Phase 2: Intelligence
- [ ] Claude API integration for extraction
- [ ] Memory system (fact extraction from conversations)
- [ ] Pattern recognition (Ray notices trends)
- [ ] Capacity calculation from WHOOP data
- [ ] Reference search integration with Ray
- [ ] Ray personality evolution over time

### Phase 3: Visual Canvas
- [ ] Ambient home screen with canopy metaphor
- [ ] Memory bubbles (visual captures)
- [ ] Recency-based entity positioning
- [ ] Zoom-based detail revelation
- [ ] Photo-native people entities
- [ ] Day/twilight/dark modes

### Phase 4: Polish & Mobile
- [ ] Sound design
- [ ] Animations and transitions
- [ ] Mobile companion (iPhone) — **Ray-only, quick capture**
- [ ] Voice input
- [ ] Sharing/export

### Phase 5: Team Canopy 💰
- [ ] Shared knowledge bases
- [ ] Team domains (company projects, shared context)
- [ ] Permission layers (who sees what)
- [ ] Collaborative confirmation (team agrees on entities)
- [ ] Cross-pollination (personal ↔ team knowledge)

---

## Long-Term Vision: Your Life's Knowledge Base

Canopy isn't a note-taking app you use for a year and abandon. It's designed to be **the place where your thinking accumulates over decades**.

### The Compound Effect

| Time | What Accumulates | Value |
|------|------------------|-------|
| **Week 1** | Initial domains, key people | Basic context |
| **Month 1** | Patterns emerge, preferences learned | Ray gets useful |
| **Month 6** | Hundreds of confirmed entities, rich connections | Real knowledge graph |
| **Year 1** | Deep history, Ray knows your patterns | Irreplaceable assistant |
| **Year 3** | Cross-references years of thinking | Strategic advisor |
| **Year 10** | Life's work documented, searchable | Legacy system |

### Why This Matters

Most productivity tools are **transactional**—you use them, you leave them. Canopy is **cumulative**—every confirmed entity, every connection, every memory bubble adds permanent value.

**The 6-year promise** (like Pickle, but better):
- Retrieve context from years ago
- But only the context *you* confirmed as valuable
- Not a haystack of recordings—a curated collection of insights

### The Trust Equation

For users to commit long-term, they need:

1. **Data portability**: Export everything, anytime, human-readable
2. **Model independence**: Not locked to one AI provider
3. **Local-first**: Data survives even if company doesn't
4. **Privacy guarantees**: Your most sensitive thinking, protected

We provide all four. This is the foundation for multi-year relationships.

### Team Canopy: The Business Model

**Personal Canopy** → Individual subscription ($X/month)

**Team Canopy** → Per-seat pricing ($Y/seat/month)
- Shared company knowledge base
- Personal + team domains
- "What does our company know about Samsung?" across all team members
- Onboarding new employees with accumulated context
- No more "institutional knowledge walking out the door"

**Enterprise Canopy** → Custom pricing
- Fully local deployment (air-gapped)
- Custom model integration
- SSO, compliance, audit trails
- Dedicated support

The path: **Personal adoption → Team adoption → Enterprise deals**

Users fall in love with personal Canopy, then want it for their teams.

---

## Go-to-Market

### Geography
**EU + US first, then global.** Launch in markets where privacy-conscious knowledge workers concentrate. The product's data sovereignty principles (local-first, model choice, privacy modes) resonate strongly with European GDPR sensibilities and US tech early adopters. Expand globally as product matures.

### Audience Progression

**Phase 1: Individuals (B2C)**
- Knowledge workers with complex, multi-domain lives
- Founders/CEOs juggling business + family + personal
- Creative professionals collecting inspiration
- Athletes balancing training with demanding careers

**Phase 2: Teams (B2B)**
- Small teams who discovered Canopy individually
- "We all use this—can we share a knowledge base?"
- Bottom-up adoption, not top-down sales

**Phase 3: Enterprise**
- Companies needing air-gapped deployment
- Compliance-driven organizations
- Custom integrations, dedicated support

### Pricing Model

**Subscription-based** (not freemium)
- Free trial period to experience value
- Individual subscription for personal use
- Per-seat pricing for teams
- Custom enterprise deals for large deployments

*Rationale:* Freemium attracts users who don't value the product. A knowledge system that becomes central to your life deserves commitment from both sides.

### Primary Differentiators

**The Human-First Approach**

In a market racing toward "capture everything" and "AI knows best," Canopy takes the opposite stance:

1. **Bonsai Curation**
   > Your knowledge base grows through intentional human decisions, not algorithmic assumptions. Every branch kept or pruned by you.

2. **Wellness Mindset**
   > The system adapts to your physical and mental state. Low recovery? Different conversation. Flow state? Stay quiet. Technology that respects human rhythms.

3. **Data Sovereignty**
   > Your data, your models, your ownership. Run fully local, choose your AI provider, export anytime. No lock-in, no forced trust.

**The Core Insight:**
> In an age of infinite AI-generated content and always-on capture, **attention is the scarcest resource**. Canopy protects your attention by surfacing only what you've confirmed matters, adapting to when you have capacity, and never overwhelming you with algorithmic noise.

**Positioning statement:**
> "Canopy is the personal AI that grows with your judgment, not despite it. While others race to record everything, we help you remember what matters."

---

## Open Questions

1. **Canvas complexity**: How much visual fidelity before it becomes distracting?
2. **Privacy boundaries**: How explicit should Ray be about what it knows vs. doesn't mention?
3. **Sync vs. reference**: Which data sources should auto-sync vs. search-on-demand?
4. **Collaboration**: Should Canopy ever support shared entities (e.g., family calendar)?

### Decided (For Now)

**Mobile strategy:** Ray-only for mobile. The visual canvas is a desktop experience—spatial thinking needs screen real estate. Mobile is for quick captures and Ray conversations on the go. The canvas syncs, but you view/edit it on desktop.

**Multi-device sync:** Defer complex conflict resolution. For MVP, last-write-wins with timestamp. Future consideration: git-style merge for conflicts, showing user what changed. Local-first with simple sync is better than complex sync that breaks.

---

## Confirmation Patterns (Organic Growth in Practice)

The bonsai principle requires thoughtful UI for human confirmation. Here's how it plays out:

### During Conversation
When Ray detects a potential entity or fact:

```
YOU: Had a great call with Sarah from Nike today about the Rise refresh.

RAY: Good to hear.

     [New: Sarah (Nike) — Add to contacts?  ✓  ✗]
     [Memory: Nike Rise refresh discussion — Keep?  ✓  ✗]
```

Small inline confirmations. Not blocking. You can ignore them and they fade.

### After File Upload
When you drop a document:

```
┌─────────────────────────────────────────────┐
│ 📄 Samsung_Brief_v3.pdf                     │
│                                             │
│ Detected:                                   │
│ ┌─────────────────────────────────────────┐ │
│ │ ◆ Samsung One UI Rebrand               │ │
│ │   Project • £650K • Mar-Jul 2026       │ │
│ │                          [Add] [Skip]  │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ 👤 Daniel Kim                          │ │
│ │   Design Lead, Samsung                 │ │
│ │                          [Add] [Skip]  │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ 📅 Kickoff: March 15, 2026             │ │
│ │                          [Add] [Skip]  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│              [Add All]  [Skip All]          │
└─────────────────────────────────────────────┘
```

### From Integrations
WHOOP data flows in automatically (it's your biometrics, not entities). But when Ray notices a pattern:

```
RAY: I've noticed your recovery drops every Monday.

     [Pattern: Monday recovery dip — Track this?  ✓  ✗]
```

### From Reference Search
When Ray searches Notion and finds something:

```
RAY: Found a related note from October.

     ┌──────────────────────────────────────┐
     │ 📝 "Samsung Strategy Thoughts"       │
     │ Oct 15, 2025 • Notion                │
     │                                      │
     │ "The key insight is that One UI      │
     │ needs to feel more human, less..."   │
     │                                      │
     │ [Pin to Samsung project]  [Just ref] │
     └──────────────────────────────────────┘
```

"Pin" creates a permanent link. "Just ref" means Ray showed it but it doesn't become part of the knowledge base.

### The Staging Area
For bulk operations (like initial onboarding), a dedicated space:

```
┌─────────────────────────────────────────────────────────┐
│ 🌱 Pending                                    12 items  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Suggested from your conversations:                      │
│                                                         │
│ [✓] Samsung One UI — Project                           │
│ [✓] Daniel Kim — Person (Samsung)                      │
│ [ ] "fluid design" — Concept                           │
│ [✓] HMR 2026 — Event (Oct 18)                          │
│ [ ] Rainer — Person (friend? family?)                  │
│ ...                                                     │
│                                                         │
│ [Confirm Selected (4)]        [Review One by One]      │
└─────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Never auto-add**: Everything waits for confirmation
2. **Low friction to confirm**: Single tap/click, inline when possible
3. **Easy to ignore**: Unconfirmed suggestions fade, don't nag
4. **Batch when appropriate**: Staging area for bulk review
5. **Reversible**: Confirmed items can always be removed later

---

## Design Principles

### 1. Soft UI
Not sharp edges and bright colors. Canopy should feel:
- **Calm**: Low contrast, gentle gradients
- **Organic**: Rounded shapes, natural metaphors
- **Breathing**: Subtle animations that suggest life
- **Warm**: Human, not clinical

### 2. Density Without Overwhelm
Show a lot of information, but **reveal progressively**:
- Start with the essential (name, status)
- Unfold on hover/approach
- Full detail only when focused

### 3. Time as Organizing Principle
Recency matters more than category:
- What you touched today is front and center
- Old things fade but don't disappear
- Nothing is truly deleted, just archived

### 4. Conversation Over Commands
You don't click buttons to do things. You **talk to Ray**:
- "Remind me about Samsung next week"
- "What's urgent right now?"
- "Show me everything related to HMR"

---

## Summary

Canopy is **Claude with visual memory of your life**. It combines:
- 🧠 **Ray**: A coach that knows your context
- 🌳 **Canvas**: A living visual representation
- 🔌 **Plugins**: Connections to your data
- 💾 **Local-first**: Your data, your control

The goal is not productivity. The goal is **awareness**—knowing what matters, where things stand, and what deserves your attention right now.

---

*"Looking up through the canopy, light filters where there's clarity, dense where there's complexity, shimmering where there's life."*
