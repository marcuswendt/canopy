<!-- Data Inspector - Devtools for Canopy internals -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { entities } from '$lib/stores/entities';
  import { pluginStates, allPlugins, integrationSignals } from '$lib/integrations/registry';
  import { registry } from '$lib/integrations/registry';
  import { referenceStates, referencePlugins } from '$lib/reference/registry';
  import {
    getEntities,
    getRecentThreads,
    getMemories,
    getThreadMessages
  } from '$lib/db/client';
  import type { Entity, Thread, Memory, Message } from '$lib/db/types';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  type Tab = 'database' | 'context' | 'integrations' | 'signals';
  let activeTab = $state<Tab>('database');

  // Database data
  let dbEntities = $state<Entity[]>([]);
  let dbThreads = $state<Thread[]>([]);
  let dbMemories = $state<Memory[]>([]);
  let selectedThread = $state<Thread | null>(null);
  let threadMessages = $state<Message[]>([]);

  // Entity view controls
  let entitySearch = $state('');
  let entityViewMode = $state<'grouped' | 'flat'>('grouped');
  let compactMode = $state(true);
  let collapsedGroups = $state<Set<string>>(new Set());

  // Entity type labels for display
  const typeLabels: Record<string, string> = {
    person: 'People',
    project: 'Projects',
    domain: 'Domains',
    concept: 'Concepts',
    event: 'Events',
    goal: 'Goals',
    focus: 'Focus Areas'
  };

  const domainLabels: Record<string, string> = {
    work: 'Work',
    family: 'Family',
    sport: 'Sport',
    personal: 'Personal',
    health: 'Health'
  };

  // Filter entities by search
  let filteredEntities = $derived(
    entitySearch.trim()
      ? dbEntities.filter(e =>
          e.name.toLowerCase().includes(entitySearch.toLowerCase()) ||
          e.type.toLowerCase().includes(entitySearch.toLowerCase()) ||
          e.domain.toLowerCase().includes(entitySearch.toLowerCase())
        )
      : dbEntities
  );

  // Group entities by type
  let entitiesByType = $derived(() => {
    const groups: Record<string, Entity[]> = {};
    for (const entity of filteredEntities) {
      if (!groups[entity.type]) groups[entity.type] = [];
      groups[entity.type].push(entity);
    }
    // Sort by type order
    const typeOrder = ['person', 'project', 'goal', 'focus', 'concept', 'event', 'domain'];
    return typeOrder
      .filter(t => groups[t]?.length > 0)
      .map(type => ({ type, label: typeLabels[type] || type, entities: groups[type] }));
  });

  // Summary stats
  let entityStats = $derived(() => {
    const byType: Record<string, number> = {};
    const byDomain: Record<string, number> = {};
    for (const e of dbEntities) {
      byType[e.type] = (byType[e.type] || 0) + 1;
      byDomain[e.domain] = (byDomain[e.domain] || 0) + 1;
    }
    return { byType, byDomain, total: dbEntities.length };
  });

  // Only show connected reference sources
  let connectedRefPlugins = $derived(
    $referencePlugins.filter(p => $referenceStates.get(p.id)?.connected)
  );

  // Only show signal plugins that have been connected (have synced at least once)
  let connectedSignalPlugins = $derived(
    $allPlugins.filter(p => {
      const state = $pluginStates.get(p.id);
      return state?.connected || state?.lastSync;
    })
  );

  // Context capacity estimation (approximate tokens)
  const MAX_CONTEXT_TOKENS = 128000; // Claude's context window

  let contextCapacity = $derived(() => {
    // Rough token estimates per item type
    const entityTokens = dbEntities.reduce((sum, e) => {
      return sum + 20 + (e.name.length / 4) + ((e.notes?.length || 0) / 4);
    }, 0);

    const memoryTokens = dbMemories.reduce((sum, m) => {
      return sum + 10 + (m.content.length / 4);
    }, 0);

    const signalTokens = $integrationSignals.slice(0, 50).reduce((sum, s) => {
      return sum + 15 + (JSON.stringify(s.data).length / 4);
    }, 0);

    const totalTokens = Math.round(entityTokens + memoryTokens + signalTokens);
    const percentage = Math.min(100, Math.round((totalTokens / MAX_CONTEXT_TOKENS) * 100));

    return {
      used: totalTokens,
      max: MAX_CONTEXT_TOKENS,
      percentage,
      entities: Math.round(entityTokens),
      memories: Math.round(memoryTokens),
      signals: Math.round(signalTokens)
    };
  });

  function toggleGroup(type: string) {
    const next = new Set(collapsedGroups);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    collapsedGroups = next;
  }

  function expandAll() {
    collapsedGroups = new Set();
  }

  function collapseAll() {
    collapsedGroups = new Set(entitiesByType().map(g => g.type));
  }

  async function loadData() {
    try {
      dbEntities = await getEntities();
      dbThreads = await getRecentThreads(20);
      dbMemories = await getMemories(50);
    } catch (err) {
      console.warn('Failed to load inspector data:', err);
    }
  }

  async function selectThread(thread: Thread) {
    selectedThread = thread;
    try {
      threadMessages = await getThreadMessages(thread.id);
    } catch (err) {
      threadMessages = [];
    }
  }

  $effect(() => {
    if (open) {
      loadData();
    }
  });

  function formatDate(date: Date | string | null): string {
    if (!date) return 'N/A';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString();
  }

  function formatJson(obj: any): string {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }

  function truncate(str: string, len: number): string {
    if (str.length <= len) return str;
    return str.substring(0, len) + '...';
  }
