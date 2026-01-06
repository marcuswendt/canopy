<script lang="ts">
  import { signIn } from '@auth/sveltekit/client';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  // Check for error from callback
  let error = $derived($page.url.searchParams.get('error'));

  // Redirect if already logged in
  let session = $derived($page.data.session);

  onMount(() => {
    if (session?.user) {
      goto('/');
    }
  });

  // Also watch for session changes
  $effect(() => {
    if (session?.user) {
      goto('/');
    }
  });
</script>

<div class="login-container">
  <div class="login-card">
    <div class="logo">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
      </svg>
    </div>

    <h1>Canopy</h1>
    <p class="subtitle">Your personal knowledge companion</p>

    {#if error}
      <div class="error">
        {#if error === 'AccessDenied'}
          Access denied. Your email is not on the invite list.
        {:else}
          Something went wrong. Please try again.
        {/if}
      </div>
    {/if}

    <button class="google-button" onclick={() => signIn('google')}>
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Continue with Google
    </button>

    <p class="privacy-note">
      Canopy is invite-only. Contact your administrator if you need access.
    </p>
  </div>
</div>

<style>
  .login-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-primary);
    padding: var(--space-lg);
  }

  .login-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-2xl);
    max-width: 400px;
    width: 100%;
    text-align: center;
  }

  .logo {
    color: var(--accent);
    margin-bottom: var(--space-lg);
  }

  h1 {
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-xs) 0;
  }

  .subtitle {
    color: var(--text-secondary);
    margin: 0 0 var(--space-xl) 0;
  }

  .error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #ef4444;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-lg);
    font-size: 0.875rem;
  }

  .google-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-md) var(--space-lg);
    background: white;
    color: #333;
    border: 1px solid #ddd;
    border-radius: var(--radius-md);
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .google-button:hover {
    background: #f8f8f8;
    border-color: #ccc;
  }

  .privacy-note {
    margin-top: var(--space-xl);
    font-size: 0.75rem;
    color: var(--text-muted);
  }
</style>
