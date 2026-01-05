<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { rayState, needsOnboarding } from '$lib/coach/store';
  import { RAY_VOICE, type OnboardingPhase } from '$lib/coach/ray';
  import { createEntity } from '$lib/db/client';
  import { loadEntities } from '$lib/stores/entities';
  import { persona, platforms, syncAllPlatforms } from '$lib/persona/store';
  import { hasApiKey } from '$lib/ai';
  import {
    extractDomains as aiExtractDomains,
    extractWorkEntities as aiExtractWorkEntities,
    extractFamilyEntities as aiExtractFamilyEntities,
    extractEvents as aiExtractEvents,
    extractHealthEntities as aiExtractHealthEntities,
    extractIntegrations as aiExtractIntegrations,
    type ExtractedEntity
  } from '$lib/ai/extraction';
  import PlatformInput from '$lib/components/PlatformInput.svelte';
  import FileDropZone from '$lib/components/FileDropZone.svelte';
  import UploadedFiles from '$lib/components/UploadedFiles.svelte';
  import Markdown from '$lib/components/Markdown.svelte';

  let messages = $state<{ role: 'ray' | 'user'; content: string }[]>([]);
  let inputValue = $state('');
  let isProcessing = $state(false);
  let currentPhase = $state<'api-setup' | OnboardingPhase>('api-setup');
  let showFileUpload = $state(false);
  let showPlatformInput = $state(false);

  // API key setup state
  let apiKeyInput = $state('');
  let apiKeyError = $state('');
  let checkingApiKey = $state(true);

  // Extracted data during onboarding
  let extractedDomains = $state<string[]>([]);
  let extractedEntities = $state<{ name: string; type: string; domain: string; description?: string; priority?: string }[]>([]);

  onMount(async () => {
    // Check if API key is already configured
    const hasKey = await hasApiKey();
    checkingApiKey = false;

    if (hasKey) {
      // Skip API setup, go straight to welcome
      currentPhase = 'welcome';
      addRayMessage(RAY_VOICE.onboarding.welcome);
    }
    // Otherwise stay on api-setup phase
  });

  async function saveApiKey() {
    if (!apiKeyInput.trim()) {
      apiKeyError = 'Please enter your API key';
      return;
    }

    if (!apiKeyInput.startsWith('sk-ant-')) {
      apiKeyError = 'Invalid API key format. It should start with sk-ant-';
      return;
    }

    apiKeyError = '';
    isProcessing = true;

    try {
      if (window.canopy?.setSecret) {
        await window.canopy.setSecret('claude_api_key', apiKeyInput);
      }
      // In web dev mode (no canopy API), proceed anyway with mock responses
      // Move to welcome phase
      currentPhase = 'welcome';
      addRayMessage(RAY_VOICE.onboarding.welcome);
    } catch (e) {
      apiKeyError = 'Failed to save API key';
    } finally {
      isProcessing = false;
    }
  }

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
        // Extract domains from input using AI
        extractedDomains = await aiExtractDomains(input);

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
        // Extract work entities using AI
        const workEntities = await aiExtractWorkEntities(input);
        const mappedWorkEntities = workEntities.map(e => ({
          name: e.name,
          type: e.type,
          domain: e.domain,
          description: e.description,
          priority: e.priority
        }));
        extractedEntities = [...extractedEntities, ...mappedWorkEntities];

        // Acknowledge and ask follow-up or move on
        if (mappedWorkEntities.length > 0) {
          const names = mappedWorkEntities.map(e => e.name).join(', ');
          addRayMessage(`Got it: ${names}. ${mappedWorkEntities.find(e => e.priority) ? `I'll keep ${mappedWorkEntities.find(e => e.priority)?.name} flagged as high-attention.` : ''}`);
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
        // Extract family members using AI
        const familyEntities = await aiExtractFamilyEntities(input);
        const mappedFamilyEntities = familyEntities.map(e => ({
          name: e.name,
          type: e.type,
          domain: e.domain,
          description: e.relationship || e.description,
        }));
        extractedEntities = [...extractedEntities, ...mappedFamilyEntities];

        if (mappedFamilyEntities.length > 0) {
          const names = mappedFamilyEntities.map(e => e.name).join(', ');
          addRayMessage(`Beautiful. ${mappedFamilyEntities.length} people: ${names}.`);

          await new Promise(r => setTimeout(r, 600));
          addRayMessage("Any family events coming up I should know about?");
          currentPhase = 'family-events';
        } else {
          currentPhase = 'health-details';
          addRayMessage(RAY_VOICE.onboarding.askHealthDetails);
        }
        break;

      case 'family-events':
        // Extract events using AI
        const events = await aiExtractEvents(input);
        if (events.length > 0) {
          for (const event of events) {
            extractedEntities.push({
              name: event.name,
              type: 'event',
              domain: event.domain || 'family',
              description: event.date || event.description,
              priority: event.priority === 'critical' ? 'non-negotiable' : undefined,
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
        // Extract health/fitness goals using AI
        const healthEntities = await aiExtractHealthEntities(input);
        const mappedHealthEntities = healthEntities.map(e => ({
          name: e.name,
          type: e.type,
          domain: e.domain,
          description: e.description,
        }));
        extractedEntities = [...extractedEntities, ...mappedHealthEntities];

        if (mappedHealthEntities.length > 0) {
          addRayMessage(`Added ${mappedHealthEntities[0].name} as your target.`);
        }

        await new Promise(r => setTimeout(r, 600));
        currentPhase = 'integrations';
        addRayMessage(RAY_VOICE.onboarding.askIntegrations);
        break;

      case 'integrations':
        // Note mentioned integrations using AI
        const integrations = await aiExtractIntegrations(input);
        for (const integration of integrations) {
          rayState.markIntegrationMentioned(integration as any);
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

  function handleApiKeyKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveApiKey();
    }
  }

  function startOnboarding() {
    currentPhase = 'domains';
    addRayMessage(RAY_VOICE.onboarding.askDomains);
  }

  function skipOnboarding() {
    // Mark onboarding as complete so user isn't redirected back
    rayState.completeOnboarding();
    goto('/');
  }

</script>

<div class="onboarding-container">
  <div class="onboarding-content">
    <!-- Logo -->
    <div class="logo">
      <span class="logo-icon">🌿</span>
    </div>

    <!-- API Key Setup Phase -->
    {#if currentPhase === 'api-setup'}
      {#if checkingApiKey}
        <div class="api-setup">
          <div class="typing">
            <span></span><span></span><span></span>
          </div>
        </div>
      {:else}
        <div class="api-setup">
          <h2>Welcome to Canopy</h2>
          <p class="api-description">
            Canopy uses Claude to understand your context and provide personalized guidance.
            To get started, you'll need a Claude API key.
          </p>

          <div class="api-input-group">
            <label for="api-key">Claude API Key</label>
            <input
              id="api-key"
              type="password"
              placeholder="sk-ant-..."
              bind:value={apiKeyInput}
              onkeydown={handleApiKeyKeydown}
              disabled={isProcessing}
            />
            {#if apiKeyError}
              <p class="api-error">{apiKeyError}</p>
            {/if}
          </div>

          <div class="api-actions">
            <button class="primary-btn" onclick={saveApiKey} disabled={isProcessing}>
              {isProcessing ? 'Saving...' : 'Continue'}
            </button>
          </div>

          <p class="api-help">
            Get your API key from the
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">
              Anthropic Console
            </a>
          </p>
        </div>
      {/if}
    {:else}
      <!-- Messages -->
      <div class="messages">
        {#each messages as message}
          <div class="message {message.role}">
            {#if message.role === 'ray'}
              <div class="ray-avatar">R</div>
            {/if}
            <div class="message-content">
              {#if message.role === 'ray'}
                <Markdown content={message.content} />
              {:else}
                {message.content}
              {/if}
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
          <button class="secondary-btn" onclick={skipOnboarding}>
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
    {/if}
  </div>
</div>

<style>
  .onboarding-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      180deg,
      #87ceeb 0%,
      #98d4a4 30%,
      #4a7c59 60%,
      #2d5a3d 100%
    );
    padding: var(--space-xl);
  }

  .onboarding-content {
    width: 100%;
    max-width: 500px;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    background: rgba(255, 255, 255, 0.95);
    padding: var(--space-xl);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    animation: slideUp 0.5s ease-out forwards;
  }

  .logo {
    text-align: center;
    font-size: 48px;
    margin-bottom: var(--space-md);
  }

  /* API Setup Styles */
  .api-setup {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    text-align: center;
  }

  .api-setup h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .api-description {
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0;
  }

  .api-input-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    text-align: left;
  }

  .api-input-group label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .api-input-group input {
    padding: var(--space-md);
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 15px;
    font-family: monospace;
  }

  .api-input-group input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .api-error {
    color: #dc2626;
    font-size: 13px;
    margin: 0;
  }

  .api-actions {
    display: flex;
    justify-content: center;
  }

  .api-help {
    font-size: 13px;
    color: var(--text-muted);
    margin: 0;
  }

  .api-help a {
    color: var(--accent);
    text-decoration: none;
  }

  .api-help a:hover {
    text-decoration: underline;
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
    background: var(--bg-tertiary);
    border-radius: var(--radius-lg);
    color: var(--text-primary);
    font-size: 15px;
    line-height: 1.6;
    white-space: pre-line;
    max-width: 85%;
  }

  .typing {
    display: flex;
    gap: 4px;
    padding: var(--space-md);
    justify-content: center;
  }

  .typing span {
    width: 8px;
    height: 8px;
    background: var(--text-muted);
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

  .primary-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .secondary-btn {
    padding: var(--space-sm) var(--space-lg);
    background: transparent;
    color: var(--text-muted);
    border: none;
    font-size: 14px;
    cursor: pointer;
  }

  .secondary-btn:hover {
    color: var(--text-primary);
  }

  .input-area {
    display: flex;
    gap: var(--space-sm);
  }

  .input-area input {
    flex: 1;
    padding: var(--space-md);
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    color: var(--text-primary);
    font-size: 15px;
  }

  .input-area input::placeholder {
    color: var(--text-muted);
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
    color: var(--text-muted);
    line-height: 1.5;
    text-align: center;
    padding: var(--space-md);
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
</style>
