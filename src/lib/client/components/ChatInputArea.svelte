<script lang="ts">
  // ChatInputArea - Unified input component for chat, homepage, and onboarding
  // Handles text input, file uploads, voice input, and submit

  import MentionInput from './MentionInput.svelte';
  import VoiceInput from './VoiceInput.svelte';
  import UploadedFiles from './UploadedFiles.svelte';
  import { uploads, completedUploads, processFile, type FileUpload } from '$lib/client/uploads';
  import type { Entity } from '$lib/client/db/types';

  // Check if there are files to send
  let hasFiles = $derived($completedUploads.length > 0);

  interface Props {
    value: string;
    placeholder?: string;
    disabled?: boolean;
    showMentions?: boolean;
    showVoice?: boolean;
    showFiles?: boolean;
    showUploadedFiles?: boolean;
    compact?: boolean;
    onsubmit?: () => void;
    onfilesAdded?: (files: FileUpload[]) => void;
    onmentionsChange?: (mentions: Entity[]) => void;
    onfileButtonClick?: () => void; // Custom file button handler (for toggle FileDropZone)
    onvoiceError?: (error: string) => void; // Voice error callback
  }

  let {
    value = $bindable(''),
    placeholder = "What's on your mind?",
    disabled = false,
    showMentions = true,
    showVoice = true,
    showFiles = true,
    showUploadedFiles = true,
    compact = false,
    onsubmit,
    onfilesAdded,
    onmentionsChange,
    onfileButtonClick,
    onvoiceError,
  }: Props = $props();

  let fileInputRef: HTMLInputElement;
  let mentionInputRef: MentionInput;
  let textareaEl: HTMLTextAreaElement;

  // Handle file selection
  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (files.length === 0) return;

    const added: FileUpload[] = [];
    for (const file of files) {
      const upload = uploads.add({
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        localPath: '',
        source: 'drop',
        file: file,
      });
      added.push(upload);

      // Start processing (async, don't await)
      processFile(upload).catch(err => {
        console.error(`Failed to process ${file.name}:`, err);
      });
    }

    input.value = '';
    onfilesAdded?.(added);
  }

  // Handle voice input result
  function handleVoiceResult(transcript: string) {
    value = transcript;
    onsubmit?.();
  }

  // Handle voice error
  function handleVoiceError(error: string) {
    console.error('Voice error:', error);
    onvoiceError?.(error);
  }

  // Handle keydown for simple textarea
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onsubmit?.();
    }
  }

  // Auto-resize textarea
  function autoResize() {
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
    }
  }

  $effect(() => {
    value;
    if (!showMentions) {
      autoResize();
    }
  });

  // Export methods
  export function clear() {
    value = '';
    if (mentionInputRef) {
      mentionInputRef.clear();
    }
  }

  export function getMentions(): Entity[] {
    return mentionInputRef?.getMentions() || [];
  }

  export function focus() {
    if (showMentions && mentionInputRef) {
      // MentionInput doesn't expose focus, but the textarea is internal
    } else if (textareaEl) {
      textareaEl.focus();
    }
  }
</script>

<div class="chat-input-area" class:compact>
  {#if showUploadedFiles}
    <UploadedFiles />
  {/if}

  <div class="input-row">
    <!-- Hidden file input -->
    <input
      bind:this={fileInputRef}
      type="file"
      multiple
      class="file-input-hidden"
      onchange={handleFileSelect}
    />

    <!-- File upload button -->
    {#if showFiles}
      <button
        type="button"
        class="input-action"
        title="Attach files"
        {disabled}
        onclick={() => onfileButtonClick ? onfileButtonClick() : fileInputRef?.click()}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </button>
    {/if}

    <!-- Input field -->
    <div class="input-wrapper">
      {#if showMentions}
        <MentionInput
          bind:this={mentionInputRef}
          bind:value
          {placeholder}
          {disabled}
          onsubmit={onsubmit}
          onchange={(val, mentions) => onmentionsChange?.(mentions)}
        />
      {:else}
        <textarea
          bind:this={textareaEl}
          bind:value
          {placeholder}
          {disabled}
          onkeydown={handleKeydown}
          oninput={autoResize}
          rows="1"
          class="simple-input"
        ></textarea>
      {/if}
    </div>

    <!-- Voice input -->
    {#if showVoice}
      <VoiceInput
        {disabled}
        onresult={handleVoiceResult}
        onerror={handleVoiceError}
      />
    {/if}

    <!-- Submit button -->
    <button
      type="button"
      class="submit-btn"
      onclick={onsubmit}
      disabled={disabled || (!value.trim() && !hasFiles)}
      title="Send"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
    </button>
  </div>
</div>

<style>
  .chat-input-area {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .input-row {
    display: flex;
    align-items: flex-end;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    transition: border-color var(--transition-fast);
  }

  .input-row:focus-within {
    border-color: var(--accent);
  }

  .file-input-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .input-wrapper {
    flex: 1;
    min-width: 0;
  }

  .simple-input {
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

  .simple-input::placeholder {
    color: var(--text-muted);
  }

  .simple-input:focus {
    outline: none;
  }

  .simple-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .input-action {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-full);
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .input-action:hover:not(:disabled) {
    color: var(--accent);
    background: var(--accent-muted);
  }

  .input-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .submit-btn {
    width: 40px;
    height: 40px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-full);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all var(--transition-fast);
  }

  .submit-btn:hover:not(:disabled) {
    background: var(--accent-hover);
    transform: scale(1.05);
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Compact mode for homepage */
  .compact .input-row {
    background: var(--card-bg);
    box-shadow: 0 4px 24px var(--card-shadow), 0 0 0 1px rgba(255, 255, 255, 0.1);
  }

  .compact .input-row:focus-within {
    box-shadow: 0 8px 32px var(--card-shadow), 0 0 0 2px var(--accent);
  }
</style>
