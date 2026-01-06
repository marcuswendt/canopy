<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { signOut } from '@auth/sveltekit/client';
  import { sidebarOpen, sidebarTab, pinnedItems, formatTimeAgo } from '$lib/client/stores/ui';
  import { entities, entitiesByDomain } from '$lib/client/stores/entities';
  import { getRecentThreads } from '$lib/client/db/client';
  import DomainBadge from './DomainBadge.svelte';
  import { onMount } from 'svelte';

  // Get user session
  let session = $derived($page.data.session);
  let user = $derived(session?.user);

  async function handleSignOut() {
    await signOut({ redirectTo: '/login' });
  }

  // Tab configuration
  const tabs = [
    { id: 'home', icon: '◉', label: 'Home' },
    { id: 'threads', icon: '◈', label: 'Threads' },
    { id: 'entities', icon: '◇', label: 'Entities' },
    { id: 'memories', icon: '◆', label: 'Memories' },
  ] as const;

  // Recent threads
  let recentThreads = $state<any[]>([]);

  onMount(async () => {
    recentThreads = await getRecentThreads(5);
  });

  function toggleSidebar() {
    sidebarOpen.update(v => !v);
  }

  function parseJsonSafe(str: string | undefined): any[] {
    if (!str) return [];
    try {
      return JSON.parse(str);
    } catch {
      return [];
    }
  }
</script>

