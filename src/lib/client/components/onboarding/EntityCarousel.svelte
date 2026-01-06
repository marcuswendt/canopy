<script lang="ts">
  // EntityCarousel - Multi-step confirmation wizard for onboarding
  // Walks through entity types: Spaces → People → Projects → Goals → Focuses → Events

  import EntityTypeCard from './EntityTypeCard.svelte';

  interface ExtractedEntity {
    name: string;
    type: string;
    domain: string;
    description?: string;
    relationship?: string;
    priority?: string;
    date?: string;
  }

  interface ExtractedDomain {
    type: 'work' | 'family' | 'sport' | 'personal' | 'health';
    description?: string;
  }

  interface Props {
    extractedEntities: ExtractedEntity[];
    extractedDomains: ExtractedDomain[];
    onConfirm: (entity: ExtractedEntity) => void;
    onReject?: (entity: ExtractedEntity) => void;
    onComplete: () => void;
  }

  let { extractedEntities, extractedDomains, onConfirm, onReject, onComplete }: Props = $props();

  // Step configuration
  type StepType = 'spaces' | 'people' | 'projects' | 'goals' | 'focuses' | 'events';

  const STEP_CONFIG: Record<StepType, { title: string; header: string }> = {
    spaces: {
      title: 'Spaces',
      header: 'I discovered these as major domains of your life:',
    },
    people: {
      title: 'People',
      header: 'These people play an important role for you:',
    },
    projects: {
      title: 'Projects',
      header: 'I found these projects and companies:',
    },
    goals: {
      title: 'Goals',
      header: 'These goals stood out:',
    },
    focuses: {
      title: 'Focuses',
      header: 'I noticed these themes in what you shared:',
    },
    events: {
      title: 'Events',
      header: 'Important dates and events:',
    },
  };

  const STEP_ORDER: StepType[] = ['spaces', 'people', 'projects', 'goals', 'focuses', 'events'];

  // Track pending entities by type
  let pendingEntities = $state<ExtractedEntity[]>([...extractedEntities]);
  let pendingDomains = $state<ExtractedDomain[]>([...extractedDomains]);

  // Group entities by type
  let entitiesByType = $derived({
    spaces: pendingDomains.map(d => ({
      name: d.type,
      type: 'domain',
      domain: d.type,
      description: d.description,
    })) as ExtractedEntity[],
    people: pendingEntities.filter(e => e.type === 'person'),
    projects: pendingEntities.filter(e => e.type === 'project' || e.type === 'company'),
    goals: pendingEntities.filter(e => e.type === 'goal'),
    focuses: pendingEntities.filter(e => e.type === 'focus'),
    events: pendingEntities.filter(e => e.type === 'event'),
  });

  // Only show steps that have entities
  let activeSteps = $derived(
    STEP_ORDER.filter(step => entitiesByType[step].length > 0)
  );

  // Current step index
  let currentStepIndex = $state(0);
  let currentStep = $derived(activeSteps[currentStepIndex] || null);

  // Animation direction for transitions
  let direction = $state<'forward' | 'backward'>('forward');

  // Track confirmed entities for summary
  let confirmedEntities = $state<ExtractedEntity[]>([]);

  // Handle individual entity confirmation
  function handleConfirm(entity: ExtractedEntity) {
    confirmedEntities = [...confirmedEntities, entity];
    onConfirm(entity);

    if (currentStep === 'spaces') {
      pendingDomains = pendingDomains.filter(d => d.type !== entity.name);
    } else {
      pendingEntities = pendingEntities.filter(e => e.name !== entity.name);
    }
  }

  // Handle individual entity rejection (just remove from pending)
  function handleReject(entity: ExtractedEntity) {
    // Call onReject callback if provided (used for deleting from DB in summary review)
    if (onReject) {
      onReject(entity);
    }

    if (currentStep === 'spaces') {
      pendingDomains = pendingDomains.filter(d => d.type !== entity.name);
    } else {
      pendingEntities = pendingEntities.filter(e => e.name !== entity.name);
    }
  }

  // Handle confirm all for current step
  function handleConfirmAll() {
    if (!currentStep) return;

    const entities = entitiesByType[currentStep];
    for (const entity of entities) {
      confirmedEntities = [...confirmedEntities, entity];
      onConfirm(entity);
    }

    if (currentStep === 'spaces') {
      pendingDomains = [];
    } else {
      const typeFilter = currentStep === 'projects'
        ? (e: ExtractedEntity) => e.type !== 'project' && e.type !== 'company'
        : (e: ExtractedEntity) => e.type !== getEntityType(currentStep);
      pendingEntities = pendingEntities.filter(typeFilter);
    }

    advanceStep();
  }

  // Handle skip all for current step
  function handleSkipAll() {
    if (!currentStep) return;

    if (currentStep === 'spaces') {
      pendingDomains = [];
    } else {
      const typeFilter = currentStep === 'projects'
        ? (e: ExtractedEntity) => e.type !== 'project' && e.type !== 'company'
        : (e: ExtractedEntity) => e.type !== getEntityType(currentStep);
      pendingEntities = pendingEntities.filter(typeFilter);
    }

    advanceStep();
  }

  // Map step type to entity type
  function getEntityType(step: StepType): string {
    switch (step) {
      case 'spaces': return 'domain';
      case 'people': return 'person';
      case 'projects': return 'project';
      case 'goals': return 'goal';
      case 'focuses': return 'focus';
      case 'events': return 'event';
      default: return step;
    }
  }

  // Advance to next step or complete
  function advanceStep() {
    direction = 'forward';
    if (currentStepIndex < activeSteps.length - 1) {
      currentStepIndex++;
    } else {
      onComplete();
    }
  }

  // Check if we should auto-advance (all entities acted on)
  $effect(() => {
    if (currentStep && entitiesByType[currentStep].length === 0) {
      // Auto-advance if current step has no remaining entities
      if (currentStepIndex < activeSteps.length - 1) {
        setTimeout(() => {
          direction = 'forward';
          currentStepIndex++;
        }, 300);
      } else {
        setTimeout(() => {
          onComplete();
        }, 300);
      }
    }
  });

  // If no active steps, complete immediately
  $effect(() => {
    if (activeSteps.length === 0) {
      onComplete();
    }
  });
