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
│  - IPC handlers for all DB operations   │
├─────────────────────────────────────────┤
│           SvelteKit Frontend            │
│  - Onboarding (Ray conversation)        │
│  - Home (canopy background + input)     │
│  - Chat (with context sidebar)          │
│  - Arc-style navigation sidebar         │
├─────────────────────────────────────────┤
│           Ray Coach System              │
│  - Onboarding state machine             │
│  - Life context & priorities            │
│  - Proactive nudges                     │
└─────────────────────────────────────────┘
```

## Project Structure

```
canopy/
├── electron/
│   ├── main.js          # Electron + SQLite
│   └── preload.js       # IPC bridge
├── src/
│   ├── lib/
│   │   ├── components/  # Svelte components
│   │   ├── stores/      # Svelte stores
│   │   ├── db/          # Database client
│   │   └── coach/       # Ray coach system
│   └── routes/
│       ├── +page.svelte      # Home
│       ├── onboarding/       # Ray onboarding
│       └── chat/             # Chat interface
├── static/images/       # Put canopy-day.jpg here
└── package.json
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/coach/ray.ts` | Ray's voice, prompts, state types |
| `src/lib/coach/store.ts` | Ray state management |
| `src/routes/onboarding/+page.svelte` | Onboarding conversation UI |
| `electron/main.js` | SQLite + all IPC handlers |

## Adding Your Canopy Image

Place a photo of trees/canopy looking up at `static/images/canopy-day.jpg`

## Next Steps

1. **Add Claude API** - Replace mock extraction in onboarding with real NER
2. **Wire up chat** - Connect Ray's context to chat responses  
3. **Add integrations** - WHOOP, calendar, TrainingPeaks
4. **Proactive nudges** - Weekly check-ins, event reminders

## Commands

```bash
npm run dev           # SvelteKit dev server (browser)
npm run electron:dev  # Full Electron app
npm run build         # Build for production
npm run electron:build # Package Electron app
```

## Tech Stack

- **Frontend**: SvelteKit + TypeScript
- **Desktop**: Electron
- **Database**: SQLite (better-sqlite3)
- **AI**: Claude API (Anthropic)
- **Coach**: Ray (conversational onboarding + guidance)

---

*Built with 🌿 by someone who needed AI that actually knows them.*
