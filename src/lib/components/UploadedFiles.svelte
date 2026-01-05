<script lang="ts">
  import { uploads, pendingUploads, completedUploads, isImage, type FileUpload } from '$lib/uploads';

  interface Props {
    showSuggestions?: boolean;
  }

  let { showSuggestions = true }: Props = $props();
  
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
    return '📁';
  }
  
  function removeUpload(id: string) {
    uploads.remove(id);
  }
</script>

{#if $pendingUploads.length > 0 || $completedUploads.length > 0}
  <div class="uploaded-files">
    {#each [...$pendingUploads, ...$completedUploads] as upload (upload.id)}
      <div class="file-item" class:processing={upload.status === 'processing'} class:failed={upload.status === 'failed'}>
        <span class="file-icon">{getIcon(upload)}</span>
        
        <div class="file-info">
          <span class="file-name">{upload.filename}</span>
          {#if upload.size > 0}
            <span class="file-size">{formatSize(upload.size)}</span>
          {:else if upload.originalUrl}
            <span class="file-url">{upload.originalUrl}</span>
          {/if}
        </div>
        
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
  
  .file-icon {
    font-size: 18px;
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