</script>

<div class="entity-carousel">
  {#if currentStep}
    <div class="carousel-content" class:slide-forward={direction === 'forward'}>
      {#key currentStep}
        <EntityTypeCard
          type={currentStep === 'spaces' ? 'space' : currentStep === 'people' ? 'person' : currentStep.slice(0, -1) as 'project' | 'goal' | 'focus' | 'event'}
          title={STEP_CONFIG[currentStep].title}
          headerText={STEP_CONFIG[currentStep].header}
          entities={entitiesByType[currentStep]}
          onConfirm={handleConfirm}
          onReject={handleReject}
          onConfirmAll={handleConfirmAll}
          onSkipAll={handleSkipAll}
        />
      {/key}
    </div>

    <!-- Step indicator -->
    <div class="step-indicator">
      {#each activeSteps as step, i (step)}
        <button
          class="step-dot"
          class:active={i === currentStepIndex}
          class:completed={i < currentStepIndex}
          onclick={() => {
            direction = i > currentStepIndex ? 'forward' : 'backward';
            currentStepIndex = i;
          }}
          title={STEP_CONFIG[step].title}
        >
          <span class="sr-only">{STEP_CONFIG[step].title}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .entity-carousel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 1rem 0;
  }

  .carousel-content {
    width: 100%;
    max-width: 420px;
    animation: slideIn 0.3s ease-out;
  }

  .carousel-content.slide-forward {
    animation: slideInFromRight 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes slideInFromRight {
    from {
      opacity: 0;
      transform: translateX(30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .step-indicator {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
  }

  .step-dot {
    width: 0.625rem;
    height: 0.625rem;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--border-light, #e0e0e0);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .step-dot:hover {
    background: var(--border, #ccc);
    transform: scale(1.2);
  }

  .step-dot.active {
    background: var(--accent-green, #10b981);
    transform: scale(1.3);
  }

  .step-dot.completed {
    background: var(--accent-green, #10b981);
    opacity: 0.5;
  }

  .step-dot:focus-visible {
    outline: 2px solid var(--accent, #3b82f6);
    outline-offset: 2px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