<aside class="sidebar" class:collapsed={!$sidebarOpen}>
  <!-- Toggle Button -->
  <button class="sidebar-toggle no-drag" onclick={toggleSidebar}>
    <span class="toggle-icon">{$sidebarOpen ? '◂' : '▸'}</span>
  </button>
  
  <!-- Header with drag region -->
  <div class="sidebar-header drag-region">
    <div class="logo no-drag">
      <span class="logo-icon">🌿</span>
      {#if $sidebarOpen}
        <span class="logo-text">Canopy</span>
      {/if}
    </div>
  </div>
  
  <!-- Tab Bar -->
  <nav class="tab-bar no-drag">
    {#each tabs as tab}
      <button
        class="tab-item"
        class:active={$sidebarTab === tab.id}
        onclick={() => sidebarTab.set(tab.id)}
        title={tab.label}
      >
        <span class="tab-icon">{tab.icon}</span>
        {#if $sidebarOpen}
          <span class="tab-label">{tab.label}</span>
        {/if}
      </button>
    {/each}
  </nav>
  
  <!-- Content -->
  <div class="sidebar-content no-drag">
    {#if $sidebarTab === 'home'}
      <!-- Quick Actions -->
      <section class="sidebar-section">
        {#if $sidebarOpen}<h3 class="section-title">Quick</h3>{/if}
        <button class="action-item" onclick={() => goto('/')}>
          <span class="action-icon">✦</span>
          {#if $sidebarOpen}<span>New thought</span>{/if}
        </button>
        <button class="action-item" onclick={() => goto('/chat')}>
          <span class="action-icon">◎</span>
          {#if $sidebarOpen}<span>Chat with Ray</span>{/if}
        </button>
      </section>
      
      <!-- Pinned -->
      {#if $pinnedItems.length > 0}
        <section class="sidebar-section">
          {#if $sidebarOpen}<h3 class="section-title">Pinned</h3>{/if}
          {#each $pinnedItems as item}
            <button class="entity-item" onclick={() => goto(`/chat?entity=${item.id}`)}>
              <span class="entity-icon" data-domain={item.domain}>
                {item.icon || item.name[0]}
              </span>
              {#if $sidebarOpen}
                <span class="entity-name">{item.name}</span>
                <DomainBadge domain={item.domain} small />
              {/if}
            </button>
          {/each}
        </section>
      {/if}
      
    {:else if $sidebarTab === 'threads'}
      <section class="sidebar-section">
        {#if $sidebarOpen}<h3 class="section-title">Recent Threads</h3>{/if}
        {#each recentThreads as thread}
          <button class="thread-item" onclick={() => goto(`/chat?thread=${thread.id}`)}>
            {#if $sidebarOpen}
              <div class="thread-preview">
                <span class="thread-title">{thread.title || 'Untitled'}</span>
                <span class="thread-meta">
                  {thread.message_count} messages · {formatTimeAgo(thread.updated_at)}
                </span>
                <div class="thread-domains">
                  {#each parseJsonSafe(thread.domains) as domain}
                    <DomainBadge {domain} small />
                  {/each}
                </div>
              </div>
            {:else}
              <span class="thread-dot"></span>
            {/if}
          </button>
        {/each}
        
        {#if recentThreads.length === 0}
          <p class="empty-state">No threads yet</p>
        {/if}
      </section>
      
    {:else if $sidebarTab === 'entities'}
      {#each Object.entries($entitiesByDomain) as [domain, items]}
        {#if items.length > 0}
          <section class="sidebar-section">
            {#if $sidebarOpen}
              <h3 class="section-title">
                <DomainBadge {domain} small />
              </h3>
            {/if}
            {#each items.slice(0, $sidebarOpen ? 5 : 3) as entity}
              <button class="entity-item" onclick={() => goto(`/chat?entity=${entity.id}`)}>
                <span class="entity-icon" data-domain={domain}>
                  {entity.icon || entity.name[0]}
                </span>
                {#if $sidebarOpen}
                  <span class="entity-name">{entity.name}</span>
                {/if}
              </button>
            {/each}
          </section>
        {/if}
      {/each}
      
    {:else if $sidebarTab === 'memories'}
      <section class="sidebar-section">
        {#if $sidebarOpen}
          <p class="empty-state">
            Memories will appear here as you chat with Ray.
          </p>
        {:else}
          <span class="empty-icon">◇</span>
        {/if}
      </section>
    {/if}
  </div>
  
  <!-- Footer -->
  <div class="sidebar-footer no-drag">
    <button class="settings-btn" title="Settings" onclick={() => goto('/settings')}>
      <span>⚙</span>
      {#if $sidebarOpen}<span>Settings</span>{/if}
    </button>
    {#if user}
      <div class="user-profile">
        <img
          src={user.image}
          alt={user.name || 'User'}
          class="user-avatar"
        />
        {#if $sidebarOpen}
          <div class="user-info">
            <span class="user-name">{user.name}</span>
          </div>
          <button class="signout-btn" onclick={handleSignOut} title="Sign out">
            ↪
          </button>
        {/if}
      </div>
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    width: var(--sidebar-width);
    height: 100vh;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    transition: width var(--transition-base);
    position: relative;
    flex-shrink: 0;
  }
  
  .sidebar.collapsed {
    width: var(--sidebar-collapsed);
  }
  
  .sidebar-toggle {
    position: absolute;
    right: -12px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    border-radius: var(--radius-full);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    opacity: 0;
    transition: opacity var(--transition-fast);
    z-index: 10;
  }
  
  .sidebar:hover .sidebar-toggle {
    opacity: 1;
  }
  
  .sidebar-toggle:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
  
  .sidebar-header {
    padding: var(--space-md);
    padding-top: 44px; /* Space for traffic lights on Mac */
    border-bottom: 1px solid var(--border);
  }
  
  .logo {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  
  .logo-icon {
    font-size: 22px;
  }
  
  .logo-text {
    font-weight: 600;
    font-size: 17px;
    color: var(--text-primary);
  }
  
  /* Tab Bar */
  .tab-bar {
    display: flex;
    padding: var(--space-sm);
    gap: 2px;
    border-bottom: 1px solid var(--border);
  }
  
  .collapsed .tab-bar {
    flex-direction: column;
  }
  
  .tab-item {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    padding: var(--space-sm);
    border: none;
    background: transparent;
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-size: 12px;
  }
  
  .tab-item:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
  
  .tab-item.active {
    background: var(--bg-tertiary);
    color: var(--accent);
  }
  
  .tab-icon {
    font-size: 14px;
  }
  
  .tab-label {
    font-size: 11px;
    font-weight: 500;
  }
  
  /* Content */
  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-sm);
  }
  
  .sidebar-section {
    margin-bottom: var(--space-md);
  }
  
  .section-title {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: var(--space-xs) var(--space-sm);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }
  
  /* Action Items */
  .action-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-size: 13px;
    text-align: left;
  }
  
  .action-item:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
  
  .action-icon {
    width: 20px;
    text-align: center;
    font-size: 14px;
  }
  
  /* Entity Items */
  .entity-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-size: 13px;
    text-align: left;
  }
  
  .entity-item:hover {
    background: var(--bg-tertiary);
  }
  
  .entity-icon {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    background: var(--bg-tertiary);
  }
  
  .entity-icon[data-domain="work"] {
    background: var(--domain-work-bg);
    color: var(--domain-work);
  }
  
  .entity-icon[data-domain="family"] {
    background: var(--domain-family-bg);
    color: var(--domain-family);
  }
  
  .entity-icon[data-domain="sport"] {
    background: var(--domain-sport-bg);
    color: var(--domain-sport);
  }
  
  .entity-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  /* Thread Items */
  .thread-item {
    width: 100%;
    padding: var(--space-sm);
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
  }
  
  .thread-item:hover {
    background: var(--bg-tertiary);
  }
  
  .thread-preview {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .thread-title {
    font-size: 13px;
    color: var(--text-primary);
    font-weight: 500;
  }
  
  .thread-meta {
    font-size: 11px;
    color: var(--text-muted);
  }
  
  .thread-domains {
    display: flex;
    gap: var(--space-xs);
    margin-top: 4px;
  }
  
  .thread-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    background: var(--accent);
  }
  
  .empty-state {
    font-size: 12px;
    color: var(--text-muted);
    padding: var(--space-sm);
    text-align: center;
  }
  
  .empty-icon {
    display: block;
    text-align: center;
    color: var(--text-muted);
    font-size: 16px;
  }
  
  /* Footer */
  .sidebar-footer {
    padding: var(--space-sm);
    border-top: 1px solid var(--border);
  }
  
  .settings-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    border: none;
    background: transparent;
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 13px;
  }
  
  .settings-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  /* User Profile */
  .user-profile {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    border-radius: var(--radius-sm);
  }

  .user-avatar {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-full);
    object-fit: cover;
    flex-shrink: 0;
  }

  .user-info {
    flex: 1;
    min-width: 0;
  }

  .user-name {
    font-size: 13px;
    color: var(--text-primary);
    font-weight: 500;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .signout-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 14px;
    flex-shrink: 0;
    transition: all var(--transition-fast);
  }

  .signout-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
</style>
