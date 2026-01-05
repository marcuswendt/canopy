import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

// Sidebar state
export const sidebarOpen = writable(true);
export const sidebarTab = writable<'home' | 'threads' | 'entities' | 'memories'>('home');

// Current view/route
export const currentView = writable('home');

// Theme (day, twilight, dark)
export const theme = writable<'day' | 'twilight' | 'dark'>('day');

// Active thread ID
export const activeThreadId = writable<string | null>(null);

// Pinned items
export const pinnedItems = writable([
  { id: 'samsung', name: 'Samsung', domain: 'work', icon: '◆' },
  { id: 'hmr-2026', name: 'HMR 2026', domain: 'sport', icon: '🚴' },
]);

// Auto-detect and apply theme based on time
export function initTheme() {
  if (!browser) return;
  
  const updateTheme = () => {
    const hour = new Date().getHours();
    
    if (hour >= 6 && hour < 18) {
      theme.set('day');
    } else if (hour >= 18 && hour < 21) {
      theme.set('twilight');
    } else {
      theme.set('dark');
    }
  };
  
  // Initial set
  updateTheme();
  
  // Update every minute
  const interval = setInterval(updateTheme, 60000);
  
  // Apply to document
  theme.subscribe(t => {
    if (browser) {
      document.documentElement.setAttribute('data-theme', t);
    }
  });
  
  return () => clearInterval(interval);
}

// Format relative time
export function formatTimeAgo(dateString: string | undefined): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const now = Date.now();
  const diff = now - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// Format date for display
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
