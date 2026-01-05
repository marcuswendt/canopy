<script lang="ts">
  import { entities } from '$lib/stores/entities';
  import type { Entity } from '$lib/db/types';

  interface Props {
    value: string;
    placeholder?: string;
    disabled?: boolean;
    onsubmit?: () => void;
    onchange?: (value: string, mentions: Entity[]) => void;
  }

  let {
    value = $bindable(''),
    placeholder = "What's on your mind...",
    disabled = false,
    onsubmit,
    onchange
  }: Props = $props();

  let textareaEl: HTMLTextAreaElement;
  let popoverEl: HTMLDivElement;

  // Autocomplete state
  let showPopover = $state(false);
  let popoverPosition = $state({ top: 0, left: 0 });
  let triggerStart = $state(-1);
  let triggerType = $state<'@' | '!' | null>(null);
  let searchQuery = $state('');
  let selectedIndex = $state(0);

  // Track confirmed mentions
  let confirmedMentions = $state<Map<string, Entity>>(new Map());

  // Auto-grow textarea to fit content
  function autoGrow() {
    if (!textareaEl) return;
    // Reset height to auto to get the correct scrollHeight
    textareaEl.style.height = 'auto';
    // Set to scrollHeight, but cap at max-height (handled by CSS)
    textareaEl.style.height = `${textareaEl.scrollHeight}px`;
  }

  // Trigger auto-grow when value changes
  $effect(() => {
    value; // dependency
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(autoGrow);
  });

  // Filter entities based on search
  let filteredEntities = $derived(
    triggerType === '@'
      ? $entities
          .filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
          .slice(0, 6)
      : []
  );

  // Parse mentions from text and notify parent
  $effect(() => {
    const mentions = Array.from(confirmedMentions.values());
    onchange?.(value, mentions);
  });

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    const cursorPos = target.selectionStart;
    const textBeforeCursor = target.value.slice(0, cursorPos);

    // Check for trigger characters
    const lastAtPos = textBeforeCursor.lastIndexOf('@');
    const lastBangPos = textBeforeCursor.lastIndexOf('!');

    // Determine which trigger is active (most recent one)
    let activeTriggerPos = -1;
    let activeTrigger: '@' | '!' | null = null;

    if (lastAtPos > lastBangPos && lastAtPos >= 0) {
      // Check if @ is at start or after whitespace
      if (lastAtPos === 0 || /\s/.test(textBeforeCursor[lastAtPos - 1])) {
        activeTriggerPos = lastAtPos;
        activeTrigger = '@';
      }
    } else if (lastBangPos > lastAtPos && lastBangPos >= 0) {
      if (lastBangPos === 0 || /\s/.test(textBeforeCursor[lastBangPos - 1])) {
        activeTriggerPos = lastBangPos;
        activeTrigger = '!';
      }
    }

    if (activeTrigger && activeTriggerPos >= 0) {
      const queryText = textBeforeCursor.slice(activeTriggerPos + 1);

      // Only show popover if no space in query (user still typing the mention)
      if (!queryText.includes(' ') && queryText.length <= 30) {
        triggerStart = activeTriggerPos;
        triggerType = activeTrigger;
        searchQuery = queryText;
        selectedIndex = 0;
        showPopover = true;
        updatePopoverPosition();
        return;
      }
    }

    showPopover = false;
    triggerType = null;
  }

  function updatePopoverPosition() {
    if (!textareaEl) return;

    // Get textarea position and approximate cursor position
    const rect = textareaEl.getBoundingClientRect();
    const lineHeight = parseInt(getComputedStyle(textareaEl).lineHeight) || 20;

    // Simple positioning - show below textarea start
    // For better positioning, would need to measure text width to cursor
    popoverPosition = {
      top: rect.height + 4,
      left: 0
    };
  }

  function selectEntity(entity: Entity) {
    if (triggerStart < 0) return;

    const before = value.slice(0, triggerStart);
    const after = value.slice(textareaEl.selectionStart);

    // Insert mention marker
    const mentionText = `@${entity.name}`;
    value = before + mentionText + ' ' + after;

    // Track the mention
    confirmedMentions.set(entity.id, entity);
    confirmedMentions = confirmedMentions;

    // Close popover and refocus
    showPopover = false;
    triggerType = null;

    // Set cursor after the mention
    requestAnimationFrame(() => {
      const newPos = before.length + mentionText.length + 1;
      textareaEl.setSelectionRange(newPos, newPos);
      textareaEl.focus();
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (showPopover && filteredEntities.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          selectedIndex = (selectedIndex + 1) % filteredEntities.length;
          break;
        case 'ArrowUp':
          e.preventDefault();
          selectedIndex = (selectedIndex - 1 + filteredEntities.length) % filteredEntities.length;
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          selectEntity(filteredEntities[selectedIndex]);
          break;
        case 'Escape':
          e.preventDefault();
          showPopover = false;
          break;
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onsubmit?.();
    }
  }

  function handleBlur(e: FocusEvent) {
    // Delay hiding to allow click on popover
    setTimeout(() => {
      if (!popoverEl?.contains(document.activeElement)) {
        showPopover = false;
      }
    }, 150);
  }

  // Get domain color for entity
  function getDomainColor(domain: string): string {
    const colors: Record<string, string> = {
      work: 'var(--domain-work)',
      family: 'var(--domain-family)',
      sport: 'var(--domain-sport)',
      personal: 'var(--domain-personal)',
      health: 'var(--domain-health)',
    };
    return colors[domain] || 'var(--text-muted)';
  }

  // Get icon for entity type
  function getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      person: '👤',
      project: '📁',
      event: '📅',
      concept: '💡',
      domain: '🏷️',
    };
    return icons[type] || '•';
  }

  // Export method to get mentions
  export function getMentions(): Entity[] {
    return Array.from(confirmedMentions.values());
  }

  // Export method to clear
  export function clear() {
    value = '';
    confirmedMentions.clear();
    confirmedMentions = confirmedMentions;
    // Reset textarea height
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }
  }
