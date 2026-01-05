# Canopy — Product Specification

> **Version:** 1.0  
> **Last Updated:** January 2026  
> **Status:** MVP Development

---

## Vision

**Canopy** is a personal AI system that helps you navigate what matters. It's not a note-taking app, not a to-do list, not a chat interface—it's a **living representation of your life** that understands context, remembers what you've told it, and helps you stay oriented.

The name comes from looking up through a forest canopy: light filtering through where there's clarity, dense foliage where things are complex, leaves shimmering where there's activity, gaps of blue sky where there's space to breathe.

---

## Core Philosophy

### 1. Unified Surface for Thinking
Your thinking is continuous, but existing tools force artificial boundaries. Canopy provides **one place** where thought flows naturally while intelligence organizes in the background.

### 2. AI as Memory, Not Manager
Canopy doesn't tell you what to do. It remembers what you've told it, notices patterns, and helps you stay aware of what matters—like a thoughtful friend with perfect recall.

### 3. Emergent Organization
You don't manually create folders. The system proposes structure based on what you discuss, and you accept, reject, or refine. **No maintenance nightmare** because you're not the architect.

### 4. Local-First, Your Data
Everything lives on your machine first. You own it, you control it, you can read it in plain files if you want.

---

## The Coach: Ray

Ray is Canopy's conversational guide—not a chatbot, but a **thinking partner** with memory.

### Ray's Role
- **Onboarding**: Deep discovery of your life domains (work, family, sport, health, personal)
- **Daily awareness**: Knows what's urgent, what has deadlines, what you're trying to build
- **Proactive guidance**: Surfaces reminders, notices patterns, asks the right questions
- **Contextual responses**: Uses your capacity, your history, your preferences

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

### Relationships
Entities connect to each other:
- Xander **works on** Samsung
- Samsung **belongs to** FIELD.IO
- HMR **requires** training blocks

Relationship types: `works_on`, `belongs_to`, `related_to`, `depends_on`, `parent_of`, `friend_of`, `married_to`

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

### Captures
Quick thoughts, images, voice notes—fragments that haven't been organized yet.

---

## Plugin Architecture

### Signal Plugins (Data IN)
Sync external sources into Canopy:

| Plugin | Data Type | Sync Schedule |
|--------|-----------|---------------|
| **WHOOP** | Recovery, sleep, strain | Smart (30min active, 4hr inactive) |
| **Strava** | Activities, training | On activity complete |
| **Calendar** | Events, meetings | Real-time |
| **Basecamp** | Tasks, projects | Hourly |

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
- **AI**: Claude API

### Why This Stack?
- **Node ports to server**: Same codebase can become a web service later
- **SQLite is portable**: Human-readable, easy to backup, no server needed
- **Electron works offline**: Local-first, your data on your machine

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

### Phase 3: Visual Canvas
- [ ] Ambient home screen with canopy metaphor
- [ ] Recency-based entity positioning
- [ ] Zoom-based detail revelation
- [ ] Photo-native people entities
- [ ] Day/twilight/dark modes

### Phase 4: Polish
- [ ] Sound design
- [ ] Animations and transitions
- [ ] Mobile companion (iPhone)
- [ ] Voice input
- [ ] Sharing/export

---

## Open Questions

1. **Canvas complexity**: How much visual fidelity before it becomes distracting?
2. **Privacy boundaries**: How explicit should Ray be about what it knows vs. doesn't mention?
3. **Sync vs. reference**: Which data sources should auto-sync vs. search-on-demand?
4. **Multi-device**: How to handle iPhone companion app?
5. **Collaboration**: Should Canopy ever support shared entities (e.g., family calendar)?

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
