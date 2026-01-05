<script lang="ts">
  import type { PendingSuggestion } from '$lib/stores/suggestions';

  interface Props {
    suggestion: PendingSuggestion;
    onconfirm: () => void;
    onreject: () => void;
  }

  let { suggestion, onconfirm, onreject }: Props = $props();

  // Get display text based on suggestion type
  function getLabel(): string {
    if (suggestion.type === 'entity' && suggestion.entity) {
      return 'New:';
    } else if (suggestion.type === 'memory') {
      return 'Memory:';
    } else if (suggestion.type === 'pattern') {
      return 'Pattern:';
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
      return content.length > 50 ? content.slice(0, 47) + '...' : content;
    } else if (suggestion.type === 'pattern' && suggestion.pattern) {
      return suggestion.pattern.description;
    }
    return '';
  }

  function getPrompt(): string {
    if (suggestion.type === 'entity') {
      return 'Add?';
    } else if (suggestion.type === 'memory') {
      return 'Keep?';
    } else if (suggestion.type === 'pattern') {
      return 'Track?';
    }
    return 'Confirm?';
  }

  function getTypeClass(): string {
    return suggestion.type;
  }
</script>

<div class="suggestion-chip {getTypeClass()}">
  <span class="label">{getLabel()}</span>
  <span class="content">{getContent()}</span>
  <span class="prompt">{getPrompt()}</span>
  <button class="btn confirm" onclick={onconfirm} title="Confirm">
    <span class="icon">&#10003;</span>
  </button>
  <button class="btn reject" onclick={onreject} title="Dismiss">
    <span class="icon">&#10005;</span>
  </button>
</div>

<style>
  .suggestion-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    background: var(--bg-tertiary, #f5f5f5);
    border: 1px solid var(--border-light, #e0e0e0);
    border-radius: 1rem;
    font-size: 0.8125rem;
    line-height: 1.3;
    color: var(--text-secondary, #666);
    transition: all 0.2s ease;
  }

  .suggestion-chip:hover {
    background: var(--bg-secondary, #f0f0f0);
    border-color: var(--border, #ccc);
  }

  /* Type-specific styling */
  .suggestion-chip.entity {
    border-color: var(--accent-blue, #3b82f6);
    background: rgba(59, 130, 246, 0.05);
  }

  .suggestion-chip.memory {
    border-color: var(--accent-purple, #8b5cf6);
    background: rgba(139, 92, 246, 0.05);
  }

  .suggestion-chip.pattern {
    border-color: var(--accent-green, #10b981);
    background: rgba(16, 185, 129, 0.05);
  }

  .label {
    font-weight: 500;
    color: var(--text-tertiary, #888);
    white-space: nowrap;
  }

  .content {
    color: var(--text-primary, #333);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prompt {
    color: var(--text-tertiary, #888);
    white-space: nowrap;
    margin-left: 0.25rem;
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 0.75rem;
  }

  .btn .icon {
    line-height: 1;
  }

  .btn.confirm {
    background: var(--accent-green, #10b981);
    color: white;
  }

  .btn.confirm:hover {
    background: var(--accent-green-dark, #059669);
    transform: scale(1.1);
  }

  .btn.reject {
    background: var(--bg-tertiary, #e5e5e5);
    color: var(--text-secondary, #666);
  }

  .btn.reject:hover {
    background: var(--accent-red, #ef4444);
    color: white;
    transform: scale(1.1);
  }

  /* Focus states for accessibility */
  .btn:focus-visible {
    outline: 2px solid var(--accent, #3b82f6);
    outline-offset: 2px;
  }
</style>