</script>

<div class="mention-input-container">
  <textarea
    bind:this={textareaEl}
    bind:value
    {placeholder}
    {disabled}
    oninput={handleInput}
    onkeydown={handleKeydown}
    onblur={handleBlur}
    rows="1"
  ></textarea>

  {#if showPopover && triggerType === '@' && filteredEntities.length > 0}
    <div
      class="mention-popover"
      bind:this={popoverEl}
      style="top: {popoverPosition.top}px; left: {popoverPosition.left}px;"
    >
      <div class="popover-header">
        <span class="popover-title">Entities</span>
        <span class="popover-hint">↑↓ to navigate, ↵ to select</span>
      </div>
      {#each filteredEntities as entity, i}
        <button
          class="mention-option"
          class:selected={i === selectedIndex}
          onmousedown={(e) => { e.preventDefault(); selectEntity(entity); }}
          onmouseenter={() => selectedIndex = i}
        >
          <span class="entity-icon">{getTypeIcon(entity.type)}</span>
          <span class="entity-info">
            <span class="entity-name">{entity.name}</span>
            {#if entity.description}
              <span class="entity-desc">{entity.description}</span>
            {/if}
          </span>
          <span class="entity-domain" style="color: {getDomainColor(entity.domain)}">
            {entity.domain}
          </span>
        </button>
      {/each}
      {#if searchQuery && filteredEntities.length === 0}
        <div class="no-results">No entities matching "{searchQuery}"</div>
      {/if}
    </div>
  {/if}

  {#if showPopover && triggerType === '!'}
    <div
      class="mention-popover"
      bind:this={popoverEl}
      style="top: {popoverPosition.top}px; left: {popoverPosition.left}px;"
    >
      <div class="popover-header">
        <span class="popover-title">Files & Artifacts</span>
      </div>
      <div class="coming-soon">File references coming soon</div>
    </div>
  {/if}
</div>

<style>
  .mention-input-container {
    position: relative;
    flex: 1;
  }

  textarea {
    width: 100%;
    border: none;
    background: transparent;
    font-size: 15px;
    color: var(--text-primary);
    resize: none;
    padding: var(--space-sm);
    line-height: 1.5;
    font-family: inherit;
    min-height: 24px;
    max-height: 200px;
    overflow-y: auto;
  }

  textarea::placeholder {
    color: var(--text-muted);
  }

  textarea:focus {
    outline: none;
  }

  textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .mention-popover {
    position: absolute;
    z-index: 100;
    min-width: 280px;
    max-width: 400px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    overflow: hidden;
  }

  .popover-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border);
    background: var(--bg-tertiary);
  }

  .popover-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
  }

  .popover-hint {
    font-size: 10px;
    color: var(--text-muted);
  }

  .mention-option {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .mention-option:hover,
  .mention-option.selected {
    background: var(--bg-tertiary);
  }

  .entity-icon {
    font-size: 16px;
    width: 24px;
    text-align: center;
  }

  .entity-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .entity-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .entity-desc {
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .entity-domain {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .no-results,
  .coming-soon {
    padding: var(--space-md);
    font-size: 13px;
    color: var(--text-muted);
    text-align: center;
    font-style: italic;
  }
</style>
