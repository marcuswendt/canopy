<script lang="ts">
  import type { PendingSuggestion } from '$lib/stores/suggestions';
  import SuggestionChip from './SuggestionChip.svelte';

  interface Props {
    suggestions: PendingSuggestion[];
    onconfirm: (id: string) => void;
    onreject: (id: string) => void;
    onconfirmall: () => void;
    onrejectall: () => void;
  }

  let { suggestions, onconfirm, onreject, onconfirmall, onrejectall }: Props = $props();

  // Track dismissed state for animation
  let dismissed = $state(false);

  function handleConfirmAll() {
    onconfirmall();
  }

  function handleDismissAll() {
    dismissed = true;
    // Small delay before actually rejecting to allow animation
    setTimeout(() => {
      onrejectall();
    }, 200);
  }

  // Count by type for bulk action labels
  let entityCount = $derived(suggestions.filter(s => s.type === 'entity').length);
  let memoryCount = $derived(suggestions.filter(s => s.type === 'memory').length);
</script>

{#if suggestions.length > 0}
  <div class="suggestion-bar" class:dismissed>
    <div class="suggestions-list">
      {#each suggestions as suggestion (suggestion.id)}
        <SuggestionChip
          {suggestion}
          onconfirm={() => onconfirm(suggestion.id)}
          onreject={() => onreject(suggestion.id)}
        />
      {/each}
    </div>

    {#if suggestions.length > 2}
      <div class="bulk-actions">
        <button class="bulk-btn confirm" onclick={handleConfirmAll}>
          Keep all ({suggestions.length})
        </button>
        <button class="bulk-btn dismiss" onclick={handleDismissAll}>
          Dismiss all
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .suggestion-bar {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    margin: 0.5rem 0;
    background: var(--bg-secondary, #fafafa);
    border-radius: 0.75rem;
    border: 1px solid var(--border-light, #e5e5e5);
    animation: slideIn 0.3s ease-out;
  }

  .suggestion-bar.dismissed {
    animation: fadeOut 0.2s ease-out forwards;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeOut {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-8px);
    }
  }

  .suggestions-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .bulk-actions {
    display: flex;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-light, #e5e5e5);
    margin-top: 0.25rem;
  }

  .bulk-btn {
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    border-radius: 1rem;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bulk-btn.confirm {
    background: var(--accent-green, #10b981);
    color: white;
    border-color: var(--accent-green, #10b981);
  }

  .bulk-btn.confirm:hover {
    background: var(--accent-green-dark, #059669);
    border-color: var(--accent-green-dark, #059669);
  }

  .bulk-btn.dismiss {
    background: transparent;
    color: var(--text-tertiary, #888);
    border-color: var(--border, #ddd);
  }

  .bulk-btn.dismiss:hover {
    background: var(--bg-tertiary, #f0f0f0);
    color: var(--text-secondary, #666);
  }

  /* Focus states for accessibility */
  .bulk-btn:focus-visible {
    outline: 2px solid var(--accent, #3b82f6);
    outline-offset: 2px;
  }
</style>
