<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { rayState, needsOnboarding } from '$lib/coach/store';
  import { RAY_VOICE, type OnboardingPhase } from '$lib/coach/ray';
  import { createEntity } from '$lib/db/client';
  import { loadEntities } from '$lib/stores/entities';
  import { persona, platforms, syncAllPlatforms } from '$lib/persona/store';
  import PlatformInput from '$lib/components/PlatformInput.svelte';
  import FileDropZone from '$lib/components/FileDropZone.svelte';
  import UploadedFiles from '$lib/components/UploadedFiles.svelte';

  let messages = $state<{ role: 'ray' | 'user'; content: string }[]>([]);
  let inputValue = $state('');
  let isProcessing = $state(false);
  let currentPhase = $state<OnboardingPhase>('welcome');
  let showFileUpload = $state(false);
  let showPlatformInput = $state(false);

  // Extracted data during onboarding
  let extractedDomains = $state<string[]>([]);
  let extractedEntities = $state<{ name: string; type: string; domain: string; description?: string; priority?: string }[]>([]);
  
  onMount(() => {
    // Start with Ray's welcome
    addRayMessage(RAY_VOICE.onboarding.welcome);
  });
  
  function addRayMessage(content: string) {
    messages = [...messages, { role: 'ray', content }];
  }
  
  function addUserMessage(content: string) {
    messages = [...messages, { role: 'user', content }];
  }
  
  async function handleSubmit() {
    if (!inputValue.trim() || isProcessing) return;
    
    const userInput = inputValue;
    inputValue = '';
    addUserMessage(userInput);
    isProcessing = true;
    
    // Process based on current phase
    await processInput(userInput);
    
    isProcessing = false;
  }
  
  async function processInput(input: string) {
    // Simulate processing delay
    await new Promise(r => setTimeout(r, 600));
    
    switch (currentPhase) {
      case 'welcome':
        // Move to domains
        currentPhase = 'domains';
        addRayMessage(RAY_VOICE.onboarding.askDomains);
        break;
        
      case 'domains':
        // Extract domains from input
        extractedDomains = extractDomains(input);
        
        if (extractedDomains.length > 0) {
          addRayMessage(RAY_VOICE.onboarding.confirmDomains(extractedDomains));
          
          await new Promise(r => setTimeout(r, 800));
          
          // Start with first domain details
          if (extractedDomains.some(d => d.toLowerCase().includes('work') || d.toLowerCase().includes('field'))) {
            currentPhase = 'work-details';
            addRayMessage(RAY_VOICE.onboarding.askWorkDetails);
          } else if (extractedDomains.some(d => d.toLowerCase().includes('family'))) {
            currentPhase = 'family-details';
            addRayMessage(RAY_VOICE.onboarding.askFamilyDetails);
          } else {
            currentPhase = 'review';
            await finishOnboarding();
          }
        } else {
          addRayMessage("I didn't quite catch that. What are the main areas of your life? For example: work, family, fitness...");
        }
        break;
        
      case 'work-details':
        // Extract work entities
        const workEntities = extractWorkEntities(input);
        extractedEntities = [...extractedEntities, ...workEntities];
        
        // Acknowledge and ask follow-up or move on
        if (workEntities.length > 0) {
          const names = workEntities.map(e => e.name).join(', ');
          addRayMessage(`Got it: ${names}. ${workEntities.find(e => e.priority) ? `I'll keep ${workEntities.find(e => e.priority)?.name} flagged as high-attention.` : ''}`);
        }
        
        await new Promise(r => setTimeout(r, 600));
        
        // Move to family if it exists
        if (extractedDomains.some(d => d.toLowerCase().includes('family'))) {
          currentPhase = 'family-details';
          addRayMessage(RAY_VOICE.onboarding.askFamilyDetails);
        } else if (extractedDomains.some(d => d.toLowerCase().includes('training') || d.toLowerCase().includes('sport') || d.toLowerCase().includes('racing'))) {
          currentPhase = 'health-details';
          addRayMessage(RAY_VOICE.onboarding.askHealthDetails);
        } else {
          currentPhase = 'integrations';
          addRayMessage(RAY_VOICE.onboarding.askIntegrations);
        }
        break;
        
      case 'family-details':
        // Extract family members
        const familyEntities = extractFamilyEntities(input);
        extractedEntities = [...extractedEntities, ...familyEntities];
        
        if (familyEntities.length > 0) {
          const names = familyEntities.map(e => e.name).join(', ');
          addRayMessage(`Beautiful. ${familyEntities.length} people: ${names}.`);
          
          await new Promise(r => setTimeout(r, 600));
          addRayMessage("Any family events coming up I should know about?");
          currentPhase = 'family-events';
        } else {
          currentPhase = 'health-details';
          addRayMessage(RAY_VOICE.onboarding.askHealthDetails);
        }
        break;
        
      case 'family-events':
        // Extract events
        const events = extractEvents(input);
        if (events.length > 0) {
          for (const event of events) {
            extractedEntities.push({
              name: event.name,
              type: 'event',
              domain: 'family',
              description: event.date,
              priority: event.nonNegotiable ? 'non-negotiable' : undefined,
            });
          }
          addRayMessage(`Marked. ${events[0].name} — I'll factor that into anything we discuss.`);
        }
        
        await new Promise(r => setTimeout(r, 600));
        
        if (extractedDomains.some(d => d.toLowerCase().includes('training') || d.toLowerCase().includes('sport') || d.toLowerCase().includes('racing'))) {
          currentPhase = 'health-details';
          addRayMessage("For your racing/training—what's the goal you're working toward?");
        } else {
          currentPhase = 'integrations';
          addRayMessage(RAY_VOICE.onboarding.askIntegrations);
        }
        break;
        
      case 'health-details':
        // Extract health/fitness goals
        const healthEntities = extractHealthEntities(input);
        extractedEntities = [...extractedEntities, ...healthEntities];
        
        if (healthEntities.length > 0) {
          addRayMessage(`Added ${healthEntities[0].name} as your target.`);
        }
        
        await new Promise(r => setTimeout(r, 600));
        currentPhase = 'integrations';
        addRayMessage(RAY_VOICE.onboarding.askIntegrations);
        break;
        
      case 'integrations':
        // Note mentioned integrations
        const integrations = extractIntegrations(input);
        for (const integration of integrations) {
          rayState.markIntegrationMentioned(integration);
        }
        
        if (integrations.length > 0) {
          addRayMessage("Perfect. If you connect those later, I can factor that data into recommendations.");
        }
        
        await new Promise(r => setTimeout(r, 600));
        
        // Move to persona
        currentPhase = 'persona';
        showPlatformInput = true;
        addRayMessage(RAY_VOICE.onboarding.askPersona);
        break;
      
      case 'persona':
        // User responded to persona question
        // If they added platforms via UI, we're already done
        // If they typed something, check if it's a URL
        if (input.includes('.') && (input.includes('instagram') || input.includes('strava') || input.includes('linkedin') || input.includes('http'))) {
          persona.addPlatform(input);
        }
        
        const platformCount = $platforms.length;
        if (platformCount > 0) {
          addRayMessage(RAY_VOICE.onboarding.confirmPersona(platformCount));
          // Start syncing in background
          syncAllPlatforms();
        }
        
        await new Promise(r => setTimeout(r, 600));
        showPlatformInput = false;
        currentPhase = 'review';
        await finishOnboarding();
        break;
        
      case 'review':
        // User confirmed, complete onboarding
        await saveAndComplete();
        break;
    }
  }
  
  function skipPersona() {
    showPlatformInput = false;
    currentPhase = 'review';
    finishOnboarding();
  }
  
  function continueFromPersona() {
    const platformCount = $platforms.length;
    if (platformCount > 0) {
      addRayMessage(RAY_VOICE.onboarding.confirmPersona(platformCount));
      syncAllPlatforms();
    }
    showPlatformInput = false;
    currentPhase = 'review';
    finishOnboarding();
  }
  
  async function finishOnboarding() {
    // Generate summary
    let summary = '';
    
    // Group by domain
    const workEntities = extractedEntities.filter(e => e.domain === 'work');
    const familyEntities = extractedEntities.filter(e => e.domain === 'family');
    const sportEntities = extractedEntities.filter(e => e.domain === 'sport');
    const personalEntities = extractedEntities.filter(e => e.domain === 'personal');
    
    if (workEntities.length > 0) {
      summary += '◆ Work\n';
      for (const e of workEntities) {
        summary += `   └── ${e.name}${e.priority ? ` (${e.priority})` : ''}\n`;
      }
      summary += '\n';
    }
    
    if (familyEntities.length > 0) {
      summary += '♡ Family\n';
      for (const e of familyEntities) {
        summary += `   └── ${e.name}${e.description ? ` — ${e.description}` : ''}\n`;
      }
      summary += '\n';
    }
    
    if (sportEntities.length > 0) {
      summary += '🚴 Sport\n';
      for (const e of sportEntities) {
        summary += `   └── ${e.name}\n`;
      }
      summary += '\n';
    }
    
    if (personalEntities.length > 0) {
      summary += '◇ Personal\n';
      for (const e of personalEntities) {
        summary += `   └── ${e.name}\n`;
      }
      summary += '\n';
    }
    
    // Add connected platforms
    if ($platforms.length > 0) {
      summary += '🌐 Digital Presence\n';
      for (const p of $platforms) {
        const scopeIcon = p.scope === 'work' ? '💼' : '👤';
        summary += `   └── ${p.profile?.name || p.handle} ${scopeIcon}\n`;
      }
    }
    
    addRayMessage(RAY_VOICE.onboarding.review(summary));
  }
  
  async function saveAndComplete() {
    // Save all entities to database
    for (const entity of extractedEntities) {
      const typeMap: Record<string, 'person' | 'project' | 'event' | 'concept'> = {
        person: 'person',
        project: 'project',
        event: 'event',
        default: 'project',
      };
      
      await createEntity(
        typeMap[entity.type] || 'project',
        entity.name,
        entity.domain as any,
        entity.description
      );
      
      // Set priority if specified
      if (entity.priority) {
        const level = entity.priority === 'non-negotiable' || entity.priority === 'high stakes' 
          ? 'critical' 
          : 'active';
        // This would need entity ID, simplified for now
      }
    }
    
    // Add domains to Ray state
    for (const domain of extractedDomains) {
      const type = domain.toLowerCase().includes('work') || domain.toLowerCase().includes('field') ? 'work' :
                   domain.toLowerCase().includes('family') ? 'family' :
                   domain.toLowerCase().includes('train') || domain.toLowerCase().includes('sport') || domain.toLowerCase().includes('racing') ? 'sport' :
                   'personal';
      
      rayState.addDomain({
        id: domain.toLowerCase().replace(/\s+/g, '-'),
        name: domain,
        type,
        entities: extractedEntities.filter(e => e.domain === type).map(e => e.name),
      });
    }
    
    // Complete onboarding
    rayState.completeOnboarding();
    
    // Reload entities
    await loadEntities();
    
    addRayMessage("Perfect. I'm ready to help. What's on your mind?");
    
    // Navigate to home after a moment
    setTimeout(() => goto('/'), 1500);
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }
  
  function startOnboarding() {
    currentPhase = 'domains';
    addRayMessage(RAY_VOICE.onboarding.askDomains);
  }
  
  // Extraction helpers (simplified - would use Claude API in production)
  function extractDomains(input: string): string[] {
    const domains: string[] = [];
    const lower = input.toLowerCase();
    
    if (lower.includes('work') || lower.includes('field') || lower.includes('job') || lower.includes('client')) {
      domains.push('FIELD');
    }
    if (lower.includes('family') || lower.includes('wife') || lower.includes('kid') || lower.includes('children')) {
      domains.push('Family');
    }
    if (lower.includes('train') || lower.includes('racing') || lower.includes('sport') || lower.includes('fitness') || lower.includes('ultra')) {
      domains.push('Ultra-distance racing');
    }
    if (lower.includes('side project') || lower.includes('personal') || lower.includes('canopy')) {
      domains.push('Side projects');
    }
    if (lower.includes('health') || lower.includes('wellness')) {
      domains.push('Health');
    }
    
    return domains;
  }
  
  function extractWorkEntities(input: string): typeof extractedEntities {
    const entities: typeof extractedEntities = [];
    const lower = input.toLowerCase();
    
    if (lower.includes('samsung')) {
      entities.push({ 
        name: 'Samsung', 
        type: 'project', 
        domain: 'work',
        priority: lower.includes('big') || lower.includes('stake') || lower.includes('main') ? 'high stakes' : undefined,
      });
    }
    if (lower.includes('chanel') || lower.includes('113')) {
      entities.push({ name: 'Chanel', type: 'project', domain: 'work', description: '113 Spring' });
    }
    if (lower.includes('nike')) {
      entities.push({ name: 'Nike', type: 'project', domain: 'work' });
    }
    if (lower.includes('meta')) {
      entities.push({ name: 'Meta', type: 'project', domain: 'work' });
    }
    if (lower.includes('ibm')) {
      entities.push({ name: 'IBM', type: 'project', domain: 'work' });
    }
    
    return entities;
  }
  
  function extractFamilyEntities(input: string): typeof extractedEntities {
    const entities: typeof extractedEntities = [];
    
    // Simple name extraction - would use NER in production
    const namePatterns = [
      { pattern: /wife\s+(\w+)/i, type: 'wife' },
      { pattern: /(\w+)\s+\(wife\)/i, type: 'wife' },
      { pattern: /celine/i, name: 'Celine', type: 'wife' },
      { pattern: /rafael/i, name: 'Rafael', type: 'son' },
      { pattern: /luca/i, name: 'Luca', type: 'son' },
      { pattern: /elio/i, name: 'Elio', type: 'son' },
    ];
    
    for (const { pattern, name, type } of namePatterns) {
      if (pattern.test(input)) {
        const match = input.match(pattern);
        entities.push({
          name: name || match?.[1] || 'Unknown',
          type: 'person',
          domain: 'family',
          description: type,
        });
      }
    }
    
    // Extract ages if mentioned
    const agePattern = /(\w+)\s*\((\d+)\)/g;
    let match;
    while ((match = agePattern.exec(input)) !== null) {
      const existingIdx = entities.findIndex(e => e.name.toLowerCase() === match[1].toLowerCase());
      if (existingIdx >= 0) {
        entities[existingIdx].description = `age ${match[2]}`;
      }
    }
    
    return entities;
  }
  
  function extractEvents(input: string): { name: string; date: string; nonNegotiable: boolean }[] {
    const events: { name: string; date: string; nonNegotiable: boolean }[] = [];
    const lower = input.toLowerCase();
    
    if (lower.includes('abel tasman')) {
      // Try to extract dates
      const dateMatch = input.match(/jan(?:uary)?\s*(\d+)(?:\s*-\s*(\d+))?/i);
      const date = dateMatch ? `Jan ${dateMatch[1]}${dateMatch[2] ? `-${dateMatch[2]}` : ''}` : 'January';
      events.push({
        name: 'Abel Tasman',
        date,
        nonNegotiable: lower.includes('non-negotiable') || lower.includes('must') || lower.includes("can't miss"),
      });
    }
    
    return events;
  }
  
  function extractHealthEntities(input: string): typeof extractedEntities {
    const entities: typeof extractedEntities = [];
    const lower = input.toLowerCase();
    
    if (lower.includes('hmr') || lower.includes('haute route') || lower.includes('mavic')) {
      entities.push({ 
        name: 'HMR 2026', 
        type: 'project', 
        domain: 'sport',
        description: 'Haute Route Mavic',
      });
    }
    
    if (lower.includes('marathon')) {
      entities.push({ name: 'Marathon', type: 'project', domain: 'sport' });
    }
    
    return entities;
  }
  
  function extractIntegrations(input: string): Array<'whoop' | 'trainingpeaks' | 'calendar' | 'apple-health'> {
    const integrations: Array<'whoop' | 'trainingpeaks' | 'calendar' | 'apple-health'> = [];
    const lower = input.toLowerCase();
    
    if (lower.includes('whoop')) integrations.push('whoop');
    if (lower.includes('trainingpeaks') || lower.includes('training peaks')) integrations.push('trainingpeaks');
    if (lower.includes('calendar') || lower.includes('cal')) integrations.push('calendar');
    if (lower.includes('apple health') || lower.includes('health app')) integrations.push('apple-health');
    
    return integrations;
  }
</script>

<div class="onboarding-container">
  <div class="onboarding-content">
    <!-- Logo -->
    <div class="logo">
      <span class="logo-icon">🌿</span>
    </div>
    
    <!-- Messages -->
    <div class="messages">
      {#each messages as message}
        <div class="message {message.role}">
          {#if message.role === 'ray'}
            <div class="ray-avatar">R</div>
          {/if}
          <div class="message-content">
            {message.content}
          </div>
        </div>
      {/each}
      
      {#if isProcessing}
        <div class="message ray">
          <div class="ray-avatar">R</div>
          <div class="typing">
            <span></span><span></span><span></span>
          </div>
        </div>
      {/if}
    </div>
    
    <!-- Input or Start Button -->
    {#if currentPhase === 'welcome' && messages.length === 1}
      <div class="actions">
        <button class="primary-btn" onclick={startOnboarding}>
          Let's begin
        </button>
        <button class="secondary-btn" onclick={() => goto('/')}>
          I'll explore on my own
        </button>
      </div>
    {:else if currentPhase !== 'review' || messages[messages.length - 1]?.content.includes('ready to help')}
      <div class="input-area">
        <input
          type="text"
          placeholder="Type your response..."
          bind:value={inputValue}
          onkeydown={handleKeydown}
          disabled={isProcessing}
        />
        <button onclick={handleSubmit} disabled={!inputValue.trim() || isProcessing}>
          →
        </button>
      </div>
    {:else if currentPhase === 'persona'}
      <div class="persona-input-area">
        <PlatformInput onplatformAdded={(detail) => console.log('Added:', detail)} />

        <div class="persona-actions">
          <button class="primary-btn" onclick={continueFromPersona}>
            {$platforms.length > 0 ? 'Continue' : 'Skip for now'}
          </button>
        </div>
        
        <p class="privacy-note">
          {RAY_VOICE.onboarding.personaPrivacy}
        </p>
      </div>
    {:else}
      <div class="actions">
        <button class="primary-btn" onclick={saveAndComplete}>
          Looks good
        </button>
        <button class="secondary-btn" onclick={() => { currentPhase = 'domains'; }}>
          Let me adjust
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .onboarding-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(180deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%);
    padding: var(--space-xl);
  }
  
  .onboarding-content {
    width: 100%;
    max-width: 500px;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }
  
  .logo {
    text-align: center;
    font-size: 48px;
    margin-bottom: var(--space-md);
  }
  
  .messages {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    max-height: 400px;
    overflow-y: auto;
  }
  
  .message {
    display: flex;
    gap: var(--space-sm);
  }
  
  .message.user {
    justify-content: flex-end;
  }
  
  .message.user .message-content {
    background: var(--accent);
    color: white;
    border-radius: var(--radius-lg);
    border-bottom-right-radius: var(--radius-sm);
  }
  
  .ray-avatar {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-full);
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 14px;
    flex-shrink: 0;
  }
  
  .message-content {
    padding: var(--space-md);
    background: rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-lg);
    color: white;
    font-size: 15px;
    line-height: 1.6;
    white-space: pre-line;
    max-width: 85%;
  }
  
  .typing {
    display: flex;
    gap: 4px;
    padding: var(--space-md);
  }
  
  .typing span {
    width: 8px;
    height: 8px;
    background: rgba(255, 255, 255, 0.5);
    border-radius: 50%;
    animation: pulse 1.5s infinite;
  }
  
  .typing span:nth-child(2) { animation-delay: 0.2s; }
  .typing span:nth-child(3) { animation-delay: 0.4s; }
  
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    align-items: center;
  }
  
  .primary-btn {
    padding: var(--space-md) var(--space-xl);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-lg);
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
    min-width: 200px;
  }
  
  .primary-btn:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }
  
  .secondary-btn {
    padding: var(--space-sm) var(--space-lg);
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    border: none;
    font-size: 14px;
    cursor: pointer;
  }
  
  .secondary-btn:hover {
    color: white;
  }
  
  .input-area {
    display: flex;
    gap: var(--space-sm);
  }
  
  .input-area input {
    flex: 1;
    padding: var(--space-md);
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-lg);
    color: white;
    font-size: 15px;
  }
  
  .input-area input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }
  
  .input-area input:focus {
    outline: none;
    border-color: var(--accent);
  }
  
  .input-area button {
    width: 48px;
    height: 48px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-lg);
    font-size: 20px;
    cursor: pointer;
  }
  
  .input-area button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .persona-input-area {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }
  
  .persona-actions {
    display: flex;
    justify-content: center;
  }
  
  .privacy-note {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    line-height: 1.5;
    text-align: center;
    padding: var(--space-md);
    background: rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-md);
  }
</style>
