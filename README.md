# Canopy

> An attention system that knows your life and tells you where to focus.

Canopy is a personal AI-powered knowledge system with **Ray**, your attention coach who:
- **Onboards you** through conversation, not forms
- **Remembers** your projects, people, and priorities
- **Guides** your focus through intelligent nudges and pattern recognition

## Quick Start

```bash
# Install dependencies
npm install

# Run in browser (for development)
npm run dev

# Run as Electron app
npm run electron:dev
```

### Configure Claude API

1. Get an API key from [console.anthropic.com](https://console.anthropic.com/settings/keys)
2. Launch the app and go to Settings
3. Enter your API key in the AI section

## Meet Ray

Ray is your attention coach. On first launch, Ray guides you through a conversational onboarding:

```
RAY: Let's start simple. What are the main areas of your
     life that take your attention?

YOU: Work at FIELD, family with Celine and the kids,
     training for ultra-distance racing...

RAY: Got it. 4 domains. Within FIELD—what's actively
     taking your attention right now?
```

In ~5 minutes, Ray understands your life structure and can actually help.

## Architecture

```
┌─────────────────────────────────────────┐
│           Electron Main Process         │
│  - SQLite database (better-sqlite3)     │
│  - Claude API handlers                  │
│  - Secrets management                   │
├─────────────────────────────────────────┤
│           SvelteKit Frontend            │
│  - Onboarding (Ray conversation)        │
│  - Home (canopy background + input)     │
│  - Chat (with context management)       │
│  - Settings (integrations + API key)    │
├─────────────────────────────────────────┤
│           AI System                     │
│  - Claude API integration               │
│  - Context window management            │
│  - Entity extraction                    │
│  - Streaming responses                  │
└─────────────────────────────────────────┘
```

## Project Structure

```
canopy/
├── electron/
│   ├── main.js          # Electron + SQLite + Claude API
│   └── preload.js       # IPC bridge
├── src/
│   ├── lib/
│   │   ├── ai/          # AI provider abstraction
│   │   ├── components/  # Svelte components
│   │   ├── stores/      # Svelte stores
│   │   └── db/          # Database client
│   └── routes/
│       ├── +page.svelte      # Home
│       ├── onboarding/       # Ray onboarding
│       ├── chat/             # Chat interface
│       └── settings/         # Settings & API key
├── docs/
│   ├── ARCHITECTURE.md  # System architecture
│   └── AI.md            # AI system documentation
└── static/images/       # Put canopy-day.jpg here
```

## Key Features

### Context Window Management

Conversations can continue indefinitely. When the context approaches token limits:

- Older messages are summarized by Claude
- Recent messages (last 4) stay intact
- Summary persists across sessions

See [docs/AI.md](docs/AI.md) for details.

### Entity Graph

Canopy maintains a knowledge graph of:

- **People** - Family, colleagues, clients
- **Projects** - Work projects, personal goals
- **Events** - Trips, deadlines, milestones
- **Domains** - Work, family, sport, health, personal

Entities are automatically extracted from conversations and linked by co-occurrence.

### Markdown Support

All Ray responses render with full markdown support:

- Bold, italic, strikethrough
- Code blocks with syntax highlighting
- Lists, tables, blockquotes
- Links

## Data Storage

All data stored locally in `~/.canopy/`:

| Path                      | Contents             |
| ------------------------- | -------------------- |
| `~/.canopy/canopy.db`     | SQLite database      |
| `~/.canopy/secrets.json`  | API keys (encrypted) |
| `~/.canopy/uploads/`      | Uploaded files       |

## Commands

```bash
npm run dev            # SvelteKit dev server (browser)
npm run electron:dev   # Full Electron app
npm run build          # Build for production
npm run electron:build # Package Electron app
```

## Tech Stack

- **Frontend**: SvelteKit 5 + TypeScript
- **Desktop**: Electron
- **Database**: SQLite (better-sqlite3)
- **AI**: Claude API (Anthropic)
- **Markdown**: marked

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design and database schema
- [AI System](docs/AI.md) - Claude integration and context management

---

*Built with 🌿 by someone who needed AI that actually knows them.*
