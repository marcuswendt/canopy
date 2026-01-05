import { writable, derived } from 'svelte/store';
import type { Artifact, Entity } from '$lib/db/types';

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
  return [
    {
      id: 'hk-expansion',
      title: 'HK Expansion Plan',
      type: 'plan',
      content: `# FIELD Hong Kong Expansion

## Timeline
- Q1 2026: Market research & partner identification
- Q2 2026: Office setup & initial hiring
- Q3 2026: Soft launch with 2-3 anchor clients
- Q4 2026: Full operations

## Key Milestones
- [ ] Identify local design partner
- [ ] Secure office space in Central/Wan Chai
- [ ] Hire Country Lead
- [ ] First client signed

## Budget
Initial investment: $500K USD
- Office setup: $150K
- Hiring (first 6 months): $200K
- Marketing & BD: $100K
- Contingency: $50K

## Risks
1. Regulatory complexity
2. Finding right local talent
3. Competition from established agencies`,
      entities: JSON.stringify(['field', 'chanel']),
      domains: JSON.stringify(['work']),
      pinned: true,
      created_at: '2025-12-01T00:00:00Z',
      updated_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 'samsung-pitch',
      title: 'Samsung Pitch Deck Outline',
      type: 'document',
      content: `# Samsung One UI Rebrand Pitch

## Narrative Arc
1. Opening: The smartphone as life companion
2. Problem: Visual complexity creates cognitive load
3. Solution: One UI - Clarity through intention
4. Execution: Design system walkthrough
5. Close: Partnership vision

## Key Slides
- Current state audit (10 screens)
- User research highlights
- Design principles (3)
- Before/after comparisons
- Motion language preview
- Rollout roadmap

## Differentiators
- Our mobile-first heritage
- Korean market understanding
- Technical depth with design craft`,
      entities: JSON.stringify(['samsung']),
      domains: JSON.stringify(['work']),
      pinned: false,
      created_at: '2025-12-15T00:00:00Z',
      updated_at: new Date(Date.now() - 172800000).toISOString(),
    },
    {
      id: 'hmr-training',
      title: 'HMR 2026 Training Plan',
      type: 'plan',
      content: `# Haute Route Mavic 2026 Training

## Goal
Complete all stages, target top 50% overall

## Phase Overview
- **Base (Jan-Mar)**: Zone 2 focus, 10-12hr/week
- **Build (Apr-Jun)**: Intensity increase, 12-15hr/week
- **Peak (Jul-Aug)**: Race-specific, 15-18hr/week
- **Taper (Sep)**: Reduce volume, maintain intensity

## Weekly Structure
- Mon: Rest or easy spin
- Tue: Intervals (Zwift)
- Wed: Zone 2 endurance
- Thu: Tempo/Sweet spot
- Fri: Rest
- Sat: Long ride (outdoor)
- Sun: Recovery or group ride

## Key Workouts
- 4x8min @ threshold
- 3x20min sweet spot
- 5+ hour Z2 rides

## Metrics to Track
- CTL target: 90+ by race day
- FTP goal: 280W (4.0 W/kg)
- Weekly TSS: 600-800`,
      entities: JSON.stringify(['hmr-2026']),
      domains: JSON.stringify(['sport']),
      pinned: true,
      created_at: '2025-11-01T00:00:00Z',
      updated_at: new Date(Date.now() - 259200000).toISOString(),
    },
    {
      id: 'abel-tasman-packing',
      title: 'Abel Tasman Packing List',
      type: 'checklist',
      content: `# Abel Tasman Trip - Jan 12-17

## Gear
- [ ] Tent (confirm booking)
- [ ] Sleeping bags x5
- [ ] Sleeping pads
- [ ] Camping stove + fuel
- [ ] Water filter
- [ ] First aid kit
- [ ] Headlamps x3

## Clothing (per person)
- [ ] Hiking boots
- [ ] Rain jacket
- [ ] Warm layers
- [ ] Swim gear
- [ ] Hat & sunglasses

## Food
- [ ] Freeze-dried meals (10)
- [ ] Snacks
- [ ] Coffee/tea
- [ ] Kids' favorites

## Logistics
- [ ] Water taxi booking
- [ ] DOC hut passes
- [ ] Travel insurance
- [ ] Emergency contacts shared

## Kids' Entertainment
- [ ] Nature journal
- [ ] Binoculars
- [ ] Card games`,
      entities: JSON.stringify(['abel-tasman', 'celine', 'rafael', 'luca', 'elio']),
      domains: JSON.stringify(['family']),
      pinned: true,
      created_at: '2025-12-20T00:00:00Z',
      updated_at: new Date().toISOString(),
    },
  ];
}
