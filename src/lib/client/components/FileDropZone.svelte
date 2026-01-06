<script lang="ts">
  import { uploads, processFile, fetchUrl, isUrl, getMimeType, type FileUpload } from '$lib/client/uploads';

  interface Props {
    acceptedTypes?: string[];
    maxFiles?: number;
    allowUrls?: boolean;
    compact?: boolean;
    onfilesAdded?: (files: FileUpload[]) => void;
    onurlFetched?: (data: { url: string; content: any }) => void;
  }

  let {
    acceptedTypes = ['*'],
    maxFiles = 10,
    allowUrls = true,
    compact = false,
    onfilesAdded,
    onurlFetched,
  }: Props = $props();

  let dragOver = $state(false);
  let urlInput = $state('');
  let processing = $state(false);
  
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }
  
  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
  }
  
  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) {
      await addFiles(files);
    }
    
    // Check for dropped text/URLs
    const text = e.dataTransfer?.getData('text/plain');
    if (text && isUrl(text)) {
      await handleUrl(text);
    }
  }
  
  async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (files.length > 0) {
      await addFiles(files);
    }
    input.value = '';
  }
  
  async function handlePaste(e: ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items || []);
    const files: File[] = [];
    
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      } else if (item.kind === 'string' && item.type === 'text/plain') {
        item.getAsString(async (text) => {
          if (isUrl(text)) {
            await handleUrl(text);
          }
        });
      }
    }
    
    if (files.length > 0) {
      await addFiles(files);
    }
  }
  
  async function addFiles(files: File[]) {
    const limited = files.slice(0, maxFiles);
    const added: FileUpload[] = [];

    for (const file of limited) {
      const upload = uploads.add({
        filename: file.name,
        mimeType: file.type || getMimeType(file.name),
        size: file.size,
        localPath: '', // Would be set after saving to ~/.canopy/uploads/
        source: 'drop',
        file: file,    // Store the actual File object for processing
      });
      added.push(upload);

      // Start processing (async, don't await)
      processFile(upload).catch(err => {
        console.error(`Failed to process ${file.name}:`, err);
      });
    }

    onfilesAdded?.(added);
  }
  
  async function handleUrl(url: string) {
    processing = true;
    
    try {
      const content = await fetchUrl(url);
      
      // Create a "file" entry for the URL
      const upload = uploads.add({
        filename: new URL(url).hostname,
        mimeType: 'text/html',
        size: 0,
        localPath: '',
        source: 'url',
        originalUrl: url,
      });
      
      uploads.setExtracted(upload.id, content);
      onurlFetched?.({ url, content });
      
    } catch (error) {
      console.error('Failed to fetch URL:', error);
    } finally {
      processing = false;
      urlInput = '';
    }
  }
  
  async function handleUrlSubmit() {
    if (!urlInput.trim()) return;
    if (isUrl(urlInput)) {
      await handleUrl(urlInput);
    }
  }
</script>

<svelte:window onpaste={handlePaste} />

<div
  class="dropzone"
  class:compact
  class:dragOver
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  role="region"
  aria-label="File upload area"
>
  <input
    type="file"
    multiple
    accept={acceptedTypes.join(',')}
    onchange={handleFileSelect}
    class="file-input"
    id="file-upload"
  />
  
  {#if compact}
    <label for="file-upload" class="compact-label">
      <span class="icon">📎</span>
      <span>Add files</span>
    </label>
  {:else}
    <div class="dropzone-content">
      <div class="icon-large">📁</div>
      <p class="primary-text">
        Drop files here, paste, or <label for="file-upload" class="browse-link">browse</label>
      </p>
      <p class="secondary-text">
        Any file type supported
      </p>
      
      {#if allowUrls}
        <div class="url-input">
          <input
            type="text"
            placeholder="Or paste a URL..."
            bind:value={urlInput}
            onkeydown={(e) => e.key === 'Enter' && handleUrlSubmit()}
          />
          {#if urlInput}
            <button onclick={handleUrlSubmit} disabled={processing}>
              {processing ? '...' : '→'}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .dropzone {
    border: 2px dashed var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-xl);
    text-align: center;
    transition: all var(--transition-fast);
    background: var(--bg-tertiary);
  }
  
  .dropzone.compact {
    padding: var(--space-sm);
    border-style: solid;
  }
  
  .dropzone.dragOver {
    border-color: var(--accent);
    background: rgba(16, 185, 129, 0.1);
  }
  
  .file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    overflow: hidden;
  }
  
  .dropzone-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
  }
  
  .icon-large {
    font-size: 48px;
    opacity: 0.5;
  }
  
  .primary-text {
    font-size: 15px;
    color: var(--text-primary);
  }
  
  .secondary-text {
    font-size: 13px;
    color: var(--text-muted);
  }
  
  .browse-link {
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
  }
  
  .browse-link:hover {
    color: var(--accent-hover);
  }
  
  .url-input {
    display: flex;
    gap: var(--space-xs);
    margin-top: var(--space-md);
    width: 100%;
    max-width: 300px;
  }
  
  .url-input input {
    flex: 1;
    padding: var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 13px;
  }
  
  .url-input input::placeholder {
    color: var(--text-muted);
  }
  
  .url-input button {
    padding: var(--space-sm) var(--space-md);
    border: none;
    background: var(--accent);
    color: white;
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  
  .url-input button:disabled {
    opacity: 0.5;
  }
  
  .compact-label {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 13px;
  }
  
  .compact-label:hover {
    color: var(--text-primary);
  }
  
  .icon {
    font-size: 16px;
  }
</style>
