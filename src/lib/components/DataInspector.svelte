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
        class:active={activeTab === 'context'}
        onclick={() => activeTab = 'context'}
      >
        AI Context
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
    </nav>

    <div class="inspector-content">
      {#if activeTab === 'database'}
        <div class="db-section">
          <h3>Entities ({dbEntities.length})</h3>
          <div class="data-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Domain</th>
                  <th>Mentions</th>
                  <th>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {#each dbEntities as entity}
                  <tr>
                    <td class="name">{entity.name}</td>
                    <td><span class="badge type">{entity.type}</span></td>
                    <td><span class="badge domain">{entity.domain}</span></td>
                    <td class="num">{entity.mention_count}</td>
                    <td class="date">{formatDate(entity.last_mentioned)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
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
          <h3>Current Entity Store</h3>
          <p class="context-info">Entities loaded in memory: {$entities.length}</p>
          <pre class="json-view">{formatJson($entities.slice(0, 10))}</pre>

          <h3>Reference Sources</h3>
          <div class="ref-sources">
            {#each $referencePlugins as plugin}
              {@const state = $referenceStates.get(plugin.id)}
              <div class="ref-item">
                <span class="ref-icon">{plugin.icon}</span>
                <span class="ref-name">{plugin.name}</span>
                <span class="ref-status" class:connected={state?.connected}>
                  {state?.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {:else if activeTab === 'integrations'}
        <div class="integrations-section">
          <h3>Signal Plugins</h3>
          {#each $allPlugins as plugin}
            {@const state = $pluginStates.get(plugin.id)}
            <div class="plugin-row">
              <span class="plugin-icon">{plugin.icon}</span>
              <div class="plugin-info">
                <span class="plugin-name">{plugin.name}</span>
                <span class="plugin-id">({plugin.id})</span>
              </div>
              <div class="plugin-state">
                <span class="state-badge" class:enabled={state?.enabled}>
                  {state?.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <span class="state-badge" class:connected={state?.connected}>
                  {state?.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div class="plugin-sync">
                {#if state?.lastSync}
                  <span class="sync-time">Last sync: {formatDate(state.lastSync)}</span>
                {:else}
                  <span class="sync-time muted">Never synced</span>
                {/if}
                {#if state?.lastError}
                  <span class="sync-error">{state.lastError}</span>
                {/if}
              </div>
            </div>
          {/each}

          <h3>Reference Plugins</h3>
          {#each $referencePlugins as plugin}
            {@const state = $referenceStates.get(plugin.id)}
            <div class="plugin-row">
              <span class="plugin-icon">{plugin.icon}</span>
              <div class="plugin-info">
                <span class="plugin-name">{plugin.name}</span>
                <span class="plugin-id">({plugin.id})</span>
              </div>
              <div class="plugin-state">
                <span class="state-badge" class:connected={state?.connected}>
                  {state?.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          {/each}
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
</style>
