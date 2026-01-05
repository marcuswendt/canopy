<script lang="ts">
  // EntityTypeCard - Single step in the entity confirmation carousel
  // Shows a list of entities of one type with individual and bulk actions

  interface ExtractedEntity {
    name: string;
    type: string;
    domain: string;
    description?: string;
    relationship?: string;
    priority?: string;
    date?: string;
  }

  interface Props {
    type: 'space' | 'person' | 'project' | 'goal' | 'focus' | 'event';
    title: string;
    headerText: string;
    entities: ExtractedEntity[];
    onConfirm: (entity: ExtractedEntity) => void;
    onReject: (entity: ExtractedEntity) => void;
    onConfirmAll: () => void;
    onSkipAll: () => void;
  }

  let {
    type,
    title,
    headerText,
    entities,
    onConfirm,
    onReject,
    onConfirmAll,
    onSkipAll,
  }: Props = $props();

  // Track which entities have been acted on (for animations)
  let actedOn = $state<Set<string>>(new Set());
  let actionType = $state<Map<string, 'confirm' | 'reject'>>(new Map());

  function handleConfirm(entity: ExtractedEntity) {
    actedOn.add(entity.name);
    actionType.set(entity.name, 'confirm');
    // Small delay for animation
    setTimeout(() => {
      onConfirm(entity);
    }, 200);
  }

  function handleReject(entity: ExtractedEntity) {
    actedOn.add(entity.name);
    actionType.set(entity.name, 'reject');
    setTimeout(() => {
      onReject(entity);
    }, 200);
  }

  // Format entity display based on type
  function formatEntity(entity: ExtractedEntity): { primary: string; secondary?: string } {
    switch (type) {
      case 'space':
        return {
          primary: entity.name.charAt(0).toUpperCase() + entity.name.slice(1),
          secondary: entity.description,
        };
      case 'person':
        return {
          primary: entity.name,
          secondary: entity.relationship,
        };
      case 'project':
        return {
          primary: entity.name,
          secondary: entity.domain,
        };
      case 'goal':
        return {
          primary: entity.name,
          secondary: entity.priority ? `${entity.priority}${entity.date ? ` • ${entity.date}` : ''}` : entity.date,
        };
      case 'focus':
        return {
          primary: entity.name,
          secondary: entity.description,
        };
      case 'event':
        return {
          primary: entity.name,
          secondary: entity.date,
        };
      default:
        return { primary: entity.name };
    }
  }

  // Visible entities (not yet acted on)
  let visibleEntities = $derived(
    entities.filter(e => !actedOn.has(e.name))
  );
</script>

<div class="entity-type-card">
  <div class="card-header">
    <h3 class="card-title">{title}</h3>
    <p class="card-description">{headerText}</p>
  </div>

  <div class="entity-list">
    {#each visibleEntities as entity (entity.name)}
      {@const formatted = formatEntity(entity)}
      {@const action = actionType.get(entity.name)}
      <div
        class="entity-row"
        class:confirming={action === 'confirm'}
        class:rejecting={action === 'reject'}
      >
        <div class="entity-info">
          <span class="entity-name">{formatted.primary}</span>
          {#if formatted.secondary}
            <span class="entity-secondary">({formatted.secondary})</span>
          {/if}
        </div>
        <div class="entity-actions">
          <button
            class="action-btn confirm"
            onclick={() => handleConfirm(entity)}
            title="Add"
          >
            <span class="icon">&#10003;</span>
          </button>
          <button
            class="action-btn reject"
            onclick={() => handleReject(entity)}
            title="Skip"
          >
            <span class="icon">&#10005;</span>
          </button>
        </div>
      </div>
    {/each}
  </div>

  {#if visibleEntities.length > 0}
    <div class="bulk-actions">
      <button class="bulk-btn primary" onclick={onConfirmAll}>
        Add all ({visibleEntities.length})
      </button>
      <button class="bulk-btn secondary" onclick={onSkipAll}>
        Skip
      </button>
    </div>
  {/if}
</div>

<style>
  .entity-type-card {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--bg-primary, white);
    border-radius: 1rem;
    border: 1px solid var(--border-light, #e5e5e5);
    max-width: 400px;
    margin: 0 auto;
  }

  .card-header {
    text-align: center;
    margin-bottom: 0.5rem;
  }

  .card-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    margin: 0 0 0.5rem 0;
  }

  .card-description {
    font-size: 0.875rem;
    color: var(--text-secondary, #666);
    margin: 0;
    font-style: italic;
  }

  .entity-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 300px;
    overflow-y: auto;
  }

  .entity-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary, #fafafa);
    border-radius: 0.5rem;
    border: 1px solid var(--border-light, #e5e5e5);
    transition: all 0.2s ease;
  }

  .entity-row:hover {
    background: var(--bg-tertiary, #f0f0f0);
    border-color: var(--border, #ddd);
  }

  .entity-row.confirming {
    animation: slideOutRight 0.2s ease forwards;
    background: rgba(16, 185, 129, 0.1);
    border-color: var(--accent-green, #10b981);
  }

  .entity-row.rejecting {
    animation: slideOutLeft 0.2s ease forwards;
    background: rgba(239, 68, 68, 0.05);
    border-color: var(--border, #ddd);
  }

  @keyframes slideOutRight {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(20px);
    }
  }

  @keyframes slideOutLeft {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(-20px);
    }
  }

  .entity-info {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }

  .entity-name {
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--text-primary, #1a1a1a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .entity-secondary {
    font-size: 0.8125rem;
    color: var(--text-tertiary, #888);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .entity-actions {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 0.875rem;
  }

  .action-btn .icon {
    line-height: 1;
  }

  .action-btn.confirm {
    background: var(--accent-green, #10b981);
    color: white;
  }

  .action-btn.confirm:hover {
    background: var(--accent-green-dark, #059669);
    transform: scale(1.1);
  }

  .action-btn.reject {
    background: var(--bg-tertiary, #e5e5e5);
    color: var(--text-secondary, #666);
  }

  .action-btn.reject:hover {
    background: var(--accent-red, #ef4444);
    color: white;
    transform: scale(1.1);
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--accent, #3b82f6);
    outline-offset: 2px;
  }

  .bulk-actions {
    display: flex;
    gap: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-light, #e5e5e5);
  }

  .bulk-btn {
    flex: 1;
    padding: 0.625rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bulk-btn.primary {
    background: var(--accent-green, #10b981);
    color: white;
    border: 1px solid var(--accent-green, #10b981);
  }

  .bulk-btn.primary:hover {
    background: var(--accent-green-dark, #059669);
    border-color: var(--accent-green-dark, #059669);
  }

  .bulk-btn.secondary {
    background: transparent;
    color: var(--text-secondary, #666);
    border: 1px solid var(--border, #ddd);
  }

  .bulk-btn.secondary:hover {
    background: var(--bg-tertiary, #f0f0f0);
    color: var(--text-primary, #1a1a1a);
  }

  .bulk-btn:focus-visible {
    outline: 2px solid var(--accent, #3b82f6);
    outline-offset: 2px;
  }
</style>
