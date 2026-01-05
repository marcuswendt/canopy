<script lang="ts">
  // ConfirmationNotification - Toast panel showing recently added entities
  // Appears on right side, stacks notifications, auto-dismisses

  interface AddedEntity {
    name: string;
    type: string;
  }

  interface Props {
    recentlyAdded: AddedEntity[];
    autoDismissMs?: number;
  }

  let { recentlyAdded, autoDismissMs = 5000 }: Props = $props();

  // Track visible notifications with unique IDs
  interface Notification {
    id: string;
    entities: AddedEntity[];
    timestamp: number;
    dismissing: boolean;
  }

  let notifications = $state<Notification[]>([]);
  let notificationCounter = 0;

  // Batch recent additions into a single notification
  let lastBatchTime = $state(0);
  let pendingBatch = $state<AddedEntity[]>([]);
  let batchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Watch for new entities and batch them
  $effect(() => {
    if (recentlyAdded.length > 0) {
      const newEntities = recentlyAdded.slice(-5); // Last 5
      const now = Date.now();

      // If within batch window, add to pending batch
      if (now - lastBatchTime < 300) {
        pendingBatch = [...pendingBatch, ...newEntities];
        if (batchTimeout) clearTimeout(batchTimeout);
        batchTimeout = setTimeout(flushBatch, 300);
      } else {
        // New batch
        pendingBatch = [...newEntities];
        lastBatchTime = now;
        if (batchTimeout) clearTimeout(batchTimeout);
        batchTimeout = setTimeout(flushBatch, 300);
      }
    }
  });

  function flushBatch() {
    if (pendingBatch.length === 0) return;

    const id = `notif-${++notificationCounter}`;
    notifications = [
      ...notifications,
      {
        id,
        entities: [...pendingBatch],
        timestamp: Date.now(),
        dismissing: false,
      },
    ];

    pendingBatch = [];

    // Auto-dismiss after timeout
    setTimeout(() => {
      dismissNotification(id);
    }, autoDismissMs);
  }

  function dismissNotification(id: string) {
    // Start dismiss animation
    notifications = notifications.map(n =>
      n.id === id ? { ...n, dismissing: true } : n
    );

    // Remove after animation
    setTimeout(() => {
      notifications = notifications.filter(n => n.id !== id);
    }, 200);
  }

  // Format entity type for display
  function formatType(type: string): string {
    switch (type) {
      case 'domain': return 'space';
      case 'person': return 'person';
      case 'project':
      case 'company': return 'project';
      case 'goal': return 'goal';
      case 'focus': return 'focus';
      case 'event': return 'event';
      default: return type;
    }
  }
</script>

{#if notifications.length > 0}
  <div class="notification-panel">
    {#each notifications as notification (notification.id)}
      <div
        class="notification"
        class:dismissing={notification.dismissing}
      >
        <div class="notification-header">
          <span class="check-icon">&#10003;</span>
          <span class="header-text">Added to Canopy</span>
          <button
            class="dismiss-btn"
            onclick={() => dismissNotification(notification.id)}
            title="Dismiss"
          >
            &#10005;
          </button>
        </div>
        <ul class="entity-list">
          {#each notification.entities as entity (entity.name)}
            <li class="entity-item">
              <span class="entity-name">{entity.name}</span>
              <span class="entity-type">({formatType(entity.type)})</span>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
{/if}

<style>
  .notification-panel {
    position: fixed;
    top: 1rem;
    right: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    z-index: 1000;
    max-width: 280px;
    pointer-events: none;
  }

  .notification {
    background: var(--bg-primary, white);
    border: 1px solid var(--accent-green, #10b981);
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    animation: slideInFromRight 0.3s ease-out;
    pointer-events: auto;
  }

  .notification.dismissing {
    animation: slideOutToRight 0.2s ease-out forwards;
  }

  @keyframes slideInFromRight {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes slideOutToRight {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }

  .notification-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .check-icon {
    color: var(--accent-green, #10b981);
    font-weight: bold;
    font-size: 0.875rem;
  }

  .header-text {
    flex: 1;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .dismiss-btn {
    background: none;
    border: none;
    color: var(--text-tertiary, #888);
    cursor: pointer;
    padding: 0.25rem;
    font-size: 0.75rem;
    line-height: 1;
    border-radius: 0.25rem;
    transition: all 0.15s ease;
  }

  .dismiss-btn:hover {
    background: var(--bg-tertiary, #f0f0f0);
    color: var(--text-secondary, #666);
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
    font-weight: 500;
  }

  .entity-type {
    color: var(--text-tertiary, #888);
    font-size: 0.75rem;
  }
</style>
