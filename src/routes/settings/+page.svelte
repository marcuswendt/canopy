<script lang="ts">
  import { onMount } from 'svelte';
  import { registry, allPlugins, pluginStates, syncPlugin, connectPlugin, disconnectPlugin, enablePlugin, disablePlugin } from '$lib/integrations/registry';
  import { whoopPlugin } from '$lib/integrations/whoop';
  import { hasApiKey } from '$lib/ai';
  import { userSettings } from '$lib/stores/settings';

  // Claude API key state
  let apiKeyInput = $state('');
  let hasKey = $state(false);
  let savingKey = $state(false);
  let keyMessage = $state('');

  // Profile state
  let userName = $state('');
  let userLocation = $state('');
  let profileMessage = $state('');

  // Register plugins on mount
  onMount(async () => {
    registry.register(whoopPlugin);
    hasKey = await hasApiKey();
    await userSettings.load();
    const settings = userSettings.get();
    userName = settings.userName || '';
    userLocation = settings.location || '';
  });

  async function saveProfile() {
    try {
      if (userName.trim()) {
        await userSettings.setUserName(userName.trim());
      }
      if (userLocation.trim()) {
        await userSettings.setLocation(userLocation.trim());
      }
      profileMessage = 'Profile saved';
      setTimeout(() => profileMessage = '', 2000);
    } catch (error) {
      profileMessage = 'Failed to save profile';
    }
  }

  async function saveApiKey() {
    if (!apiKeyInput.trim()) return;
    savingKey = true;
    keyMessage = '';

    try {
      if (typeof window !== 'undefined' && window.canopy?.setSecret) {
        await window.canopy.setSecret('claude_api_key', apiKeyInput.trim());
        hasKey = true;
        apiKeyInput = '';
        keyMessage = 'API key saved successfully';
      } else {
        keyMessage = 'Settings only available in Electron app';
      }
    } catch (error) {
      keyMessage = 'Failed to save API key';
    } finally {
      savingKey = false;
    }
  }

  async function removeApiKey() {
    try {
      if (typeof window !== 'undefined' && window.canopy?.deleteSecret) {
        await window.canopy.deleteSecret('claude_api_key');
        hasKey = false;
        keyMessage = 'API key removed';
      }
    } catch (error) {
      keyMessage = 'Failed to remove API key';
    }
  }

  let syncing = $state<Set<string>>(new Set());
  let connecting = $state<Set<string>>(new Set());
  
  async function handleConnect(pluginId: string) {
    connecting = connecting.add(pluginId);
    try {
      await connectPlugin(pluginId);
    } catch (error) {
      console.error('Failed to connect:', error);
    } finally {
      connecting.delete(pluginId);
      connecting = connecting;
    }
  }
  
  async function handleDisconnect(pluginId: string) {
    await disconnectPlugin(pluginId);
  }
  
  async function handleSync(pluginId: string) {
    syncing = syncing.add(pluginId);
    try {
      await syncPlugin(pluginId);
    } catch (error) {
      console.error('Failed to sync:', error);
    } finally {
      syncing.delete(pluginId);
      syncing = syncing;
    }
  }
  
  function formatLastSync(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
  
  // Group plugins by domain
  let healthPlugins = $derived($allPlugins.filter(p => p.domains.includes('health') || p.domains.includes('sport')));
  let workPlugins = $derived($allPlugins.filter(p => p.domains.includes('work')));
</script>

<div class="settings-page">
  <header class="settings-header">
    <h1>Settings</h1>
  </header>
  
  <div class="settings-content">
    <section class="settings-section">
      <h2>Integrations</h2>
      <p class="section-desc">Connect services to enrich your attention data</p>
      
      {#if healthPlugins.length > 0}
        <div class="plugin-group">
          <h3>Health & Fitness</h3>
          
          {#each healthPlugins as plugin (plugin.id)}
            {@const state = $pluginStates.get(plugin.id)}
            <div class="plugin-card" class:connected={state?.connected}>
              <div class="plugin-icon">{plugin.icon}</div>
              
              <div class="plugin-info">
                <div class="plugin-name">{plugin.name}</div>
                <div class="plugin-description">{plugin.description}</div>
                {#if state?.connected && state.lastSync}
                  <div class="plugin-status">
                    Last sync: {formatLastSync(state.lastSync)}
                    {#if state.lastError}
                      <span class="error">· Error</span>
                    {/if}
                  </div>
                {/if}
              </div>
              
              <div class="plugin-actions">
                {#if state?.connected}
                  <button
                    class="sync-btn"
                    onclick={() => handleSync(plugin.id)}
                    disabled={syncing.has(plugin.id)}
                  >
                    {syncing.has(plugin.id) ? 'Syncing...' : 'Sync'}
                  </button>
                  <button
                    class="disconnect-btn"
                    onclick={() => handleDisconnect(plugin.id)}
                  >
                    Disconnect
                  </button>
                {:else}
                  <button
                    class="connect-btn"
                    onclick={() => handleConnect(plugin.id)}
                    disabled={connecting.has(plugin.id)}
                  >
                    {connecting.has(plugin.id) ? 'Connecting...' : 'Connect'}
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
      
      {#if workPlugins.length > 0}
        <div class="plugin-group">
          <h3>Work</h3>
          
          {#each workPlugins as plugin (plugin.id)}
            {@const state = $pluginStates.get(plugin.id)}
            <div class="plugin-card" class:connected={state?.connected}>
              <div class="plugin-icon">{plugin.icon}</div>
              
              <div class="plugin-info">
                <div class="plugin-name">{plugin.name}</div>
                <div class="plugin-description">{plugin.description}</div>
              </div>
              
              <div class="plugin-actions">
                <button class="connect-btn" disabled>
                  Coming Soon
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      
      <!-- Placeholder plugins -->
      <div class="plugin-group">
        <h3>Coming Soon</h3>
        
        <div class="plugin-card placeholder">
          <div class="plugin-icon">🟠</div>
          <div class="plugin-info">
            <div class="plugin-name">Strava</div>
            <div class="plugin-description">Activities, routes, training</div>
          </div>
          <div class="plugin-actions">
            <button class="connect-btn" disabled>Coming Soon</button>
          </div>
        </div>
        
        <div class="plugin-card placeholder">
          <div class="plugin-icon">🏕</div>
          <div class="plugin-info">
            <div class="plugin-name">Basecamp</div>
            <div class="plugin-description">Projects, tasks, messages</div>
          </div>
          <div class="plugin-actions">
            <button class="connect-btn" disabled>Coming Soon</button>
          </div>
        </div>
        
        <div class="plugin-card placeholder">
          <div class="plugin-icon">📝</div>
          <div class="plugin-info">
            <div class="plugin-name">Notion</div>
            <div class="plugin-description">Databases, pages, wikis</div>
          </div>
          <div class="plugin-actions">
            <button class="connect-btn" disabled>Coming Soon</button>
          </div>
        </div>
        
        <div class="plugin-card placeholder">
          <div class="plugin-icon">📧</div>
          <div class="plugin-info">
            <div class="plugin-name">Gmail</div>
            <div class="plugin-description">Email context and reminders</div>
          </div>
          <div class="plugin-actions">
            <button class="connect-btn" disabled>Coming Soon</button>
          </div>
        </div>
        
        <div class="plugin-card placeholder">
          <div class="plugin-icon">📅</div>
          <div class="plugin-info">
            <div class="plugin-name">Calendar</div>
            <div class="plugin-description">Events and scheduling</div>
          </div>
          <div class="plugin-actions">
            <button class="connect-btn" disabled>Coming Soon</button>
          </div>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <h2>Profile</h2>
      <p class="section-desc">Help Ray personalize your experience</p>

      <div class="profile-card">
        <div class="profile-field">
          <label for="userName">Your name</label>
          <input
            id="userName"
            type="text"
            bind:value={userName}
            placeholder="Marcus"
            class="profile-input"
          />
        </div>
        <div class="profile-field">
          <label for="userLocation">Location</label>
          <input
            id="userLocation"
            type="text"
            bind:value={userLocation}
            placeholder="Auckland, New Zealand"
            class="profile-input"
          />
        </div>
        <div class="profile-actions">
          <button class="save-profile-btn" onclick={saveProfile}>Save Profile</button>
          {#if profileMessage}
            <span class="profile-message">{profileMessage}</span>
          {/if}
        </div>
      </div>
    </section>

    <section class="settings-section">
      <h2>AI</h2>
      <p class="section-desc">Claude powers Ray's intelligence</p>

      <div class="api-key-card">
        <div class="api-key-header">
          <span class="api-key-label">Claude API Key</span>
          {#if hasKey}
            <span class="api-key-status connected">Connected</span>
          {:else}
            <span class="api-key-status">Not configured</span>
          {/if}
        </div>

        {#if hasKey}
          <p class="api-key-info">Your API key is securely stored. Ray is ready to help.</p>
          <button class="remove-key-btn" onclick={removeApiKey}>Remove API Key</button>
        {:else}
          <p class="api-key-info">
            Get your API key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>
          </p>
          <div class="api-key-input-row">
            <input
              type="password"
              bind:value={apiKeyInput}
              placeholder="sk-ant-..."
              class="api-key-input"
            />
            <button
              class="save-key-btn"
              onclick={saveApiKey}
              disabled={!apiKeyInput.trim() || savingKey}
            >
              {savingKey ? 'Saving...' : 'Save'}
            </button>
          </div>
        {/if}

        {#if keyMessage}
          <p class="key-message" class:success={keyMessage.includes('success')}>{keyMessage}</p>
        {/if}
      </div>
    </section>

    <section class="settings-section">
      <h2>Data Storage</h2>
      <p class="section-desc">Your data is stored locally</p>
      
      <div class="storage-info">
        <div class="storage-item">
          <span class="storage-label">Config directory</span>
          <code class="storage-path">~/.canopy/</code>
        </div>
        <div class="storage-item">
          <span class="storage-label">Uploads</span>
          <code class="storage-path">~/.canopy/uploads/</code>
        </div>
        <div class="storage-item">
          <span class="storage-label">Database</span>
          <code class="storage-path">~/.canopy/canopy.db</code>
        </div>
      </div>
    </section>
  </div>
</div>

<style>
  .settings-page {
    height: 100%;
    overflow-y: auto;
    background: var(--bg-primary);
  }
  
  .settings-header {
    padding: var(--space-xl);
    border-bottom: 1px solid var(--border);
  }
  
  .settings-header h1 {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }
  
  .settings-content {
    padding: var(--space-xl);
    max-width: 700px;
  }
  
  .settings-section {
    margin-bottom: var(--space-2xl);
  }
  
  .settings-section h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-xs) 0;
  }
  
  .section-desc {
    color: var(--text-muted);
    font-size: 14px;
    margin: 0 0 var(--space-lg) 0;
  }
  
  .plugin-group {
    margin-bottom: var(--space-xl);
  }
  
  .plugin-group h3 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin: 0 0 var(--space-sm) 0;
  }
  
  .plugin-card {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-sm);
    transition: all var(--transition-fast);
  }
  
  .plugin-card.connected {
    border-color: var(--domain-family);
    background: var(--domain-family-bg);
  }
  
  .plugin-card.placeholder {
    opacity: 0.6;
  }
  
  .plugin-icon {
    font-size: 28px;
    width: 40px;
    text-align: center;
    flex-shrink: 0;
  }
  
  .plugin-info {
    flex: 1;
    min-width: 0;
  }
  
  .plugin-name {
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 2px;
  }
  
  .plugin-description {
    font-size: 13px;
    color: var(--text-muted);
  }
  
  .plugin-status {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: var(--space-xs);
  }
  
  .plugin-status .error {
    color: var(--domain-health);
  }
  
  .plugin-actions {
    display: flex;
    gap: var(--space-sm);
    flex-shrink: 0;
  }
  
  .connect-btn,
  .sync-btn,
  .disconnect-btn {
    padding: var(--space-sm) var(--space-md);
    font-size: 13px;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  
  .connect-btn {
    background: var(--accent);
    color: white;
    border: none;
  }
  
  .connect-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  
  .connect-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .sync-btn {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
  }
  
  .sync-btn:hover:not(:disabled) {
    background: var(--bg-secondary);
  }
  
  .disconnect-btn {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
  }
  
  .disconnect-btn:hover {
    color: var(--domain-health);
    border-color: var(--domain-health);
  }
  
  .storage-info {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-md);
  }
  
  .storage-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-sm) 0;
  }
  
  .storage-item:not(:last-child) {
    border-bottom: 1px solid var(--border);
  }
  
  .storage-label {
    font-size: 14px;
    color: var(--text-secondary);
  }
  
  .storage-path {
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 12px;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  /* Profile Section */
  .profile-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .profile-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .profile-field label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .profile-input {
    padding: var(--space-sm) var(--space-md);
    font-size: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .profile-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .profile-input::placeholder {
    color: var(--text-muted);
  }

  .profile-actions {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-top: var(--space-sm);
  }

  .save-profile-btn {
    padding: var(--space-sm) var(--space-lg);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: 14px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .save-profile-btn:hover {
    background: var(--accent-hover);
  }

  .profile-message {
    font-size: 13px;
    color: var(--domain-family);
  }

  /* API Key Section */
  .api-key-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
  }

  .api-key-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
  }

  .api-key-label {
    font-weight: 600;
    color: var(--text-primary);
  }

  .api-key-status {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    color: var(--text-muted);
  }

  .api-key-status.connected {
    background: var(--domain-family-bg);
    color: var(--domain-family);
  }

  .api-key-info {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: var(--space-md);
  }

  .api-key-info a {
    color: var(--accent);
    text-decoration: none;
  }

  .api-key-info a:hover {
    text-decoration: underline;
  }

  .api-key-input-row {
    display: flex;
    gap: var(--space-sm);
  }

  .api-key-input {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    font-size: 14px;
    font-family: 'SF Mono', Consolas, monospace;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .api-key-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .api-key-input::placeholder {
    color: var(--text-muted);
  }

  .save-key-btn {
    padding: var(--space-sm) var(--space-lg);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: 14px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .save-key-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .save-key-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .remove-key-btn {
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: 13px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .remove-key-btn:hover {
    color: var(--domain-health);
    border-color: var(--domain-health);
  }

  .key-message {
    margin-top: var(--space-sm);
    font-size: 13px;
    color: var(--text-muted);
  }

  .key-message.success {
    color: var(--domain-family);
  }
</style>
