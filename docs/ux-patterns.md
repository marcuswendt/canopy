# Canopy UX Patterns

Design patterns used throughout the Canopy application.

---

## Bonsai Principle

> "AI can suggest entities, connections, memories, but nothing becomes permanent until you confirm it."

This principle guides all extraction and persistence flows. The AI proposes, the user disposes.

---

## Onboarding Carousel

Entity confirmation wizard that walks through extracted entities by type.

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `EntityCarousel` | `src/lib/components/onboarding/` | Main wizard managing step navigation |
| `EntityTypeCard` | `src/lib/components/onboarding/` | Single step showing entities of one type |
| `ConfirmationNotification` | `src/lib/components/onboarding/` | Toast notifications for confirmed entities |
| `CompletionSummary` | `src/lib/components/onboarding/` | Final summary after carousel completes |

### Pattern: Sequential Type Flow

Walk through entity types one at a time to reduce cognitive load:

```
Spaces → People → Projects → Goals → Focuses → Events
```

Empty types are automatically skipped. User only sees what's relevant.

### Pattern: Tinder-style Swiping

Each entity row has confirm/reject buttons with directional animations:

| Action | Visual | Animation |
|--------|--------|-----------|
| Confirm (✓) | Green highlight | Slide right 200ms |
| Reject (✗) | Subtle dimming | Slide left 200ms |

Immediate visual feedback reinforces the decision.

### Pattern: Batch + Individual Control

Three levels of control on each step:

1. **Individual buttons** - Granular control per entity
2. **"Add all (N)"** - Confirm all entities in current step
3. **"Skip"** - Reject all and advance to next type

User can choose efficiency or precision.

### Pattern: Progressive Disclosure

Carousel only renders steps that have entities. If extraction found no events, the Events step never appears. This keeps the UI focused.

### Pattern: Contextual Headers

Each step has a conversational header explaining what was found:

| Type | Header |
|------|--------|
| Spaces | "I discovered these as major domains of your life:" |
| People | "These people play an important role for you:" |
| Projects | "I found these projects and companies:" |
| Goals | "These goals stood out:" |
| Focuses | "I noticed these themes in what you shared:" |
| Events | "Important dates and events:" |

### Pattern: Toast Notifications (Fire-and-Forget)

- Fixed position: top-right corner
- Batching: 300ms debounce to group rapid confirmations
- Auto-dismiss: 5 seconds
- Stacking: Multiple notifications slide in vertically

### Pattern: Step Indicator Navigation

- Clickable dots for jumping between types
- Active step: larger dot with accent color
- Completed steps: accent color at reduced opacity
- Keyboard accessible with focus states

---

## Summary Review (Bonsai Gate)

Before completing onboarding, all collected entities are shown one more time for final approval. Users can remove anything that was incorrectly extracted.

This is the "last chance" gate before data becomes permanent.

---

## CSS Custom Properties

Components use these theme variables for consistency:

```css
/* Backgrounds */
--bg-primary, --bg-secondary, --bg-tertiary

/* Text */
--text-primary, --text-secondary, --text-tertiary

/* Accents */
--accent-green, --accent-green-dark
--accent (focus states)

/* Borders */
--border-light, --border
```

---

## Animation Timing

| Context | Duration | Easing |
|---------|----------|--------|
| Entity confirm/reject | 200ms | ease-out |
| Step transitions | 300ms | ease-out |
| Toast slide-in | 300ms | ease-out |
| Toast dismiss | 200ms | ease-out |
| Completion checkmark | 300ms | ease-out |

Consistent timing creates a cohesive feel.
