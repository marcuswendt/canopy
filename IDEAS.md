# Canopy Ideas & Future Work

## Debugging

### Data Inspector

- what's actually in the database?
- what's the current AI context?
- what integrations are running?
- what signals do they send?

we need to be able to see/ inspect the internals of the system similar to a browser devtools inspector

---

## Future Todos

### Pattern Recognition Engine

- Analyze signals over time to detect recurring patterns
- Identify correlations between behaviors (e.g., sleep quality → productivity)
- Surface insights like "You tend to be most productive on Tuesday mornings"
- Could use a separate background process or scheduled analysis

### Capacity-Aware Suggestions

- Use recovery/strain data to modulate Ray's responses
- Low recovery → suggest lighter workload, breaks, easier tasks
- High capacity → encourage tackling challenging work
- Integrate with artifact creation (adjust plan complexity based on capacity)

### Apple Notes Integration

- Create a reference plugin similar to Notion
- Search Apple Notes on-demand (not bulk sync)
- macOS-only, use AppleScript or native APIs
- Consider using `osascript` for Note access

### Entity Auto-Extraction

- Automatically detect and create entities from conversations
- Use NER (Named Entity Recognition) to identify people, projects, concepts
- Prompt user to confirm before creating new entities
- Build relationship graph from conversation context

### Voice Capture Mode

- Add voice input option to chat
- Use Whisper or native speech-to-text
- Transcribe and process as regular messages
- Quick capture mode for thoughts on the go

### Calendar Integration

- Sync with Apple Calendar / Google Calendar
- Surface upcoming events in Ray's context
- Detect scheduling conflicts
- Suggest optimal times based on capacity
