<script lang="ts">
  import { goto } from '$app/navigation';
  import { theme, formatTimeAgo } from '$lib/client/stores/ui';
  import { entitiesByRecency } from '$lib/client/stores/entities';
  import { getRecencyScore } from '$lib/client/db/client';
  import DomainBadge from '$lib/client/components/DomainBadge.svelte';

  let inputValue = $state('');
  let inputFocused = $state(false);

  let recentItems = $derived($entitiesByRecency.slice(0, 5));

  function handleSubmit() {
    if (!inputValue.trim()) return;
    goto(`/chat?q=${encodeURIComponent(inputValue)}`);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }
</script>

<div class="home-container">
  <!-- Background -->
  <div class="background">
    {#if $theme === 'day'}
      <img
        src="/images/canopy-day.jpg"
        alt=""
        class="background-image"
        onerror={(e: Event) => (e.currentTarget as HTMLImageElement).style.display = 'none'}
      />
      <div class="background-fallback day"></div>
    {:else if $theme === 'twilight'}
      <div class="background-gradient twilight"></div>
    {:else}
      <div class="background-gradient dark"></div>
    {/if}
    <div class="background-overlay" class:focused={inputFocused}></div>
  </div>
  
  <!-- Content -->
  <div class="home-content">
    <div class="input-area" class:focused={inputFocused}>
      <div class="greeting">
        {getGreeting()}, Marcus
      </div>
      
      <div class="input-container">
        <input
          type="text"
          placeholder="What's on your mind?"
          bind:value={inputValue}
          onfocus={() => inputFocused = true}
          onblur={() => inputFocused = false}
          onkeydown={handleKeydown}
          class="main-input"
        />
        
        <div class="input-actions">
          <button class="input-action" title="Attach file">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <button class="input-action" title="Voice input">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
            </svg>
          </button>
        </div>
      </div>
      
      <!-- Quick suggestions -->
      {#if inputFocused && !inputValue}
        <div class="suggestions animate-slide-up">
          <button class="suggestion" onmousedown={() => inputValue = "What should I focus on today?"}>
            Daily focus
          </button>
          <button class="suggestion" onmousedown={() => inputValue = "What's coming up this week?"}>
            Weekly overview
          </button>
          <button class="suggestion" onmousedown={() => inputValue = "How am I doing on my priorities?"}>
            Priority check
          </button>
        </div>
      {/if}
    </div>
    
    <!-- Recent Activity -->
    <div class="recent-activity" class:dimmed={inputFocused}>
      <h3 class="recent-title">Recent</h3>
      <div class="recent-items">
        {#each recentItems as item}
          {@const recency = getRecencyScore(item.last_mentioned)}
          <button
            class="recent-item"
            style="opacity: {0.5 + recency * 0.5}"
            onclick={() => goto(`/chat?entity=${item.id}`)}
          >
            <div class="item-indicator" data-domain={item.domain}></div>
            <div class="item-content">
              <span class="item-name">{item.name}</span>
              <span class="item-meta">
                <DomainBadge domain={item.domain} small />
                <span class="item-time">{formatTimeAgo(item.last_mentioned || item.updated_at)}</span>
              </span>
            </div>
          </button>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .home-container {
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  /* Background */
  .background {
    position: absolute;
    inset: 0;
    z-index: 0;
  }
  
  .background-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    position: absolute;
    inset: 0;
  }
  
  .background-fallback {
    width: 100%;
    height: 100%;
    position: absolute;
    inset: 0;
  }
  
  .background-fallback.day,
  .background-gradient.twilight,
  .background-gradient.dark {
    background: linear-gradient(
      180deg,
      var(--gradient-sky) 0%,
      var(--gradient-mid) 30%,
      var(--gradient-low) 60%,
      var(--gradient-ground) 100%
    );
  }

  .background-gradient {
    width: 100%;
    height: 100%;
  }
  
  .background-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(0px);
    transition: all var(--transition-slow);
  }
  
  .background-overlay.focused {
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
  }
  
  /* Content */
  .home-content {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 560px;
    padding: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }
  
  /* Input Area */
  .input-area {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    transition: transform var(--transition-base);
  }
  
  .input-area.focused {
    transform: translateY(-16px);
  }
  
  .greeting {
    text-align: center;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 500;
  }
  
  .input-container {
    position: relative;
    display: flex;
    align-items: center;
  }
  
  .main-input {
    width: 100%;
    padding: var(--space-md) var(--space-lg);
    padding-right: 88px;
    font-size: 16px;
    border: none;
    border-radius: var(--radius-lg);
    background: var(--card-bg);
    color: var(--text-primary);
    box-shadow:
      0 4px 24px var(--card-shadow),
      0 0 0 1px rgba(255, 255, 255, 0.1);
    transition: all var(--transition-base);
  }

  .main-input::placeholder {
    color: var(--text-muted);
  }

  .main-input:focus {
    outline: none;
    box-shadow:
      0 8px 32px var(--card-shadow),
      0 0 0 2px var(--accent);
  }
  
  .input-actions {
    position: absolute;
    right: var(--space-sm);
    display: flex;
    gap: 2px;
  }
  
  .input-action {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  
  .input-action:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
  
  /* Suggestions */
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    justify-content: center;
  }
  
  .suggestion {
    padding: var(--space-sm) var(--space-md);
    font-size: 13px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: all var(--transition-fast);
    backdrop-filter: blur(8px);
  }
  
  .suggestion:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.4);
  }
  
  /* Recent Activity */
  .recent-activity {
    transition: opacity var(--transition-base);
  }
  
  .recent-activity.dimmed {
    opacity: 0.3;
    pointer-events: none;
  }
  
  .recent-title {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: var(--space-sm);
    text-align: center;
  }
  
  .recent-items {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  
  .recent-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    backdrop-filter: blur(8px);
    text-align: left;
  }
  
  .recent-item:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.15);
  }
  
  .item-indicator {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }
  
  .item-indicator[data-domain="work"] { background: var(--domain-work); }
  .item-indicator[data-domain="family"] { background: var(--domain-family); }
  .item-indicator[data-domain="sport"] { background: var(--domain-sport); }
  .item-indicator[data-domain="personal"] { background: var(--domain-personal); }
  .item-indicator[data-domain="health"] { background: var(--domain-health); }
  
  .item-content {
    flex: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .item-name {
    color: white;
    font-size: 14px;
    font-weight: 500;
  }
  
  .item-meta {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  
  .item-time {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }
</style>
