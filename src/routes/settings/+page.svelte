<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { registry, allPlugins, pluginStates, syncPlugin, connectPlugin, disconnectPlugin, enablePlugin, disablePlugin } from '$lib/integrations/registry';
  import { whoopPlugin } from '$lib/integrations/whoop';
  import { googlePlugin } from '$lib/integrations/google';
  import { hasApiKey } from '$lib/ai';
  import { userSettings } from '$lib/stores/settings';
  import { rayState } from '$lib/coach/store';

  // Claude API key state
  let apiKeyInput = $state('');
  let hasKey = $state(false);
  let savingKey = $state(false);
  let keyMessage = $state('');

  // Profile state
  let userName = $state('');
  let userLocation = $state('');
  let profileMessage = $state('');

  // Google OAuth state
  let googleClientId = $state('');
  let googleMessage = $state('');
  let savingGoogle = $state(false);

  // WHOOP OAuth state
  let whoopClientId = $state('');
  let whoopClientSecret = $state('');
  let whoopMessage = $state('');
  let savingWhoop = $state(false);
  let hasWhoopCreds = $state(false);

  // Profile state
  let currentProfile = $state('live');
  let profiles = $state<{ id: string; label: string; builtIn: boolean }[]>([]);
  let switchingProfile = $state(false);
  let showCreateProfile = $state(false);
  let newProfileLabel = $state('');
  let creatingProfile = $state(false);
  let deletingProfile = $state<string | null>(null);

  // Danger Zone state
  let showResetConfirm = $state(false);
  let resetConfirmText = $state('');
  let resetting = $state(false);
  let resetMessage = $state('');

  // Register plugins on mount
  onMount(async () => {
    registry.register(whoopPlugin);
    registry.register(googlePlugin);
    hasKey = await hasApiKey();
    await userSettings.load();
    const settings = userSettings.get();
    userName = settings.userName || '';
    userLocation = settings.location || '';

    // Load Google OAuth client ID
    googleClientId = localStorage.getItem('google_oauth_client_id') || '';

    // Check if WHOOP credentials are configured
    if (window.canopy?.getSecret) {
      const whoopId = await window.canopy.getSecret('whoop_client_id');
      hasWhoopCreds = !!whoopId;
    }

    // Load profile info
    if (window.canopy?.getProfile) {
      const profileInfo = await window.canopy.getProfile();
      currentProfile = profileInfo.current;
      profiles = profileInfo.profiles;
    }
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

  function saveGoogleClientId() {
    if (!googleClientId.trim()) return;
    savingGoogle = true;
    googleMessage = '';

    try {
      localStorage.setItem('google_oauth_client_id', googleClientId.trim());
      googleMessage = 'Google Client ID saved';
      setTimeout(() => googleMessage = '', 2000);
    } catch (error) {
      googleMessage = 'Failed to save Client ID';
    } finally {
      savingGoogle = false;
    }
  }

  function removeGoogleClientId() {
    try {
      localStorage.removeItem('google_oauth_client_id');
      googleClientId = '';
      googleMessage = 'Google Client ID removed';
      setTimeout(() => googleMessage = '', 2000);
    } catch (error) {
      googleMessage = 'Failed to remove Client ID';
    }
  }

  async function saveWhoopCredentials() {
    if (!whoopClientId.trim() || !whoopClientSecret.trim()) return;
    savingWhoop = true;
    whoopMessage = '';

    try {
      if (window.canopy?.setSecret) {
        await window.canopy.setSecret('whoop_client_id', whoopClientId.trim());
        await window.canopy.setSecret('whoop_client_secret', whoopClientSecret.trim());
        hasWhoopCreds = true;
        whoopClientId = '';
        whoopClientSecret = '';
        whoopMessage = 'WHOOP credentials saved';
        setTimeout(() => whoopMessage = '', 2000);
      } else {
        whoopMessage = 'Settings only available in Electron app';
      }
    } catch (error) {
      whoopMessage = 'Failed to save credentials';
    } finally {
      savingWhoop = false;
    }
  }

  async function removeWhoopCredentials() {
    try {
      if (window.canopy?.deleteSecret) {
        await window.canopy.deleteSecret('whoop_client_id');
        await window.canopy.deleteSecret('whoop_client_secret');
        await window.canopy.deleteSecret('whoop_access_token');
        await window.canopy.deleteSecret('whoop_refresh_token');
        hasWhoopCreds = false;
        whoopMessage = 'WHOOP credentials removed';
        setTimeout(() => whoopMessage = '', 2000);
      }
    } catch (error) {
      whoopMessage = 'Failed to remove credentials';
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

  // Danger Zone functions
  async function resetDatabase() {
    if (resetConfirmText !== 'DELETE EVERYTHING') return;

    resetting = true;
    resetMessage = '';

    try {
      if (window.canopy?.resetDatabase) {
        await window.canopy.resetDatabase();
        // Reset local ray state
        rayState.reset();
        // Clear localStorage
        localStorage.clear();
        resetMessage = 'Database reset complete. Restarting...';
        // Redirect to onboarding after a short delay
        setTimeout(() => {
          goto('/onboarding');
          // Force a full page reload to clear all state
          window.location.reload();
        }, 1500);
      } else {
        resetMessage = 'Database reset only available in Electron app';
      }
    } catch (error) {
      resetMessage = 'Failed to reset database';
      console.error('Reset error:', error);
    } finally {
      resetting = false;
      showResetConfirm = false;
      resetConfirmText = '';
    }
  }

  function cancelReset() {
    showResetConfirm = false;
    resetConfirmText = '';
    resetMessage = '';
  }

  async function switchToProfile(profileId: string) {
    if (profileId === currentProfile || switchingProfile) return;

    switchingProfile = true;
    try {
      if (window.canopy?.switchProfile) {
        const result = await window.canopy.switchProfile(profileId);
        if (result.success) {
          // Window will reload automatically from main process
          currentProfile = profileId;
        }
      }
    } catch (error) {
      console.error('Profile switch error:', error);
    } finally {
      switchingProfile = false;
    }
  }

  async function createNewProfile() {
    if (!newProfileLabel.trim() || creatingProfile) return;

    creatingProfile = true;
    try {
      if (window.canopy?.createProfile) {
        const result = await window.canopy.createProfile(newProfileLabel.trim());
        if (result.success && result.profileId) {
          // Refresh profiles list
          const profileInfo = await window.canopy.getProfile();
          profiles = profileInfo.profiles;
          // Switch to the new profile
          await switchToProfile(result.profileId);
        }
      }
    } catch (error) {
      console.error('Profile creation error:', error);
    } finally {
      creatingProfile = false;
      showCreateProfile = false;
      newProfileLabel = '';
    }
  }

  async function deleteProfileById(profileId: string) {
    if (deletingProfile) return;

    deletingProfile = profileId;
    try {
      if (window.canopy?.deleteProfile) {
        const result = await window.canopy.deleteProfile(profileId);
        if (result.success) {
          // Refresh profiles list
          const profileInfo = await window.canopy.getProfile();
          profiles = profileInfo.profiles;
        } else if (result.error) {
          console.error('Delete error:', result.error);
        }
      }
    } catch (error) {
      console.error('Profile deletion error:', error);
    } finally {
      deletingProfile = null;
    }
  }
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

    <section class="settings-section">
      <h2>Developer</h2>
      <p class="section-desc">Configure OAuth credentials for integrations</p>

      <div class="oauth-card">
        <div class="oauth-header">
          <span class="oauth-label">Google OAuth Client ID</span>
          {#if googleClientId}
            <span class="oauth-status configured">Configured</span>
          {:else}
            <span class="oauth-status">Not configured</span>
          {/if}
        </div>

        <p class="oauth-info">
          Required for Google Calendar integration. Create credentials at <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console</a>
        </p>

        {#if googleClientId}
          <div class="oauth-configured">
            <code class="oauth-value">{googleClientId.substring(0, 20)}...{googleClientId.slice(-10)}</code>
            <button class="remove-oauth-btn" onclick={removeGoogleClientId}>Remove</button>
          </div>
        {:else}
          <div class="oauth-input-row">
            <input
              type="text"
              bind:value={googleClientId}
              placeholder="123456789-abc123def456.apps.googleusercontent.com"
              class="oauth-input"
            />
            <button
              class="save-oauth-btn"
              onclick={saveGoogleClientId}
              disabled={!googleClientId.trim() || savingGoogle}
            >
              {savingGoogle ? 'Saving...' : 'Save'}
            </button>
          </div>
        {/if}

        {#if googleMessage}
          <p class="oauth-message" class:success={googleMessage.includes('saved')}>{googleMessage}</p>
        {/if}
      </div>

      <div class="oauth-card" style="margin-top: var(--space-md);">
        <div class="oauth-header">
          <span class="oauth-label">WHOOP OAuth Credentials</span>
          {#if hasWhoopCreds}
            <span class="oauth-status configured">Configured</span>
          {:else}
            <span class="oauth-status">Not configured</span>
          {/if}
        </div>

        <p class="oauth-info">
          Required for WHOOP integration. Get your credentials from <a href="https://developer.whoop.com" target="_blank" rel="noopener">developer.whoop.com</a>
        </p>

        {#if hasWhoopCreds}
          <div class="oauth-configured">
            <span class="oauth-value">Credentials saved securely</span>
            <button class="remove-oauth-btn" onclick={removeWhoopCredentials}>Remove</button>
          </div>
        {:else}
          <div class="oauth-fields">
            <input
              type="text"
              bind:value={whoopClientId}
              placeholder="Client ID"
              class="oauth-input"
            />
            <input
              type="password"
              bind:value={whoopClientSecret}
              placeholder="Client Secret"
              class="oauth-input"
            />
            <button
              class="save-oauth-btn"
              onclick={saveWhoopCredentials}
              disabled={!whoopClientId.trim() || !whoopClientSecret.trim() || savingWhoop}
            >
              {savingWhoop ? 'Saving...' : 'Save'}
            </button>
          </div>
        {/if}

        {#if whoopMessage}
          <p class="oauth-message" class:success={whoopMessage.includes('saved')}>{whoopMessage}</p>
        {/if}
      </div>
    </section>

    <section class="settings-section">
      <h2>Database Profile</h2>
      <p class="section-desc">Switch between test and live databases</p>

      <div class="profile-switcher">
        {#each profiles as profile (profile.id)}
          <div class="profile-row">
            <button
              class="profile-btn"
              class:active={currentProfile === profile.id}
              class:test={profile.id === 'test'}
              class:custom={!profile.builtIn}
              onclick={() => switchToProfile(profile.id)}
              disabled={switchingProfile || !!deletingProfile}
            >
              <span class="profile-indicator"></span>
              <span class="profile-label">{profile.label}</span>
              {#if currentProfile === profile.id}
                <span class="profile-active">Active</span>
              {/if}
            </button>
            {#if !profile.builtIn && currentProfile !== profile.id}
              <button
                class="profile-delete-btn"
                onclick={() => deleteProfileById(profile.id)}
                disabled={!!deletingProfile}
                title="Delete profile"
              >
                {deletingProfile === profile.id ? '...' : '×'}
              </button>
            {/if}
          </div>
        {/each}
      </div>

      {#if showCreateProfile}
        <div class="create-profile-form">
          <input
            type="text"
            bind:value={newProfileLabel}
            placeholder="Profile name (e.g. Experiment 1)"
            class="create-profile-input"
            disabled={creatingProfile}
          />
          <button
            class="create-profile-submit"
            onclick={createNewProfile}
            disabled={!newProfileLabel.trim() || creatingProfile}
          >
            {creatingProfile ? 'Creating...' : 'Create'}
          </button>
          <button
            class="create-profile-cancel"
            onclick={() => { showCreateProfile = false; newProfileLabel = ''; }}
            disabled={creatingProfile}
          >
            Cancel
          </button>
        </div>
      {:else}
        <button class="add-profile-btn" onclick={() => showCreateProfile = true}>
          + New Test Profile
        </button>
      {/if}

      <p class="profile-note">
        Each profile has its own database and uploads folder. Secrets (API keys) are shared.
      </p>
    </section>

    <section class="settings-section danger-zone">
      <h2>Danger Zone</h2>
      <p class="section-desc">Irreversible actions - be careful</p>

      <div class="danger-card">
        <div class="danger-header">
          <div class="danger-info">
            <span class="danger-label">Reset Database</span>
            <p class="danger-desc">
              Delete all data including entities, conversations, memories, and uploads.
              Your API keys and OAuth credentials will be preserved.
            </p>
          </div>
          {#if !showResetConfirm}
            <button class="danger-btn" onclick={() => showResetConfirm = true}>
              Reset Everything
            </button>
          {/if}
        </div>

        {#if showResetConfirm}
          <div class="danger-confirm">
            <p class="danger-warning">
              This will permanently delete all your data. This action cannot be undone.
            </p>
            <label class="danger-confirm-label">
              Type <strong>DELETE EVERYTHING</strong> to confirm:
              <input
                type="text"
                bind:value={resetConfirmText}
                placeholder="DELETE EVERYTHING"
                class="danger-confirm-input"
                disabled={resetting}
              />
            </label>
            <div class="danger-actions">
              <button
                class="danger-confirm-btn"
                onclick={resetDatabase}
                disabled={resetConfirmText !== 'DELETE EVERYTHING' || resetting}
              >
                {resetting ? 'Resetting...' : 'I understand, delete everything'}
              </button>
              <button class="danger-cancel-btn" onclick={cancelReset} disabled={resetting}>
                Cancel
              </button>
            </div>
          </div>
        {/if}

        {#if resetMessage}
          <p class="danger-message" class:success={resetMessage.includes('complete')}>{resetMessage}</p>
        {/if}
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

  /* Developer / OAuth Section */
  .oauth-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
  }

  .oauth-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
  }

  .oauth-label {
    font-weight: 600;
    color: var(--text-primary);
  }

  .oauth-status {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    color: var(--text-muted);
  }

  .oauth-status.configured {
    background: var(--domain-family-bg);
    color: var(--domain-family);
  }

  .oauth-info {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: var(--space-md);
  }

  .oauth-info a {
    color: var(--accent);
    text-decoration: none;
  }

  .oauth-info a:hover {
    text-decoration: underline;
  }

  .oauth-input-row {
    display: flex;
    gap: var(--space-sm);
  }

  .oauth-fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .oauth-fields .save-oauth-btn {
    align-self: flex-start;
    margin-top: var(--space-xs);
  }

  .oauth-input {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    font-size: 13px;
    font-family: 'SF Mono', Consolas, monospace;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .oauth-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .oauth-input::placeholder {
    color: var(--text-muted);
  }

  .save-oauth-btn {
    padding: var(--space-sm) var(--space-lg);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: 14px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .save-oauth-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .save-oauth-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .oauth-configured {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .oauth-value {
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 12px;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
  }

  .remove-oauth-btn {
    padding: var(--space-xs) var(--space-md);
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: 13px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .remove-oauth-btn:hover {
    color: var(--domain-health);
    border-color: var(--domain-health);
  }

  .oauth-message {
    margin-top: var(--space-sm);
    font-size: 13px;
    color: var(--text-muted);
  }

  .oauth-message.success {
    color: var(--domain-family);
  }

  /* Profile Switcher */
  .profile-switcher {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .profile-row {
    display: flex;
    gap: var(--space-xs);
  }

  .profile-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-secondary);
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .profile-btn:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--bg-tertiary);
  }

  .profile-btn.active {
    border-color: var(--accent);
    background: var(--accent-muted, rgba(16, 185, 129, 0.1));
  }

  .profile-btn.test .profile-indicator {
    background: var(--domain-work);
  }

  .profile-btn.custom .profile-indicator {
    background: var(--domain-personal, #9b59b6);
  }

  .profile-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .profile-indicator {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-full);
    background: var(--accent);
    flex-shrink: 0;
  }

  .profile-label {
    font-size: 15px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .profile-active {
    margin-left: auto;
    font-size: 12px;
    color: var(--accent);
    font-weight: 500;
  }

  .profile-delete-btn {
    width: 36px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .profile-delete-btn:hover:not(:disabled) {
    border-color: var(--domain-health);
    color: var(--domain-health);
    background: rgba(239, 68, 68, 0.1);
  }

  .profile-delete-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .add-profile-btn {
    margin-top: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: 1px dashed var(--border);
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: 13px;
    cursor: pointer;
    transition: all var(--transition-fast);
    width: 100%;
  }

  .add-profile-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-muted, rgba(16, 185, 129, 0.05));
  }

  .create-profile-form {
    margin-top: var(--space-sm);
    display: flex;
    gap: var(--space-sm);
    align-items: center;
  }

  .create-profile-input {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    font-size: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .create-profile-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .create-profile-input::placeholder {
    color: var(--text-muted);
  }

  .create-profile-submit {
    padding: var(--space-sm) var(--space-lg);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: 14px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .create-profile-submit:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .create-profile-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .create-profile-cancel {
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: 14px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .create-profile-cancel:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }

  .create-profile-cancel:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .profile-note {
    margin-top: var(--space-md);
    font-size: 13px;
    color: var(--text-muted);
  }

  /* Danger Zone */
  .danger-zone h2 {
    color: var(--domain-health);
  }

  .danger-card {
    background: var(--bg-secondary);
    border: 1px solid var(--domain-health);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
  }

  .danger-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-lg);
  }

  .danger-info {
    flex: 1;
  }

  .danger-label {
    font-weight: 600;
    color: var(--text-primary);
    display: block;
    margin-bottom: var(--space-xs);
  }

  .danger-desc {
    font-size: 14px;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .danger-btn {
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    color: var(--domain-health);
    border: 1px solid var(--domain-health);
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .danger-btn:hover {
    background: var(--domain-health);
    color: white;
  }

  .danger-confirm {
    margin-top: var(--space-lg);
    padding-top: var(--space-lg);
    border-top: 1px solid var(--border);
  }

  .danger-warning {
    color: var(--domain-health);
    font-size: 14px;
    font-weight: 500;
    margin: 0 0 var(--space-md) 0;
  }

  .danger-confirm-label {
    display: block;
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: var(--space-md);
  }

  .danger-confirm-label strong {
    color: var(--text-primary);
    font-family: 'SF Mono', Consolas, monospace;
  }

  .danger-confirm-input {
    display: block;
    width: 100%;
    margin-top: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    font-size: 14px;
    font-family: 'SF Mono', Consolas, monospace;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .danger-confirm-input:focus {
    outline: none;
    border-color: var(--domain-health);
  }

  .danger-confirm-input::placeholder {
    color: var(--text-muted);
  }

  .danger-actions {
    display: flex;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }

  .danger-confirm-btn {
    padding: var(--space-sm) var(--space-lg);
    background: var(--domain-health);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .danger-confirm-btn:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .danger-confirm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .danger-cancel-btn {
    padding: var(--space-sm) var(--space-lg);
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: 14px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .danger-cancel-btn:hover:not(:disabled) {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .danger-cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .danger-message {
    margin-top: var(--space-md);
    font-size: 14px;
    color: var(--domain-health);
  }

  .danger-message.success {
    color: var(--domain-family);
  }
</style>
