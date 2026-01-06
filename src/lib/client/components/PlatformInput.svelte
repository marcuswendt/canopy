<script lang="ts">
  import { persona, platforms, syncPlatform } from '$lib/persona/store';
  import { PLATFORM_CONFIGS, detectPlatformFromUrl, type PlatformType } from '$lib/persona/types';

  interface Props {
    compact?: boolean;
    onplatformAdded?: (data: { id: string; type: PlatformType; handle: string }) => void;
  }

  let { compact = false, onplatformAdded }: Props = $props();

  let urlInput = $state('');
  let detecting = $state(false);
  let error = $state('');
  
  // Suggested platforms (prioritized order)
  const suggestedPlatforms: { type: PlatformType; placeholder: string }[] = [
    { type: 'instagram', placeholder: 'instagram.com/username' },
    { type: 'strava', placeholder: 'strava.com/athletes/12345' },
    { type: 'linkedin', placeholder: 'linkedin.com/in/username' },
    { type: 'website', placeholder: 'yoursite.com' },
  ];
  
  async function handleAddUrl() {
    if (!urlInput.trim()) return;
    
    error = '';
    detecting = true;
    
    try {
      const detected = detectPlatformFromUrl(urlInput);
      
      if (!detected) {
        error = 'Could not detect platform from URL';
        return;
      }
      
      // Add to persona
      const platform = persona.addPlatform(urlInput);
      
      if (platform) {
        onplatformAdded?.({
          id: platform.id,
          type: platform.type,
          handle: platform.handle
        });
        
        // Start syncing in background
        syncPlatform(platform.id);
      }
      
      urlInput = '';
      
    } finally {
      detecting = false;
    }
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddUrl();
    }
  }
  
  function removePlatform(id: string) {
    persona.removePlatform(id);
  }
  
  function toggleScope(id: string) {
    const platform = $platforms.find(p => p.id === id);
    if (platform) {
      persona.setPlatformScope(id, platform.scope === 'personal' ? 'work' : 'personal');
    }
  }
  
  function getIcon(type: PlatformType): string {
    return PLATFORM_CONFIGS[type]?.icon || '🔗';
  }
  
  function formatLastSync(date: Date | null): string {
    if (!date) return 'Not synced';
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }
</script>

<div class="platform-input" class:compact>
  {#if !compact}
    <div class="suggestions">
      <span class="suggestions-label">Add your profiles:</span>
      <div class="suggestion-chips">
        {#each suggestedPlatforms as suggested}
          <button
            class="suggestion-chip"
            class:added={$platforms.some(p => p.type === suggested.type)}
            onclick={() => { urlInput = suggested.placeholder; }}
          >
            {getIcon(suggested.type)} {PLATFORM_CONFIGS[suggested.type].name}
          </button>
        {/each}
      </div>
    </div>
  {/if}
  
  <div class="input-row">
    <input
      type="text"
      placeholder="Paste a profile URL..."
      bind:value={urlInput}
      onkeydown={handleKeydown}
      disabled={detecting}
    />
    <button
      onclick={handleAddUrl}
      disabled={!urlInput.trim() || detecting}
    >
      {detecting ? '...' : 'Add'}
    </button>
  </div>
  
  {#if error}
    <div class="error">{error}</div>
  {/if}
  
  {#if $platforms.length > 0}
    <div class="added-platforms">
      {#each $platforms as platform (platform.id)}
        <div class="platform-item" class:syncing={!platform.connected}>
          <span class="platform-icon">{getIcon(platform.type)}</span>
          
          <div class="platform-info">
            <span class="platform-handle">
              {platform.profile?.name || platform.handle}
            </span>
            <span class="platform-meta">
              {PLATFORM_CONFIGS[platform.type].name}
              {#if platform.lastSync}
                · {formatLastSync(platform.lastSync)}
              {/if}
            </span>
          </div>
          
          <button
            class="scope-toggle"
            class:work={platform.scope === 'work'}
            onclick={() => toggleScope(platform.id)}
            title="Toggle personal/work"
          >
            {platform.scope === 'work' ? '💼' : '👤'}
          </button>

          <button
            class="remove-btn"
            onclick={() => removePlatform(platform.id)}
          >
            ×
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .platform-input {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  
  .platform-input.compact {
    gap: var(--space-sm);
  }
  
  .suggestions {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  
  .suggestions-label {
    font-size: 13px;
    color: var(--text-muted);
  }
  
  .suggestion-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
  
  .suggestion-chip {
    padding: var(--space-xs) var(--space-sm);
    font-size: 12px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  
  .suggestion-chip:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }
  
  .suggestion-chip.added {
    background: var(--domain-family-bg);
    border-color: var(--domain-family);
    color: var(--domain-family);
  }
  
  .input-row {
    display: flex;
    gap: var(--space-sm);
  }
  
  .input-row input {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 14px;
  }
  
  .input-row input::placeholder {
    color: var(--text-muted);
  }
  
  .input-row input:focus {
    outline: none;
    border-color: var(--accent);
  }
  
  .input-row button {
    padding: var(--space-sm) var(--space-lg);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: 14px;
    cursor: pointer;
  }
  
  .input-row button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .error {
    font-size: 12px;
    color: var(--domain-health);
  }
  
  .added-platforms {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  
  .platform-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  
  .platform-item.syncing {
    opacity: 0.7;
  }
  
  .platform-icon {
    font-size: 18px;
    width: 24px;
    text-align: center;
  }
  
  .platform-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  
  .platform-handle {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .platform-meta {
    font-size: 11px;
    color: var(--text-muted);
  }
  
  .scope-toggle {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 14px;
  }
  
  .scope-toggle:hover {
    background: var(--bg-secondary);
  }
  
  .scope-toggle.work {
    background: var(--domain-work-bg);
    border-color: var(--domain-work);
  }
  
  .remove-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 18px;
    border-radius: var(--radius-sm);
  }
  
  .remove-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
</style>
