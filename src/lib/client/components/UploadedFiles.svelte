<script lang="ts">
  import { uploads, pendingUploads, completedUploads, isImage, type FileUpload } from '$lib/client/uploads';
  import Markdown from './Markdown.svelte';

  interface Props {
    showSuggestions?: boolean;
  }

  let { showSuggestions = true }: Props = $props();

  // Track which markdown files are expanded
  let expandedPreviews = $state<Set<string>>(new Set());

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getIcon(upload: FileUpload): string {
    if (upload.source === 'url') return '🔗';
    if (isImage(upload.mimeType)) return '📷';
    if (upload.mimeType.includes('pdf')) return '📕';
    if (upload.mimeType.includes('word') || upload.mimeType.includes('document')) return '📄';
    if (upload.mimeType.includes('sheet') || upload.mimeType.includes('csv')) return '📊';
    if (upload.filename.endsWith('.md') || upload.mimeType === 'text/markdown') return '📝';
    return '📁';
  }

  function isMarkdownFile(upload: FileUpload): boolean {
    return upload.filename.endsWith('.md') || upload.mimeType === 'text/markdown';
  }

  function togglePreview(id: string) {
    if (expandedPreviews.has(id)) {
      expandedPreviews.delete(id);
    } else {
      expandedPreviews.add(id);
    }
    expandedPreviews = expandedPreviews; // trigger reactivity
  }

  function removeUpload(id: string) {
    uploads.remove(id);
  }
</script>

{#if $pendingUploads.length > 0 || $completedUploads.length > 0}
  <div class="uploaded-files">
    {#each [...$pendingUploads, ...$completedUploads] as upload (upload.id)}
      <div class="file-item" class:processing={upload.status === 'processing'} class:failed={upload.status === 'failed'}>
        {#if isImage(upload.mimeType) && upload.dataUrl}
          <img src={upload.dataUrl} alt={upload.filename} class="file-thumbnail" />
        {:else}
          <span class="file-icon">{getIcon(upload)}</span>
        {/if}

        <div class="file-info">
          <span class="file-name">{upload.filename}</span>
          {#if upload.size > 0}
            <span class="file-size">{formatSize(upload.size)}</span>
          {:else if upload.originalUrl}
            <span class="file-url">{upload.originalUrl}</span>
          {/if}
        </div>

        <div class="file-actions">
          {#if isMarkdownFile(upload) && upload.textContent}
            <button
              class="preview-btn"
              class:expanded={expandedPreviews.has(upload.id)}
              onclick={() => togglePreview(upload.id)}
              title={expandedPreviews.has(upload.id) ? 'Hide preview' : 'Show preview'}
            >
              {expandedPreviews.has(upload.id) ? '▼' : '▶'}
            </button>
          {/if}

          <div class="file-status">
            {#if upload.status === 'processing'}
              <span class="status processing">Processing...</span>
            {:else if upload.status === 'complete'}
              <span class="status complete">✓</span>
            {:else if upload.status === 'failed'}
              <span class="status failed">Failed</span>
            {/if}
          </div>

          <button class="remove-btn" onclick={() => removeUpload(upload.id)}>×</button>
        </div>
      </div>

      {#if isMarkdownFile(upload) && upload.textContent && expandedPreviews.has(upload.id)}
        <div class="markdown-preview">
          <Markdown content={upload.textContent} />
        </div>
      {/if}

      {#if showSuggestions && upload.status === 'complete' && upload.extracted?.entities?.length}
        <div class="extracted-entities">
          <span class="extracted-label">Found:</span>
          {#each upload.extracted.entities as entity}
            <span class="entity-chip" data-type={entity.type}>
              {entity.name}
              {#if entity.confidence < 0.8}
                <span class="confidence">?</span>
              {/if}
            </span>
          {/each}
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .uploaded-files {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  
  .file-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }
  
  .file-item.processing {
    opacity: 0.7;
  }
  
  .file-item.failed {
    border-color: var(--domain-health);
    background: var(--domain-health-bg);
  }

  .file-actions {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex-shrink: 0;
  }

  .preview-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: var(--bg-tertiary);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 10px;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .preview-btn:hover {
    background: var(--accent-muted);
    color: var(--accent);
  }

  .preview-btn.expanded {
    background: var(--accent-muted);
    color: var(--accent);
  }

  .markdown-preview {
    padding: var(--space-md);
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    margin-top: -1px;
    max-height: 300px;
    overflow-y: auto;
    font-size: 13px;
  }

  .markdown-preview :global(.markdown) {
    font-size: 13px;
  }

  .markdown-preview :global(h1) {
    font-size: 18px;
    margin-top: 0;
  }

  .markdown-preview :global(h2) {
    font-size: 16px;
  }

  .markdown-preview :global(h3) {
    font-size: 14px;
  }

  .file-icon {
    font-size: 18px;
    flex-shrink: 0;
  }

  .file-thumbnail {
    width: 32px;
    height: 32px;
    object-fit: cover;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }
  
  .file-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  
  .file-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .file-size,
  .file-url {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .file-status {
    flex-shrink: 0;
  }
  
  .status {
    font-size: 12px;
  }
  
  .status.processing {
    color: var(--domain-work);
  }
  
  .status.complete {
    color: var(--domain-family);
  }
  
  .status.failed {
    color: var(--domain-health);
  }
  
  .remove-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 16px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }
  
  .remove-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
  
  .extracted-entities {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-md);
    padding-left: calc(var(--space-md) + 18px + var(--space-sm));
    margin-top: -4px;
  }
  
  .extracted-label {
    font-size: 11px;
    color: var(--text-muted);
    margin-right: var(--space-xs);
  }
  
  .entity-chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 8px;
    font-size: 11px;
    border-radius: var(--radius-full);
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }
  
  .entity-chip[data-type="person"] {
    background: var(--domain-family-bg);
    color: var(--domain-family);
  }
  
  .entity-chip[data-type="company"],
  .entity-chip[data-type="project"] {
    background: var(--domain-work-bg);
    color: var(--domain-work);
  }
  
  .confidence {
    opacity: 0.6;
    font-size: 10px;
  }
</style>
