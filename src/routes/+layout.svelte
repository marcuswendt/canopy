<script lang="ts">
  import '../app.css';
  import { onMount, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import DataInspector from '$lib/components/DataInspector.svelte';
  import { sidebarOpen, initTheme } from '$lib/stores/ui';
  import { loadEntities, loadRelationships } from '$lib/stores/entities';
  import { rayState, needsOnboarding, rayStateLoaded } from '$lib/coach/store';
  import { initializePlugins, startPluginScheduler } from '$lib/integrations/init';
  import { inspectorOpen } from '$lib/stores/inspector';

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    // Initialize theme based on time of day
    const cleanup = initTheme();

    // Load data from database
    loadEntities();
    loadRelationships();

    // Initialize plugin system (time, weather, WHOOP, etc.)
    initializePlugins().then(() => {
      // Start automatic sync scheduling after initialization
      const stopScheduler = startPluginScheduler();
      // Note: stopScheduler could be returned for cleanup if needed
    });

    // Keyboard shortcut for Data Inspector (Cmd+Shift+D)
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        inspectorOpen.toggle();
      }
    }
    window.addEventListener('keydown', handleKeydown);

    // Listen for menu bar toggle (from Electron main process)
    let removeMenuListener: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.canopy?.onToggleInspector) {
      removeMenuListener = window.canopy.onToggleInspector(() => {
        inspectorOpen.toggle();
      });
    }

    // Listen for navigation events (from Electron menu, e.g., Cmd+,)
    let removeNavListener: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.canopy?.onNavigate) {
      removeNavListener = window.canopy.onNavigate((path: string) => {
        goto(path);
      });
    }

    return () => {
      cleanup?.();
      window.removeEventListener('keydown', handleKeydown);
      removeMenuListener?.();
      removeNavListener?.();
    };
  });

  // Redirect to onboarding if needed (but not if already there or in settings)
  // Wait for ray state to load from persistence before making routing decisions
  $effect(() => {
    const path = $page.url.pathname;
    const isExempt = path.includes('onboarding') || path.includes('settings');
    if ($rayStateLoaded && $needsOnboarding && !isExempt) {
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

  <!-- Data Inspector (Cmd+Shift+D to toggle) -->
  <DataInspector open={$inspectorOpen} onClose={() => inspectorOpen.close()} />
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
