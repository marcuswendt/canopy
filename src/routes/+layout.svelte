<script lang="ts">
  import '../app.css';
  import { onMount, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import { sidebarOpen, initTheme } from '$lib/stores/ui';
  import { loadEntities, loadRelationships } from '$lib/stores/entities';
  import { rayState, needsOnboarding } from '$lib/coach/store';

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    // Initialize theme based on time of day
    const cleanup = initTheme();

    // Load data from database
    loadEntities();
    loadRelationships();

    return cleanup;
  });

  // Redirect to onboarding if needed (but not if already there)
  $effect(() => {
    if ($needsOnboarding && !$page.url.pathname.includes('onboarding')) {
      goto('/onboarding');
    }
  });

  // Don't show sidebar during onboarding
  let showSidebar = $derived(!$page.url.pathname.includes('onboarding'));
</script>

<div class="app-container">
  <!-- Drag region for frameless window -->
  <div class="window-drag-region"></div>

  {#if showSidebar}
    <Sidebar />
  {/if}

  <main class="main-content" class:full-width={!showSidebar}>
    {@render children()}
  </main>
</div>

<style>
  .app-container {
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: var(--bg-primary);
    position: relative;
  }

  .window-drag-region {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 32px;
    -webkit-app-region: drag;
    z-index: 100;
  }
  
  .main-content {
    flex: 1;
    overflow: hidden;
    position: relative;
  }
  
  .main-content.full-width {
    width: 100%;
  }
</style>
