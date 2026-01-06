<script lang="ts">
  import type { PendingSuggestion } from '$lib/client/stores/suggestions';

  interface Props {
    suggestion: PendingSuggestion;
    onconfirm: () => void;
    onreject: () => void;
  }

  let { suggestion, onconfirm, onreject }: Props = $props();

  // Entity type icons and colors
  const ENTITY_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
    person: { icon: '●', color: 'blue', label: 'Person' },
    project: { icon: '■', color: 'amber', label: 'Project' },
    domain: { icon: '◆', color: 'emerald', label: 'Space' },
    event: { icon: '◈', color: 'violet', label: 'Event' },
    goal: { icon: '◎', color: 'green', label: 'Goal' },
    focus: { icon: '◇', color: 'rose', label: 'Focus' },
    concept: { icon: '○', color: 'slate', label: 'Concept' },
  };

  // Get entity type config
  function getEntityConfig() {
    if (suggestion.type === 'entity' && suggestion.entity) {
      return ENTITY_CONFIG[suggestion.entity.type] || ENTITY_CONFIG.concept;
    }
    return null;
  }

  // Get icon for the suggestion
  function getIcon(): string {
    if (suggestion.type === 'entity' && suggestion.entity) {
      return ENTITY_CONFIG[suggestion.entity.type]?.icon || '○';
    } else if (suggestion.type === 'memory') {
      return '◌';
    } else if (suggestion.type === 'pattern') {
      return '⟁';
    }
    return '○';
  }

  // Get label based on entity type or suggestion type
  function getLabel(): string {
    if (suggestion.type === 'entity' && suggestion.entity) {
      return ENTITY_CONFIG[suggestion.entity.type]?.label || 'Entity';
    } else if (suggestion.type === 'memory') {
      return 'Memory';
    } else if (suggestion.type === 'pattern') {
      return 'Pattern';
    }
    return '';
  }

  function getContent(): string {
    if (suggestion.type === 'entity' && suggestion.entity) {
      const e = suggestion.entity;
      if (e.relationship) {
        return `${e.name} (${e.relationship})`;
      }
      return e.name;
    } else if (suggestion.type === 'memory' && suggestion.memory) {
      const content = suggestion.memory.content;
      // Truncate long memories
      return content.length > 60 ? content.slice(0, 57) + '...' : content;
    } else if (suggestion.type === 'pattern' && suggestion.pattern) {
      return suggestion.pattern.description;
    }
    return '';
  }

  // Get CSS class for color styling
  function getColorClass(): string {
    if (suggestion.type === 'entity' && suggestion.entity) {
      return `entity-${suggestion.entity.type}`;
    }
    return suggestion.type;
  }
</script>

<div class="suggestion-chip {getColorClass()}">
  <span class="type-icon">{getIcon()}</span>
  <span class="label">{getLabel()}</span>
  <span class="content">{getContent()}</span>
  <button class="btn confirm" onclick={onconfirm} title="Add to Canopy">
    ✓
  </button>
  <button class="btn reject" onclick={onreject} title="Dismiss">
    ✕
  </button>
</div>

<style>
  .suggestion-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.625rem;
    background: var(--bg-tertiary, #f5f5f5);
    border: 1.5px solid var(--border-light, #e0e0e0);
    border-radius: 2rem;
    font-size: 0.8125rem;
    line-height: 1.3;
    color: var(--text-secondary, #666);
    transition: all 0.2s ease;
  }

  .suggestion-chip:hover {
    background: var(--bg-secondary, #f0f0f0);
  }

  /* Type icon styling */
  .type-icon {
    font-size: 0.75rem;
    line-height: 1;
    opacity: 0.9;
  }

  /* Entity type colors - Person (blue) */
  .suggestion-chip.entity-person {
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.08);
  }
  .suggestion-chip.entity-person .type-icon { color: #3b82f6; }
  .suggestion-chip.entity-person .label { color: #2563eb; }

  /* Entity type colors - Project (amber) */
  .suggestion-chip.entity-project {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.08);
  }
  .suggestion-chip.entity-project .type-icon { color: #f59e0b; }
  .suggestion-chip.entity-project .label { color: #d97706; }

  /* Entity type colors - Domain/Space (emerald) */
  .suggestion-chip.entity-domain {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.08);
  }
  .suggestion-chip.entity-domain .type-icon { color: #10b981; }
  .suggestion-chip.entity-domain .label { color: #059669; }

  /* Entity type colors - Event (violet) */
  .suggestion-chip.entity-event {
    border-color: #8b5cf6;
    background: rgba(139, 92, 246, 0.08);
  }
  .suggestion-chip.entity-event .type-icon { color: #8b5cf6; }
  .suggestion-chip.entity-event .label { color: #7c3aed; }

  /* Entity type colors - Goal (green) */
  .suggestion-chip.entity-goal {
    border-color: #22c55e;
    background: rgba(34, 197, 94, 0.08);
  }
  .suggestion-chip.entity-goal .type-icon { color: #22c55e; }
  .suggestion-chip.entity-goal .label { color: #16a34a; }

  /* Entity type colors - Focus (rose) */
  .suggestion-chip.entity-focus {
    border-color: #f43f5e;
    background: rgba(244, 63, 94, 0.08);
  }
  .suggestion-chip.entity-focus .type-icon { color: #f43f5e; }
  .suggestion-chip.entity-focus .label { color: #e11d48; }

  /* Entity type colors - Concept (slate) */
  .suggestion-chip.entity-concept {
    border-color: #64748b;
    background: rgba(100, 116, 139, 0.08);
  }
  .suggestion-chip.entity-concept .type-icon { color: #64748b; }
  .suggestion-chip.entity-concept .label { color: #475569; }

  /* Memory (purple) */
  .suggestion-chip.memory {
    border-color: #a855f7;
    background: rgba(168, 85, 247, 0.08);
  }
  .suggestion-chip.memory .type-icon { color: #a855f7; }
  .suggestion-chip.memory .label { color: #9333ea; }

  /* Pattern (teal) */
  .suggestion-chip.pattern {
    border-color: #14b8a6;
    background: rgba(20, 184, 166, 0.08);
  }
  .suggestion-chip.pattern .type-icon { color: #14b8a6; }
  .suggestion-chip.pattern .label { color: #0d9488; }

  .label {
    font-weight: 600;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    white-space: nowrap;
  }

  .content {
    color: var(--text-primary, #333);
    font-weight: 500;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.375rem;
    height: 1.375rem;
    padding: 0;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 0.6875rem;
    font-weight: 600;
  }

  .btn.confirm {
    background: var(--accent-green, #10b981);
    color: white;
  }

  .btn.confirm:hover {
    background: #059669;
    transform: scale(1.1);
  }

  .btn.reject {
    background: var(--bg-secondary, #e5e5e5);
    color: var(--text-muted, #888);
  }

  .btn.reject:hover {
    background: #ef4444;
    color: white;
    transform: scale(1.1);
  }

  /* Focus states for accessibility */
  .btn:focus-visible {
    outline: 2px solid var(--accent, #3b82f6);
    outline-offset: 2px;
  }
</style>
