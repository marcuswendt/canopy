import { writable, derived } from 'svelte/store';
import type { Artifact, Entity } from '$lib/client/db/types';

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.canopy !== undefined;

// Main store
export const artifacts = writable<Artifact[]>([]);
export const isLoading = writable(false);

// Parse JSON field helper
function parseJsonField<T>(value: string | undefined | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

// Load artifacts
export async function loadArtifacts() {
  isLoading.set(true);
  try {
    if (isElectron && window.canopy.getArtifacts) {
      const data = await window.canopy.getArtifacts();
      artifacts.set(data);
    } else {
      // Sample data for web dev
      artifacts.set(getSampleArtifacts());
    }
  } catch (error) {
    console.error('Failed to load artifacts:', error);
    artifacts.set(getSampleArtifacts());
  } finally {
    isLoading.set(false);
  }
}

// Create artifact
export async function createArtifact(
  title: string,
  type: Artifact['type'],
  content: string,
  entityIds?: string[],
  domains?: string[]
): Promise<Artifact | null> {
  if (isElectron && window.canopy.createArtifact) {
    const created = await window.canopy.createArtifact({
      title,
      type,
      content,
      entities: entityIds,
      domains,
      pinned: false,
    });
    artifacts.update(list => [...list, created]);
    return created;
  }

  // Mock for web dev
  const artifact: Artifact = {
    id: crypto.randomUUID(),
    title,
    type,
    content,
    entities: entityIds ? JSON.stringify(entityIds) : undefined,
    domains: domains ? JSON.stringify(domains) : undefined,
    pinned: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  artifacts.update(list => [...list, artifact]);
  return artifact;
}

// Update artifact content
export async function updateArtifact(
  id: string,
  updates: Partial<Pick<Artifact, 'title' | 'content' | 'pinned'>>
): Promise<void> {
  if (isElectron && window.canopy.updateArtifact) {
    const updated = await window.canopy.updateArtifact({ id, ...updates });
    artifacts.update(list =>
      list.map(a => a.id === id ? updated : a)
    );
    return;
  }

  // Mock for web dev
  artifacts.update(list =>
    list.map(a => {
      if (a.id === id) {
        return {
          ...a,
          ...updates,
          updated_at: new Date().toISOString(),
        };
      }
      return a;
    })
  );
}

// Delete artifact
export async function deleteArtifact(id: string): Promise<void> {
  artifacts.update(list => list.filter(a => a.id !== id));

  if (isElectron && window.canopy.deleteArtifact) {
    await window.canopy.deleteArtifact(id);
  }
}

// Get artifacts for specific entities
export function getArtifactsForEntities(
  entityIds: string[],
  $artifacts: Artifact[]
): Artifact[] {
  if (entityIds.length === 0) return [];

  return $artifacts.filter(artifact => {
    const artifactEntities = parseJsonField<string[]>(artifact.entities) || [];
    return entityIds.some(id => artifactEntities.includes(id));
  });
}

// Derived: pinned artifacts
export const pinnedArtifacts = derived(artifacts, ($artifacts) =>
  $artifacts.filter(a => a.pinned)
);

// Derived: recent artifacts
export const recentArtifacts = derived(artifacts, ($artifacts) =>
  [...$artifacts]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 10)
);

// Sample data for web dev
function getSampleArtifacts(): Artifact[] {
  // Empty - real artifacts come from database
  return [];
}
