# Claude Code Instructions

Project-specific guidelines for Claude Code when working on Canopy.

## Version Control

- **Commit features individually** - Keep a clean version history with atomic commits
- Each commit should represent a single logical change
- Write descriptive commit messages explaining "why" not just "what"
- Group related changes (e.g., component + its styles) but separate features

## Commit Examples

Good:
```
Add Markdown component for message rendering
Add context window management with summarization
Update chat page to use AI streaming
```

Bad:
```
Add Claude API, markdown, context management, and update all pages
```

## Code Style

- Use Svelte 5 runes (`$state`, `$derived`, `$effect`)
- TypeScript for all new files
- Keep components focused and single-purpose
- Prefer editing existing files over creating new ones

## Testing

- Build passes: `npm run build`
- Run with: `npm run electron:dev`

## Documentation

- Update docs/ when adding new systems
- Keep README.md current with feature changes
