// Data Inspector store
import { writable } from 'svelte/store';

function createInspectorStore() {
  const { subscribe, set, update } = writable(false);

  return {
    subscribe,
    open: () => set(true),
    close: () => set(false),
    toggle: () => update(v => !v),
  };
}

export const inspectorOpen = createInspectorStore();
