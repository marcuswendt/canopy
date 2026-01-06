<script lang="ts">
  import { artifacts, updateArtifact, getArtifactsForEntities } from '$lib/client/stores/artifacts';
  import type { Artifact, Entity } from '$lib/client/db/types';
  import DomainBadge from './DomainBadge.svelte';

  interface Props {
    contextEntities: Entity[];
    onclose?: () => void;
  }

  let { contextEntities, onclose }: Props = $props();

  // Current artifact being viewed
  let selectedArtifact = $state<Artifact | null>(null);
  let isEditing = $state(false);
  let editContent = $state('');

  // Get artifacts relevant to context entities
  let relevantArtifacts = $derived(
    getArtifactsForEntities(
      contextEntities.map(e => e.id),
      $artifacts
    )
  );

  // Also show pinned artifacts
  let pinnedArtifacts = $derived(
    $artifacts.filter(a => a.pinned && !relevantArtifacts.find(r => r.id === a.id))
  );

  // Combined list with relevants first
  let displayArtifacts = $derived([...relevantArtifacts, ...pinnedArtifacts]);

  function selectArtifact(artifact: Artifact) {
    selectedArtifact = artifact;
    isEditing = false;
  }

  function startEditing() {
    if (selectedArtifact) {
      editContent = selectedArtifact.content;
      isEditing = true;
    }
  }

  function saveEdit() {
    if (selectedArtifact) {
      updateArtifact(selectedArtifact.id, { content: editContent });
      selectedArtifact = { ...selectedArtifact, content: editContent };
      isEditing = false;
    }
  }

  function cancelEdit() {
    isEditing = false;
    editContent = '';
  }

  function togglePin(artifact: Artifact) {
    updateArtifact(artifact.id, { pinned: !artifact.pinned });
  }

  function getTypeIcon(type: Artifact['type']): string {
    const icons: Record<Artifact['type'], string> = {
      plan: '📋',
      note: '📝',
      document: '📄',
      code: '💻',
      checklist: '✅',
    };
    return icons[type];
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Simple markdown-like rendering
  function renderContent(content: string): string {
    return content
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- \[ \] (.+)$/gm, '<div class="checklist-item"><span class="checkbox"></span>$1</div>')
      .replace(/^- \[x\] (.+)$/gm, '<div class="checklist-item checked"><span class="checkbox checked"></span>$1</div>')
      .replace(/^- (.+)$/gm, '<div class="list-item">$1</div>')
      .replace(/^\d+\. (.+)$/gm, '<div class="list-item numbered">$1</div>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
  }
</script>

<div class="artifact-panel">
  {#if selectedArtifact}
    <!-- Artifact View -->
    <div class="artifact-view">
      <header class="artifact-header">
        <button class="back-btn" onclick={() => selectedArtifact = null}>
          ← Back
        </button>
        <div class="artifact-actions">
          <button
            class="action-btn"
            class:active={selectedArtifact.pinned}
            onclick={() => togglePin(selectedArtifact!)}
            title={selectedArtifact.pinned ? 'Unpin' : 'Pin to context'}
          >
            📌
          </button>
          {#if !isEditing}
            <button class="action-btn" onclick={startEditing} title="Edit">
              ✏️
            </button>
          {/if}
        </div>
      </header>

      <div class="artifact-title-row">
        <span class="artifact-type-icon">{getTypeIcon(selectedArtifact.type)}</span>
        <h2 class="artifact-title">{selectedArtifact.title}</h2>
      </div>

      <div class="artifact-meta">
        <span class="meta-date">Updated {formatDate(selectedArtifact.updated_at)}</span>
      </div>

      {#if isEditing}
        <div class="artifact-editor">
          <textarea
            bind:value={editContent}
            class="edit-textarea"
          ></textarea>
          <div class="edit-actions">
            <button class="save-btn" onclick={saveEdit}>Save</button>
            <button class="cancel-btn" onclick={cancelEdit}>Cancel</button>
          </div>
        </div>
      {:else}
        <div class="artifact-content">
          {@html renderContent(selectedArtifact.content)}
        </div>
      {/if}
    </div>
  {:else}
    <!-- Artifact List -->
    <header class="panel-header">
      <h3 class="panel-title">Artifacts</h3>
      {#if onclose}
        <button class="close-btn" onclick={onclose}>×</button>
      {/if}
    </header>

    {#if displayArtifacts.length > 0}
      <div class="artifact-list">
        {#if relevantArtifacts.length > 0}
          <div class="artifact-section">
            <span class="section-label">Related to this conversation</span>
            {#each relevantArtifacts as artifact}
              <button class="artifact-card" onclick={() => selectArtifact(artifact)}>
                <div class="card-header">
                  <span class="card-icon">{getTypeIcon(artifact.type)}</span>
                  <span class="card-title">{artifact.title}</span>
                  {#if artifact.pinned}
                    <span class="pin-indicator">📌</span>
                  {/if}
                </div>
                <div class="card-preview">
                  {artifact.content.slice(0, 80)}...
                </div>
                <div class="card-meta">
                  <span class="card-date">{formatDate(artifact.updated_at)}</span>
                </div>
              </button>
            {/each}
          </div>
        {/if}

        {#if pinnedArtifacts.length > 0}
          <div class="artifact-section">
            <span class="section-label">Pinned</span>
            {#each pinnedArtifacts as artifact}
              <button class="artifact-card" onclick={() => selectArtifact(artifact)}>
                <div class="card-header">
                  <span class="card-icon">{getTypeIcon(artifact.type)}</span>
                  <span class="card-title">{artifact.title}</span>
                  <span class="pin-indicator">📌</span>
                </div>
                <div class="card-preview">
                  {artifact.content.slice(0, 80)}...
                </div>
                <div class="card-meta">
                  <span class="card-date">{formatDate(artifact.updated_at)}</span>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="empty-state">
        <p>No artifacts yet.</p>
        <p class="empty-hint">
          Artifacts will appear here when you mention related entities,
          or you can pin important documents.
        </p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .artifact-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md);
    border-bottom: 1px solid var(--border);
  }

  .panel-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin: 0;
  }

  .close-btn {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }

  .close-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .artifact-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-sm);
  }

  .artifact-section {
    margin-bottom: var(--space-md);
  }

  .section-label {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    padding: var(--space-xs) var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .artifact-card {
    display: block;
    width: 100%;
    padding: var(--space-sm);
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-xs);
    cursor: pointer;
    text-align: left;
    transition: all var(--transition-fast);
  }

  .artifact-card:hover {
    border-color: var(--accent);
    background: var(--bg-tertiary);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-bottom: var(--space-xs);
  }

  .card-icon {
    font-size: 14px;
  }

  .card-title {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pin-indicator {
    font-size: 10px;
    opacity: 0.6;
  }

  .card-preview {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-meta {
    margin-top: var(--space-xs);
  }

  .card-date {
    font-size: 10px;
    color: var(--text-muted);
  }

  .empty-state {
    padding: var(--space-lg);
    text-align: center;
  }

  .empty-state p {
    font-size: 13px;
    color: var(--text-muted);
    margin: 0;
  }

  .empty-hint {
    margin-top: var(--space-sm) !important;
    font-size: 12px !important;
    line-height: 1.4;
  }

  /* Artifact View */
  .artifact-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .artifact-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border);
  }

  .back-btn {
    padding: var(--space-xs) var(--space-sm);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }

  .back-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .artifact-actions {
    display: flex;
    gap: var(--space-xs);
  }

  .action-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    font-size: 14px;
    cursor: pointer;
    border-radius: var(--radius-sm);
    opacity: 0.6;
    transition: all var(--transition-fast);
  }

  .action-btn:hover,
  .action-btn.active {
    background: var(--bg-tertiary);
    opacity: 1;
  }

  .artifact-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md);
    padding-bottom: 0;
  }

  .artifact-type-icon {
    font-size: 20px;
  }

  .artifact-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .artifact-meta {
    padding: var(--space-xs) var(--space-md);
  }

  .meta-date {
    font-size: 11px;
    color: var(--text-muted);
  }

  .artifact-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-primary);
  }

  .artifact-content :global(h1) {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 var(--space-md) 0;
    color: var(--text-primary);
  }

  .artifact-content :global(h2) {
    font-size: 14px;
    font-weight: 600;
    margin: var(--space-md) 0 var(--space-sm) 0;
    color: var(--text-primary);
  }

  .artifact-content :global(h3) {
    font-size: 13px;
    font-weight: 600;
    margin: var(--space-sm) 0 var(--space-xs) 0;
    color: var(--text-secondary);
  }

  .artifact-content :global(.list-item) {
    padding-left: var(--space-md);
    position: relative;
    margin: var(--space-xs) 0;
  }

  .artifact-content :global(.list-item)::before {
    content: '•';
    position: absolute;
    left: 0;
    color: var(--text-muted);
  }

  .artifact-content :global(.checklist-item) {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    margin: var(--space-xs) 0;
  }

  .artifact-content :global(.checkbox) {
    width: 14px;
    height: 14px;
    border: 1.5px solid var(--border);
    border-radius: 3px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .artifact-content :global(.checkbox.checked) {
    background: var(--accent);
    border-color: var(--accent);
  }

  .artifact-content :global(.checkbox.checked)::after {
    content: '✓';
    color: white;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .artifact-content :global(.checklist-item.checked) {
    color: var(--text-muted);
    text-decoration: line-through;
  }

  /* Editor */
  .artifact-editor {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: var(--space-md);
    gap: var(--space-md);
  }

  .edit-textarea {
    flex: 1;
    width: 100%;
    padding: var(--space-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 13px;
    font-family: 'SF Mono', Consolas, monospace;
    line-height: 1.5;
    resize: none;
  }

  .edit-textarea:focus {
    outline: none;
    border-color: var(--accent);
  }

  .edit-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: flex-end;
  }

  .save-btn,
  .cancel-btn {
    padding: var(--space-sm) var(--space-md);
    border: none;
    border-radius: var(--radius-md);
    font-size: 13px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .save-btn {
    background: var(--accent);
    color: white;
  }

  .save-btn:hover {
    background: var(--accent-hover);
  }

  .cancel-btn {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
  }

  .cancel-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
</style>