</script>

{#if open}
  <div class="inspector-overlay" onclick={onClose}></div>
  <div class="inspector-panel">
    <header class="inspector-header">
      <h2>Data Inspector</h2>
      <button class="close-btn" onclick={onClose}>×</button>
    </header>

    <nav class="inspector-tabs">
      <button
        class="tab"
        class:active={activeTab === 'database'}
        onclick={() => activeTab = 'database'}
      >
        Database
      </button>
      <button
        class="tab"
        class:active={activeTab === 'integrations'}
        onclick={() => activeTab = 'integrations'}
      >
        Integrations
      </button>
      <button
        class="tab"
        class:active={activeTab === 'signals'}
        onclick={() => activeTab = 'signals'}
      >
        Signals
      </button>
      <button
        class="tab"
        class:active={activeTab === 'context'}
        onclick={() => activeTab = 'context'}
      >
        Context
      </button>
    </nav>

    <div class="inspector-content">
      {#if activeTab === 'database'}
        <div class="db-section">
          <div class="section-header">
            <h3>Entities ({dbEntities.length})</h3>
            <div class="view-controls">
              <button
                class="view-btn"
                class:active={entityViewMode === 'grouped'}
                onclick={() => entityViewMode = 'grouped'}
                title="Group by type"
              >
                Grouped
              </button>
              <button
                class="view-btn"
                class:active={entityViewMode === 'flat'}
                onclick={() => entityViewMode = 'flat'}
                title="Flat list"
              >
                Flat
              </button>
              <button
                class="view-btn compact-toggle"
                class:active={compactMode}
                onclick={() => compactMode = !compactMode}
                title="Compact mode"
              >
                Compact
              </button>
            </div>
          </div>

          <!-- Summary stats -->
          <div class="entity-stats">
            <div class="stats-row">
              {#each Object.entries(entityStats().byType) as [type, count]}
                <span class="stat-chip type-{type}">
                  {typeLabels[type] || type}: {count}
                </span>
              {/each}
            </div>
            <div class="stats-row">
              {#each Object.entries(entityStats().byDomain) as [domain, count]}
                <span class="stat-chip domain-{domain}">
                  {domainLabels[domain] || domain}: {count}
                </span>
              {/each}
            </div>
          </div>

          <!-- Search -->
          <div class="entity-search">
            <input
              type="text"
              placeholder="Search entities..."
              bind:value={entitySearch}
              class="search-input"
            />
            {#if entitySearch}
              <span class="search-count">{filteredEntities.length} results</span>
            {/if}
          </div>

          {#if entityViewMode === 'grouped'}
            <!-- Grouped view -->
            <div class="expand-controls">
              <button class="link-btn" onclick={expandAll}>Expand all</button>
              <button class="link-btn" onclick={collapseAll}>Collapse all</button>
            </div>
            <div class="entity-groups" class:compact={compactMode}>
              {#each entitiesByType() as group}
                <div class="entity-group">
                  <button
                    class="group-header"
                    onclick={() => toggleGroup(group.type)}
                  >
                    <span class="collapse-icon">{collapsedGroups.has(group.type) ? '▶' : '▼'}</span>
                    <span class="group-label">{group.label}</span>
                    <span class="group-count">{group.entities.length}</span>
                  </button>
                  {#if !collapsedGroups.has(group.type)}
                    <div class="group-entities">
                      {#each group.entities as entity}
                        <div class="entity-row" class:compact={compactMode}>
                          <span class="entity-name">{entity.name}</span>
                          <span class="entity-domain badge domain-{entity.domain}">{entity.domain}</span>
                          {#if !compactMode}
                            <span class="entity-meta">
                              {entity.mention_count || 0} mentions
                            </span>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <!-- Flat table view -->
            <div class="data-table" class:compact={compactMode}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Domain</th>
                    {#if !compactMode}
                      <th>Mentions</th>
                      <th>Last Active</th>
                    {/if}
                  </tr>
                </thead>
                <tbody>
                  {#each filteredEntities as entity}
                    <tr>
                      <td class="name">{entity.name}</td>
                      <td><span class="badge type">{entity.type}</span></td>
                      <td><span class="badge domain domain-{entity.domain}">{entity.domain}</span></td>
                      {#if !compactMode}
                        <td class="num">{entity.mention_count}</td>
                        <td class="date">{formatDate(entity.last_mentioned)}</td>
                      {/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>

        <div class="db-section">
          <h3>Threads ({dbThreads.length})</h3>
          <div class="thread-list">
            {#each dbThreads as thread}
              <button
                class="thread-item"
                class:selected={selectedThread?.id === thread.id}
                onclick={() => selectThread(thread)}
              >
                <span class="thread-title">{thread.title || 'Untitled'}</span>
                <span class="thread-meta">{thread.message_count} msgs · {formatDate(thread.updated_at)}</span>
              </button>
            {/each}
          </div>
          {#if selectedThread}
            <div class="thread-detail">
              <h4>Messages in "{selectedThread.title}"</h4>
              <div class="messages-list">
                {#each threadMessages as msg}
                  <div class="msg-item" class:assistant={msg.role === 'assistant'}>
                    <span class="msg-role">{msg.role}</span>
                    <span class="msg-content">{truncate(msg.content, 200)}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <div class="db-section">
          <h3>Memories ({dbMemories.length})</h3>
          <div class="data-table">
            <table>
              <thead>
                <tr>
                  <th>Content</th>
                  <th>Source</th>
                  <th>Importance</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {#each dbMemories as memory}
                  <tr>
                    <td class="content">{truncate(memory.content, 100)}</td>
                    <td>{memory.source_type}</td>
                    <td class="num">{(memory.importance * 100).toFixed(0)}%</td>
                    <td class="date">{formatDate(memory.created_at)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {:else if activeTab === 'context'}
        <div class="context-section">
          <h3>Context Window Capacity</h3>
          <div class="capacity-meter">
            <div class="capacity-bar">
              <div
                class="capacity-fill"
                class:low={contextCapacity().percentage < 25}
                class:medium={contextCapacity().percentage >= 25 && contextCapacity().percentage < 75}
                class:high={contextCapacity().percentage >= 75}
                style="width: {contextCapacity().percentage}%"
              ></div>
            </div>
            <div class="capacity-label">
              <span class="capacity-used">{contextCapacity().used.toLocaleString()}</span>
              <span class="capacity-sep">/</span>
              <span class="capacity-max">{contextCapacity().max.toLocaleString()} tokens</span>
              <span class="capacity-pct">({contextCapacity().percentage}%)</span>
            </div>
          </div>
          <div class="capacity-breakdown">
            <div class="breakdown-item">
              <span class="breakdown-label">Entities</span>
              <span class="breakdown-value">{contextCapacity().entities.toLocaleString()} tokens</span>
            </div>
            <div class="breakdown-item">
              <span class="breakdown-label">Memories</span>
              <span class="breakdown-value">{contextCapacity().memories.toLocaleString()} tokens</span>
            </div>
            <div class="breakdown-item">
              <span class="breakdown-label">Signals</span>
              <span class="breakdown-value">{contextCapacity().signals.toLocaleString()} tokens</span>
            </div>
          </div>

          <h3>Current Entity Store</h3>
          <p class="context-info">Entities loaded in memory: {$entities.length}</p>
          <pre class="json-view">{formatJson($entities.slice(0, 10))}</pre>

          <h3>Reference Sources</h3>
          {#if connectedRefPlugins.length > 0}
            <div class="ref-sources">
              {#each connectedRefPlugins as plugin}
                <div class="ref-item">
                  <span class="ref-icon">{plugin.icon}</span>
                  <span class="ref-name">{plugin.name}</span>
                  <span class="ref-status connected">Connected</span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty-state">No reference sources connected yet.</p>
          {/if}
        </div>
      {:else if activeTab === 'integrations'}
        <div class="integrations-section">
          <h3>Connected Integrations</h3>
          {#if connectedSignalPlugins.length > 0}
            {#each connectedSignalPlugins as plugin}
              {@const state = $pluginStates.get(plugin.id)}
              <div class="plugin-row">
                <span class="plugin-icon">{plugin.icon}</span>
                <div class="plugin-info">
                  <span class="plugin-name">{plugin.name}</span>
                </div>
                <div class="plugin-state">
                  <span class="state-badge" class:connected={state?.connected}>
                    {state?.connected ? 'Connected' : 'Paused'}
                  </span>
                </div>
                <div class="plugin-sync">
                  {#if state?.lastSync}
                    <span class="sync-time">Last sync: {formatDate(state.lastSync)}</span>
                  {/if}
                  {#if state?.lastError}
                    <span class="sync-error">{state.lastError}</span>
                  {/if}
                </div>
              </div>
            {/each}
          {:else}
            <p class="empty-state">No integrations connected yet.</p>
          {/if}
        </div>
      {:else if activeTab === 'signals'}
        <div class="signals-section">
          <h3>Recent Signals ({$integrationSignals.length})</h3>
          <p class="signals-info">
            Signals are data points from integrations that inform Ray's context.
          </p>

          {#if $integrationSignals.length === 0}
            <p class="empty-state">No signals captured yet. Connect an integration and sync.</p>
          {:else}
            {#each $integrationSignals.slice(0, 50) as signal}
              <div class="signal-item">
                <div class="signal-header">
                  <span class="signal-source">{signal.source}</span>
                  <span class="signal-type">{signal.type}</span>
                  <span class="signal-time">{formatDate(signal.timestamp)}</span>
                </div>
                <pre class="signal-data">{formatJson(signal.data)}</pre>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    </div>

    <footer class="inspector-footer">
      <button class="refresh-btn" onclick={loadData}>Refresh Data</button>
      <span class="shortcut-hint">Press Cmd+Shift+D to toggle</span>
    </footer>
  </div>
{/if}

<style>
  .inspector-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999;
  }

  .inspector-panel {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    width: 600px;
    max-width: 90vw;
    background: var(--bg-primary);
    border-left: 1px solid var(--border);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
  }

  .inspector-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
  }

  .inspector-header h2 {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
    color: var(--text-primary);
  }

  .close-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    font-size: 20px;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
  }

  .close-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .inspector-tabs {
    display: flex;
    gap: 2px;
    padding: var(--space-sm) var(--space-lg);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }

  .tab {
    padding: var(--space-sm) var(--space-md);
    font-size: 13px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: all 0.15s;
  }

  .tab:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .tab.active {
    background: var(--accent);
    color: white;
  }

  .inspector-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-lg);
  }

  .db-section, .context-section, .integrations-section, .signals-section {
    margin-bottom: var(--space-xl);
  }

  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-md) 0;
  }

  h4 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    margin: var(--space-md) 0 var(--space-sm) 0;
  }

  .data-table {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  th, td {
    text-align: left;
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border);
  }

  th {
    background: var(--bg-secondary);
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.05em;
  }

  td {
    color: var(--text-primary);
  }

  td.name { font-weight: 500; }
  td.num { text-align: center; font-family: 'SF Mono', monospace; }
  td.date { color: var(--text-muted); font-size: 11px; }
  td.content { max-width: 300px; }

  .badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .badge.type {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .badge.domain {
    background: var(--domain-work-bg);
    color: var(--domain-work);
  }

  .thread-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-xs);
  }

  .thread-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: var(--space-sm) var(--space-md);
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }

  .thread-item:hover {
    background: var(--bg-secondary);
  }

  .thread-item.selected {
    background: var(--accent);
    color: white;
  }

  .thread-title {
    font-size: 13px;
    font-weight: 500;
  }

  .thread-meta {
    font-size: 11px;
    color: var(--text-muted);
  }

  .thread-item.selected .thread-meta {
    color: rgba(255, 255, 255, 0.7);
  }

  .thread-detail {
    margin-top: var(--space-md);
    padding: var(--space-md);
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
  }

  .messages-list {
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .msg-item {
    padding: var(--space-sm);
    background: var(--bg-primary);
    border-radius: var(--radius-sm);
  }

  .msg-item.assistant {
    background: var(--bg-tertiary);
  }

  .msg-role {
    font-size: 10px;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-right: var(--space-sm);
  }

  .msg-content {
    font-size: 12px;
    color: var(--text-primary);
  }

  .json-view, .signal-data {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 11px;
    overflow-x: auto;
    white-space: pre-wrap;
    color: var(--text-secondary);
  }

  .context-info, .signals-info {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: var(--space-md);
  }

  .ref-sources {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .ref-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
  }

  .ref-icon { font-size: 18px; }
  .ref-name { flex: 1; font-size: 13px; color: var(--text-primary); }
  .ref-status {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    color: var(--text-muted);
  }
  .ref-status.connected {
    background: var(--domain-family-bg);
    color: var(--domain-family);
  }

  .plugin-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-sm);
  }

  .plugin-icon { font-size: 20px; }

  .plugin-info {
    flex: 1;
    min-width: 0;
  }

  .plugin-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .plugin-id {
    font-size: 11px;
    color: var(--text-muted);
    margin-left: var(--space-xs);
  }

  .plugin-state {
    display: flex;
    gap: var(--space-xs);
  }

  .state-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    color: var(--text-muted);
  }

  .state-badge.enabled, .state-badge.connected {
    background: var(--domain-family-bg);
    color: var(--domain-family);
  }

  .plugin-sync {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .sync-time {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .sync-time.muted {
    color: var(--text-muted);
  }

  .sync-error {
    font-size: 10px;
    color: var(--domain-health);
  }

  .signal-item {
    margin-bottom: var(--space-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .signal-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
  }

  .signal-source {
    font-weight: 600;
    font-size: 12px;
    color: var(--accent);
  }

  .signal-type {
    font-size: 11px;
    padding: 2px 6px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
  }

  .signal-time {
    font-size: 11px;
    color: var(--text-muted);
    margin-left: auto;
  }

  .signal-data {
    margin: 0;
    border: none;
    border-radius: 0;
  }

  .empty-state {
    text-align: center;
    padding: var(--space-xl);
    color: var(--text-muted);
    font-size: 13px;
  }

  .inspector-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
  }

  .refresh-btn {
    padding: var(--space-sm) var(--space-md);
    font-size: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    cursor: pointer;
  }

  .refresh-btn:hover {
    background: var(--bg-tertiary);
  }

  .shortcut-hint {
    font-size: 11px;
    color: var(--text-muted);
  }

  /* Entity section improvements */
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
  }

  .section-header h3 {
    margin: 0;
  }

  .view-controls {
    display: flex;
    gap: 4px;
  }

  .view-btn {
    padding: 4px 8px;
    font-size: 11px;
    border: 1px solid var(--border);
    background: var(--bg-primary);
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
  }

  .view-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .view-btn.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .entity-stats {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-bottom: var(--space-md);
    padding: var(--space-sm);
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
  }

  .stats-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .stat-chip {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .stat-chip.type-person { background: #e3f2fd; color: #1565c0; }
  .stat-chip.type-project { background: #f3e5f5; color: #7b1fa2; }
  .stat-chip.type-concept { background: #fff3e0; color: #ef6c00; }
  .stat-chip.type-goal { background: #e8f5e9; color: #2e7d32; }
  .stat-chip.type-focus { background: #fce4ec; color: #c2185b; }
  .stat-chip.type-event { background: #e0f7fa; color: #00838f; }
  .stat-chip.type-domain { background: var(--bg-tertiary); color: var(--text-secondary); }

  .stat-chip.domain-work { background: var(--domain-work-bg, #e3f2fd); color: var(--domain-work, #1565c0); }
  .stat-chip.domain-family { background: var(--domain-family-bg, #e8f5e9); color: var(--domain-family, #2e7d32); }
  .stat-chip.domain-sport { background: var(--domain-sport-bg, #fff3e0); color: var(--domain-sport, #ef6c00); }
  .stat-chip.domain-personal { background: var(--domain-personal-bg, #f3e5f5); color: var(--domain-personal, #7b1fa2); }
  .stat-chip.domain-health { background: var(--domain-health-bg, #fce4ec); color: var(--domain-health, #c2185b); }

  .entity-search {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .search-input {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    font-size: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .search-count {
    font-size: 11px;
    color: var(--text-muted);
  }

  .expand-controls {
    display: flex;
    gap: var(--space-md);
    margin-bottom: var(--space-sm);
  }

  .link-btn {
    font-size: 11px;
    color: var(--accent);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .link-btn:hover {
    text-decoration: underline;
  }

  .entity-groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .entity-group {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: 12px;
    color: var(--text-primary);
  }

  .group-header:hover {
    background: var(--bg-tertiary);
  }

  .collapse-icon {
    font-size: 10px;
    color: var(--text-muted);
    width: 12px;
  }

  .group-label {
    font-weight: 600;
    flex: 1;
  }

  .group-count {
    font-size: 11px;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .group-entities {
    display: flex;
    flex-direction: column;
    padding: var(--space-xs);
  }

  .entity-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
  }

  .entity-row:hover {
    background: var(--bg-secondary);
  }

  .entity-row.compact {
    padding: 4px var(--space-md);
  }

  .entity-name {
    flex: 1;
    font-size: 12px;
    color: var(--text-primary);
  }

  .entity-domain {
    font-size: 9px;
  }

  .entity-meta {
    font-size: 10px;
    color: var(--text-muted);
  }

  /* Domain-specific badge colors */
  .badge.domain-work { background: var(--domain-work-bg, #e3f2fd); color: var(--domain-work, #1565c0); }
  .badge.domain-family { background: var(--domain-family-bg, #e8f5e9); color: var(--domain-family, #2e7d32); }
  .badge.domain-sport { background: var(--domain-sport-bg, #fff3e0); color: var(--domain-sport, #ef6c00); }
  .badge.domain-personal { background: var(--domain-personal-bg, #f3e5f5); color: var(--domain-personal, #7b1fa2); }
  .badge.domain-health { background: var(--domain-health-bg, #fce4ec); color: var(--domain-health, #c2185b); }

  .data-table.compact th,
  .data-table.compact td {
    padding: 4px var(--space-sm);
  }

  .entity-groups.compact .entity-row {
    padding: 3px var(--space-md);
  }

  /* Context capacity meter */
  .capacity-meter {
    margin-bottom: var(--space-lg);
  }

  .capacity-bar {
    height: 12px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
    overflow: hidden;
    margin-bottom: var(--space-sm);
  }

  .capacity-fill {
    height: 100%;
    border-radius: var(--radius-md);
    transition: width 0.3s ease;
  }

  .capacity-fill.low {
    background: linear-gradient(90deg, #4ade80, #22c55e);
  }

  .capacity-fill.medium {
    background: linear-gradient(90deg, #facc15, #f59e0b);
  }

  .capacity-fill.high {
    background: linear-gradient(90deg, #f87171, #ef4444);
  }

  .capacity-label {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 12px;
  }

  .capacity-used {
    font-weight: 600;
    color: var(--text-primary);
  }

  .capacity-sep {
    color: var(--text-muted);
  }

  .capacity-max {
    color: var(--text-secondary);
  }

  .capacity-pct {
    color: var(--text-muted);
    margin-left: auto;
  }

  .capacity-breakdown {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-md);
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-lg);
  }

  .breakdown-item {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }

  .breakdown-label {
    color: var(--text-secondary);
  }

  .breakdown-value {
    color: var(--text-primary);
    font-family: 'SF Mono', Consolas, monospace;
  }
</style>
