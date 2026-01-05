<script lang="ts">
  // CompletionSummary - Final summary view after carousel completes
  // Shows all confirmed entities grouped by type

  interface AddedEntity {
    name: string;
    type: string;
    domain?: string;
    relationship?: string;
  }

  interface Props {
    confirmedEntities: AddedEntity[];
    onContinue: () => void;
  }

  let { confirmedEntities, onContinue }: Props = $props();

  // Group entities by type
  let groupedEntities = $derived(() => {
    const groups: Record<string, AddedEntity[]> = {
      spaces: [],
      people: [],
      projects: [],
      goals: [],
      focuses: [],
      events: [],
    };

    for (const entity of confirmedEntities) {
      switch (entity.type) {
        case 'domain':
          groups.spaces.push(entity);
          break;
        case 'person':
          groups.people.push(entity);
          break;
        case 'project':
        case 'company':
          groups.projects.push(entity);
          break;
        case 'goal':
          groups.goals.push(entity);
          break;
        case 'focus':
          groups.focuses.push(entity);
          break;
        case 'event':
          groups.events.push(entity);
          break;
      }
    }

    return groups;
  });

  // Type labels and icons
  const TYPE_CONFIG: Record<string, { label: string; icon: string }> = {
    spaces: { label: 'Spaces', icon: '🌍' },
    people: { label: 'People', icon: '👤' },
    projects: { label: 'Projects', icon: '📁' },
    goals: { label: 'Goals', icon: '🎯' },
    focuses: { label: 'Focuses', icon: '🔍' },
    events: { label: 'Events', icon: '📅' },
  };

  // Get non-empty groups
  let activeGroups = $derived(
    Object.entries(groupedEntities())
      .filter(([_, entities]) => entities.length > 0)
      .map(([type, entities]) => ({
        type,
        entities,
        ...TYPE_CONFIG[type],
      }))
  );

  // Total count
  let totalCount = $derived(confirmedEntities.length);
</script>

<div class="completion-summary">
  <div class="summary-header">
    <div class="check-circle">
      <span class="check-icon">&#10003;</span>
    </div>
    <h3 class="title">All set!</h3>
    <p class="subtitle">
      {totalCount} {totalCount === 1 ? 'entity' : 'entities'} added to your Canopy
    </p>
  </div>

  {#if activeGroups.length > 0}
    <div class="groups-container">
      {#each activeGroups as group (group.type)}
        <div class="entity-group">
          <div class="group-header">
            <span class="group-icon">{group.icon}</span>
            <span class="group-label">{group.label}</span>
            <span class="group-count">({group.entities.length})</span>
          </div>
          <ul class="entity-list">
            {#each group.entities as entity (entity.name)}
              <li class="entity-item">
                <span class="entity-name">{entity.name}</span>
                {#if entity.relationship}
                  <span class="entity-detail">({entity.relationship})</span>
                {:else if entity.domain && group.type !== 'spaces'}
                  <span class="entity-detail">({entity.domain})</span>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {:else}
    <p class="empty-message">No entities were added.</p>
  {/if}

  <button class="continue-btn" onclick={onContinue}>
    Continue to Canopy
  </button>
</div>

<style>
  .completion-summary {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 2rem;
    background: var(--bg-primary, white);
    border-radius: 1rem;
    border: 1px solid var(--border-light, #e5e5e5);
    max-width: 420px;
    margin: 0 auto;
    animation: fadeIn 0.3s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .summary-header {
    text-align: center;
  }

  .check-circle {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    background: var(--accent-green, #10b981);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1rem;
    animation: scaleIn 0.3s ease-out 0.1s both;
  }

  @keyframes scaleIn {
    from {
      transform: scale(0);
    }
    to {
      transform: scale(1);
    }
  }

  .check-icon {
    color: white;
    font-size: 1.5rem;
    font-weight: bold;
  }

  .title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    margin: 0 0 0.5rem 0;
  }

  .subtitle {
    font-size: 0.875rem;
    color: var(--text-secondary, #666);
    margin: 0;
  }

  .groups-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-height: 300px;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .entity-group {
    background: var(--bg-secondary, #fafafa);
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-light, #e5e5e5);
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-light, #e5e5e5);
  }

  .group-icon {
    font-size: 0.875rem;
  }

  .group-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    flex: 1;
  }

  .group-count {
    font-size: 0.75rem;
    color: var(--text-tertiary, #888);
  }

  .entity-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .entity-item {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    font-size: 0.8125rem;
  }

  .entity-name {
    color: var(--text-primary, #1a1a1a);
  }

  .entity-detail {
    color: var(--text-tertiary, #888);
    font-size: 0.75rem;
  }

  .empty-message {
    font-size: 0.875rem;
    color: var(--text-tertiary, #888);
    font-style: italic;
  }

  .continue-btn {
    width: 100%;
    padding: 0.875rem 1.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    background: var(--accent-green, #10b981);
    color: white;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .continue-btn:hover {
    background: var(--accent-green-dark, #059669);
  }

  .continue-btn:focus-visible {
    outline: 2px solid var(--accent, #3b82f6);
    outline-offset: 2px;
  }
</style>
