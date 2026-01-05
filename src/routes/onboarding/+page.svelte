<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { rayState, needsOnboarding } from '$lib/coach/store';
  import { RAY_VOICE, type OnboardingPhase, getPersonalGreeting } from '$lib/coach/ray';
  import { createEntity } from '$lib/db/client';
  import { loadEntities } from '$lib/stores/entities';
  import { persona, platforms, syncAllPlatforms } from '$lib/persona/store';
  import { hasApiKey } from '$lib/ai';
  import { userSettings, guessLocation } from '$lib/stores/settings';
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
  import VoiceInput from '$lib/components/VoiceInput.svelte';
  import Markdown from '$lib/components/Markdown.svelte';
  import { uploads, completedUploads, type FileUpload } from '$lib/uploads';
  import { getAvailableIntegrations } from '$lib/integrations/init';
  import { connectPlugin, pluginStates } from '$lib/integrations/registry';
  import StructuredInput, { type FieldConfig } from '$lib/components/StructuredInput.svelte';

  let messages = $state<{ role: 'ray' | 'user'; content: string }[]>([]);
  let messagesEl = $state<HTMLDivElement | null>(null);
  let inputValue = $state('');
  let isProcessing = $state(false);
  let currentPhase = $state<'api-setup' | OnboardingPhase>('api-setup');
  let showFileUpload = $state(false);
  let showPlatformInput = $state(false);

  // API key setup state
  let apiKeyInput = $state('');
  let apiKeyError = $state('');
  let checkingApiKey = $state(true);
  let isElectron = $state(false);

  // Profile state (for StructuredInput)
  let profileValues = $state<Record<string, string>>({});
  let guessedLocation = $state('');

  // Profile field configuration
  const profileFields: FieldConfig[] = [
    { id: 'name', label: 'Your name', required: true, placeholder: 'Marcus' },
    { id: 'nickname', label: 'Nickname', optional: true, placeholder: 'What friends call you' },
    { id: 'dob', label: 'Date of birth', type: 'date', optional: true },
    { id: 'location', label: 'Where are you based?', placeholder: 'City, Country' }
  ];

  // Extracted data during onboarding
  let extractedDomains = $state<string[]>([]);
  let extractedEntities = $state<{ name: string; type: string; domain: string; description?: string; priority?: string }[]>([]);

  // Integration picker state
  let showIntegrationPicker = $state(false);
  let selectedIntegrations = $state<string[]>([]);
  let connectingIntegrations = $state(false);
  const availableIntegrations = getAvailableIntegrations();

  // Multi-modal input state
  let showFileDropZone = $state(false);
  let voiceError = $state('');

  onMount(async () => {
    // Guess location from system timezone
    guessedLocation = guessLocation();

    // Check if we're running in Electron
    isElectron = typeof window !== 'undefined' && window.canopy?.setSecret !== undefined;

    if (!isElectron) {
      profileValues = { ...profileValues, location: guessedLocation };
      checkingApiKey = false;
      return;
    }

    // Load any previously saved profile data
    await userSettings.load();
    const savedSettings = userSettings.get();
    profileValues = {
      name: savedSettings.userName || '',
      nickname: savedSettings.nickname || '',
      dob: savedSettings.dateOfBirth || '',
      location: savedSettings.location || guessedLocation
    };

    // Check if API key is already configured
    const hasKey = await hasApiKey();
    checkingApiKey = false;

    if (hasKey) {
      // If we have a saved profile, skip to domains
      if (savedSettings.userName) {
        currentPhase = 'domains';
        const displayName = savedSettings.nickname || savedSettings.userName;
        const greeting = getPersonalGreeting(displayName, savedSettings.location);
        addRayMessage(`${greeting}\n\nWelcome back. Let's continue where we left off.`);
        await new Promise(r => setTimeout(r, 400));
        addRayMessage(RAY_VOICE.onboarding.askDomains);
      } else {
        // No saved profile, start fresh
        currentPhase = 'welcome';
        addRayMessage(RAY_VOICE.onboarding.welcome);
      }
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
      await window.canopy!.setSecret('claude_api_key', apiKeyInput);
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

  // Auto-scroll messages to bottom when new messages arrive
  $effect(() => {
    if (messagesEl && messages.length > 0) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        messagesEl?.scrollTo({
          top: messagesEl.scrollHeight,
          behavior: 'smooth'
        });
      });
    }
  });

  function handleVoiceResult(transcript: string) {
    // Use voice transcript as input
    inputValue = transcript;
    handleSubmit();
  }

  function handleVoiceError(error: string) {
    voiceError = error;
    // Clear error after 3 seconds
    setTimeout(() => { voiceError = ''; }, 3000);
  }

  function toggleFileDropZone() {
    showFileDropZone = !showFileDropZone;
  }

  function handleFilesAdded(files: FileUpload[]) {
    // Files are being processed in the background
    // They'll appear in UploadedFiles component
    if (files.length > 0) {
      const hasImages = files.some(f => f.mimeType.startsWith('image/'));
      const hasDocs = files.some(f => !f.mimeType.startsWith('image/'));

      if (hasImages && !hasDocs) {
        addRayMessage(`Got ${files.length} image${files.length > 1 ? 's' : ''}. Tell me who's in the photo${files.length > 1 ? 's' : ''} and I'll remember them.`);
      } else if (hasDocs && !hasImages) {
        addRayMessage(`Got ${files.length} document${files.length > 1 ? 's' : ''}. Processing...`);
      } else {
        addRayMessage(`Got ${files.length} file${files.length > 1 ? 's' : ''}. For photos, tell me who's in them.`);
      }
    }
  }

  // Process completed uploads and extract context for onboarding
  $effect(() => {
    const completed = $completedUploads;
    for (const upload of completed) {
      if (upload.extracted?.entities && upload.extracted.entities.length > 0) {
        // Add extracted entities to our list
        for (const entity of upload.extracted.entities) {
          const exists = extractedEntities.some(e =>
            e.name.toLowerCase() === entity.name.toLowerCase()
          );
          if (!exists) {
            extractedEntities = [...extractedEntities, {
              name: entity.name,
              type: entity.type,
              domain: entity.domain || 'personal',
              description: entity.details?.description,
            }];
          }
        }
      }
    }
  });

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
        const newDomains = await aiExtractDomains(input);

        if (newDomains.length > 0) {
          // Add to existing domains (accumulate across messages)
          extractedDomains = [...extractedDomains, ...newDomains];

          // IMPORTANT: Save domains immediately - never lose client data
          for (const domain of newDomains) {
            const type = domain.toLowerCase().includes('work') || domain.toLowerCase().includes('field') || domain.toLowerCase().includes('studio') || domain.toLowerCase().includes('company') ? 'work' :
                         domain.toLowerCase().includes('family') || domain.toLowerCase().includes('kids') || domain.toLowerCase().includes('wife') || domain.toLowerCase().includes('husband') || domain.toLowerCase().includes('partner') ? 'family' :
                         domain.toLowerCase().includes('train') || domain.toLowerCase().includes('sport') || domain.toLowerCase().includes('racing') || domain.toLowerCase().includes('cycling') || domain.toLowerCase().includes('running') || domain.toLowerCase().includes('fitness') ? 'sport' :
                         domain.toLowerCase().includes('health') || domain.toLowerCase().includes('wellness') ? 'health' :
                         'personal';
            rayState.addDomain({
              id: domain.toLowerCase().replace(/\s+/g, '-'),
              name: domain,
              type,
              entities: [],
            });
          }

          // Check which key life areas we're still missing
          const domainTypes = extractedDomains.map(d => {
            const lower = d.toLowerCase();
            if (lower.includes('work') || lower.includes('field') || lower.includes('studio') || lower.includes('company') || lower.includes('job') || lower.includes('career')) return 'work';
            if (lower.includes('family') || lower.includes('kids') || lower.includes('wife') || lower.includes('husband') || lower.includes('partner') || lower.includes('children')) return 'family';
            if (lower.includes('train') || lower.includes('sport') || lower.includes('racing') || lower.includes('cycling') || lower.includes('running') || lower.includes('fitness') || lower.includes('gym')) return 'sport';
            if (lower.includes('health') || lower.includes('wellness') || lower.includes('mental')) return 'health';
            return 'personal';
          });

          const hasWork = domainTypes.includes('work');
          const hasFamily = domainTypes.includes('family');
          const hasSportOrHealth = domainTypes.includes('sport') || domainTypes.includes('health');
          const hasPersonal = domainTypes.includes('personal');

          // Check if user just mentioned sport/health in this message
          const justAddedSportHealth = newDomains.some(d => {
            const lower = d.toLowerCase();
            return lower.includes('train') || lower.includes('sport') || lower.includes('racing') ||
                   lower.includes('cycling') || lower.includes('running') || lower.includes('fitness') ||
                   lower.includes('gym') || lower.includes('health') || lower.includes('wellness');
          });

          // Acknowledge what we got with a warm response
          addRayMessage(`Got it: ${newDomains.join(', ')}.`);
          await new Promise(r => setTimeout(r, 600));

          // Prompt for missing key areas with warmer, conversational tone
          if (!hasFamily) {
            addRayMessage("What about family and friends? Who's closest to you—partner, kids, parents?");
          } else if (!hasSportOrHealth) {
            addRayMessage("How about your health or fitness? Any goals you're working toward, or ways you stay active?");
          } else if (justAddedSportHealth && availableIntegrations.some(i => i.id === 'whoop')) {
            // User just mentioned fitness/health - offer WHOOP integration
            addRayMessage("Good moment to mention—I can connect with WHOOP to understand your recovery and readiness. Want to set that up now?");
            showIntegrationPicker = true;
            // Pre-select WHOOP
            selectedIntegrations = ['whoop'];
          } else if (!hasPersonal && extractedDomains.length < 4) {
            addRayMessage("What do you do in your free time? What are your passions and favourite activities?");
          } else {
            // We have a good picture - finish up
            addRayMessage(`Great—here's your life as I understand it:\n\n${extractedDomains.map(d => `  ◆ ${d}`).join('\n')}\n\nLet's get started! What's on your mind right now?`);
            // Complete onboarding
            rayState.completeOnboarding();
            await loadEntities();
            currentPhase = 'complete';
          }
        } else {
          // Check if user is saying "that's it" or similar
          const doneIndicators = ['that\'s it', 'thats it', 'that\'s all', 'nothing else', 'no', 'nope', 'done', 'move on', 'next', 'skip'];
          if (doneIndicators.some(d => input.toLowerCase().includes(d)) && extractedDomains.length > 0) {
            addRayMessage(`Great—here's your life as I understand it:\n\n${extractedDomains.map(d => `  ◆ ${d}`).join('\n')}\n\nLet's get started! What's on your mind right now?`);
            rayState.completeOnboarding();
            await loadEntities();
            currentPhase = 'complete';
          } else {
            addRayMessage("I didn't quite catch that. What are the main areas of your life? For example: work, family, fitness...");
          }
        }
        break;

      case 'domain-highlights':
        // Extract any entities mentioned at a high level (people, projects, events)
        const allEntities = await Promise.all([
          aiExtractWorkEntities(input),
          aiExtractFamilyEntities(input),
          aiExtractEvents(input),
        ]);
        const flatEntities = allEntities.flat();

        if (flatEntities.length > 0) {
          extractedEntities = flatEntities.map(e => ({
            name: e.name,
            type: e.type,
            domain: e.domain,
            description: e.description || e.relationship,
            priority: e.priority,
          }));

          // IMPORTANT: Save entities immediately - never lose client data
          for (const entity of flatEntities) {
            const typeMap: Record<string, 'person' | 'project' | 'event' | 'concept'> = {
              person: 'person',
              project: 'project',
              event: 'event',
              company: 'project',
              default: 'project',
            };
            await createEntity(
              typeMap[entity.type] || 'project',
              entity.name,
              entity.domain as any,
              entity.description || entity.relationship
            );
          }

          const names = flatEntities.slice(0, 5).map(e => e.name).join(', ');
          addRayMessage(`Noted: ${names}${flatEntities.length > 5 ? ` and ${flatEntities.length - 5} more` : ''}. I'll remember these.`);
        } else {
          addRayMessage("Got it. We can fill in the details as we go.");
        }

        await new Promise(r => setTimeout(r, 600));
        currentPhase = 'integrations';
        addRayMessage(RAY_VOICE.onboarding.askIntegrations);
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
          // Pre-select mentioned integrations
          if (availableIntegrations.some(a => a.id === integration) && !selectedIntegrations.includes(integration)) {
            selectedIntegrations = [...selectedIntegrations, integration];
          }
        }

        await new Promise(r => setTimeout(r, 400));

        // Show integration picker
        if (availableIntegrations.length > 0) {
          showIntegrationPicker = true;
          addRayMessage("Here are some integrations I can connect to. Pick any that would be useful, or skip if you'd rather set them up later.");
        } else {
          // No integrations available, move to persona
          currentPhase = 'persona';
          showPlatformInput = true;
          addRayMessage(RAY_VOICE.onboarding.askPersona);
        }
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

      case 'complete':
        // Onboarding is done - redirect to chat with their first question
        goto(`/chat?q=${encodeURIComponent(input)}`);
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
    // Domains and entities are already saved incrementally during onboarding
    // Just complete and reload

    // Complete onboarding
    rayState.completeOnboarding();

    // Reload entities so they appear in sidebar
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
    currentPhase = 'profile';
    addRayMessage(RAY_VOICE.onboarding.askProfile(guessedLocation));
  }

  async function saveProfile(values?: Record<string, string>) {
    const v = values || profileValues;
    if (!v.name?.trim()) return;

    isProcessing = true;

    // Save to settings store
    await userSettings.setUserName(v.name.trim());
    if (v.nickname?.trim()) {
      await userSettings.setNickname(v.nickname.trim());
    }
    if (v.dob) {
      await userSettings.setDateOfBirth(v.dob);
    }
    if (v.location?.trim()) {
      await userSettings.setLocation(v.location.trim());
    }

    const displayName = v.nickname?.trim() || v.name.trim();
    const greeting = getPersonalGreeting(displayName, v.location?.trim() || '');
    const locationNote = v.location?.trim() ? `I'll keep ${v.location.trim()} in mind for context.` : '';

    addRayMessage(`${greeting}\n\nI'm Ray—your guide through what matters. ${locationNote}\n\nNow let's map out your life so I can actually be useful.`);

    await new Promise(r => setTimeout(r, 600));

    // Move to domains
    currentPhase = 'domains';
    addRayMessage(RAY_VOICE.onboarding.askDomains);
    isProcessing = false;
  }

  function skipOnboarding() {
    // Mark onboarding as complete so user isn't redirected back
    rayState.completeOnboarding();
    goto('/');
  }

  function restartOnboarding() {
    // Reset all state
    messages = [];
    extractedDomains = [];
    extractedEntities = [];
    profileValues = {
      name: '',
      nickname: '',
      dob: '',
      location: guessedLocation
    };
    showFileUpload = false;
    showPlatformInput = false;
    showIntegrationPicker = false;
    selectedIntegrations = [];

    // Reset Ray state (clears domains, marks onboarding incomplete)
    rayState.reset();

    // Start fresh from welcome
    currentPhase = 'welcome';
    addRayMessage(RAY_VOICE.onboarding.welcome);
  }

  function toggleIntegration(integrationId: string) {
    if (selectedIntegrations.includes(integrationId)) {
      selectedIntegrations = selectedIntegrations.filter(id => id !== integrationId);
    } else {
      selectedIntegrations = [...selectedIntegrations, integrationId];
    }
  }

  async function connectSelectedIntegrations() {
    connectingIntegrations = true;

    // Try to connect each selected integration
    for (const integrationId of selectedIntegrations) {
      try {
        await connectPlugin(integrationId);
        rayState.markIntegrationMentioned(integrationId as any);
      } catch (error) {
        console.warn(`Failed to connect ${integrationId}:`, error);
        // Continue with other integrations
      }
    }

    connectingIntegrations = false;
    showIntegrationPicker = false;

    if (selectedIntegrations.length > 0) {
      const names = selectedIntegrations.map(id =>
        availableIntegrations.find(a => a.id === id)?.name || id
      ).join(', ');
      addRayMessage(`Connected: ${names}. I'll factor this data into my suggestions.`);
    }

    await new Promise(r => setTimeout(r, 600));

    // Continue with domain collection or finish
    await continueAfterIntegrations();
  }

  function skipIntegrations() {
    showIntegrationPicker = false;
    addRayMessage("No problem, you can always connect these later in Settings.");

    // Continue with domain collection or finish
    setTimeout(() => continueAfterIntegrations(), 600);
  }

  async function continueAfterIntegrations() {
    // Check if we still need to ask about passions/hobbies
    const domainTypes = extractedDomains.map(d => {
      const lower = d.toLowerCase();
      if (lower.includes('work') || lower.includes('field') || lower.includes('studio') || lower.includes('company')) return 'work';
      if (lower.includes('family') || lower.includes('kids') || lower.includes('wife') || lower.includes('husband') || lower.includes('partner')) return 'family';
      if (lower.includes('train') || lower.includes('sport') || lower.includes('racing') || lower.includes('cycling') || lower.includes('running') || lower.includes('fitness')) return 'sport';
      if (lower.includes('health') || lower.includes('wellness')) return 'health';
      return 'personal';
    });

    const hasPersonal = domainTypes.includes('personal');

    if (!hasPersonal && extractedDomains.length < 4) {
      // Ask about passions/hobbies
      currentPhase = 'domains';
      addRayMessage("What do you do in your free time? What are your passions and favourite activities?");
    } else {
      // We have a good picture - finish up
      addRayMessage(`Great—here's your life as I understand it:\n\n${extractedDomains.map(d => `  ◆ ${d}`).join('\n')}\n\nLet's get started! What's on your mind right now?`);
      rayState.completeOnboarding();
      await loadEntities();
      currentPhase = 'complete';
    }
  }

</script>

<div class="onboarding-container" id="onboarding">
  <div class="onboarding-content">
    <!-- Header with logo and restart -->
    <div class="onboarding-header">
      <div class="logo">
        <span class="logo-icon">🌿</span>
      </div>
      {#if currentPhase !== 'api-setup' && messages.length > 0}
        <button
          class="restart-btn"
          onclick={restartOnboarding}
          title="Restart onboarding"
        >
          ↻
        </button>
      {/if}
    </div>

    <!-- API Key Setup Phase -->
    {#if currentPhase === 'api-setup'}
      {#if checkingApiKey}
        <div class="api-setup">
          <div class="typing">
            <span></span><span></span><span></span>
          </div>
        </div>
      {:else if !isElectron}
        <div class="api-setup">
          <h2>Electron Required</h2>
          <p class="api-description">
            Canopy needs to run as a desktop app to securely store your API key and data.
          </p>
          <div class="electron-instructions">
            <p>Run the Electron app:</p>
            <code>npm run electron:dev</code>
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
      <div class="messages" bind:this={messagesEl}>
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
      {:else if currentPhase === 'profile'}
        <StructuredInput
          fields={profileFields.map(f =>
            f.id === 'location' && guessedLocation && profileValues.location === guessedLocation
              ? { ...f, hint: 'Based on your timezone' }
              : f
          )}
          bind:values={profileValues}
          submitLabel="Continue"
          disabled={isProcessing}
          onsubmit={saveProfile}
        />
      {:else if showIntegrationPicker}
        <div class="integration-picker">
          <div class="integration-cards">
            {#each availableIntegrations as integration (integration.id)}
              <button
                class="integration-card"
                class:selected={selectedIntegrations.includes(integration.id)}
                onclick={() => toggleIntegration(integration.id)}
                disabled={connectingIntegrations}
              >
                <span class="integration-icon">{integration.icon}</span>
                <span class="integration-name">{integration.name}</span>
                <span class="integration-desc">{integration.description}</span>
                {#if selectedIntegrations.includes(integration.id)}
                  <span class="check-mark">✓</span>
                {/if}
              </button>
            {/each}
          </div>

          <div class="integration-actions">
            <button
              class="primary-btn"
              onclick={connectSelectedIntegrations}
              disabled={connectingIntegrations}
            >
              {#if connectingIntegrations}
                Connecting...
              {:else if selectedIntegrations.length > 0}
                Connect {selectedIntegrations.length} integration{selectedIntegrations.length > 1 ? 's' : ''}
              {:else}
                Skip for now
              {/if}
            </button>
            {#if selectedIntegrations.length > 0}
              <button
                class="secondary-btn"
                onclick={skipIntegrations}
                disabled={connectingIntegrations}
              >
                Skip
              </button>
            {/if}
          </div>

          <p class="privacy-note">
            Data from integrations stays on your device and helps Ray understand your context better.
          </p>
        </div>
      {:else if currentPhase !== 'review' || messages[messages.length - 1]?.content.includes('ready to help')}
        <!-- Multi-modal input area -->
        <div class="multimodal-input">
          {#if showFileDropZone}
            <div class="file-upload-area">
              <FileDropZone
                acceptedTypes={['image/*', 'application/pdf', '.doc', '.docx', '.txt']}
                maxFiles={10}
                onfilesAdded={handleFilesAdded}
              />
              <button class="close-upload-btn" onclick={toggleFileDropZone}>
                Done
              </button>
            </div>
          {/if}

          <UploadedFiles showSuggestions={true} />

          {#if voiceError}
            <div class="voice-error">{voiceError}</div>
          {/if}

          <div class="input-area">
            <button
              class="input-action-btn"
              onclick={toggleFileDropZone}
              title="Add files or images"
              disabled={isProcessing}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>

            <input
              type="text"
              placeholder="Type, speak, or drop files..."
              bind:value={inputValue}
              onkeydown={handleKeydown}
              disabled={isProcessing}
            />

            <VoiceInput
              disabled={isProcessing}
              onresult={handleVoiceResult}
              onerror={handleVoiceError}
            />

            <button
              class="submit-btn"
              onclick={handleSubmit}
              disabled={!inputValue.trim() || isProcessing}
            >
              →
            </button>
          </div>

          <p class="input-hint">
            You can type, use voice, or drop photos and documents
          </p>
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
    max-height: calc(100vh - 2 * var(--space-xl));
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    background: rgba(255, 255, 255, 0.95);
    padding: var(--space-xl);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    animation: slideUp 0.5s ease-out forwards;
    overflow-y: auto;
  }

  .onboarding-header {
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    margin-bottom: var(--space-md);
  }

  .logo {
    text-align: center;
    font-size: 48px;
  }

  .restart-btn {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 32px;
    height: 32px;
    border: none;
    background: var(--bg-tertiary);
    color: var(--text-muted);
    border-radius: var(--radius-full);
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
    opacity: 0;
    animation: fadeIn 0.3s ease-out 0.5s forwards;
  }

  .restart-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
    transform: translateY(-50%) rotate(180deg);
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
    animation: fieldIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    opacity: 0;
  }

  .api-description {
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0;
    animation: fieldIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    animation-delay: 0.05s;
    opacity: 0;
  }

  .api-input-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    text-align: left;
    animation: fieldIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    animation-delay: 0.1s;
    opacity: 0;
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
    animation: fieldIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    animation-delay: 0.15s;
    opacity: 0;
  }

  .api-help {
    font-size: 13px;
    color: var(--text-muted);
    margin: 0;
    animation: fieldIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    animation-delay: 0.2s;
    opacity: 0;
  }

  .api-help a {
    color: var(--accent);
    text-decoration: none;
  }

  .api-help a:hover {
    text-decoration: underline;
  }

  .electron-instructions {
    background: var(--bg-tertiary);
    padding: var(--space-lg);
    border-radius: var(--radius-md);
    text-align: center;
    animation: fieldIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    animation-delay: 0.1s;
    opacity: 0;
  }

  .electron-instructions p {
    margin: 0 0 var(--space-sm) 0;
    color: var(--text-secondary);
    font-size: 14px;
  }

  .electron-instructions code {
    display: inline-block;
    background: var(--bg-primary);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    font-family: monospace;
    font-size: 14px;
    color: var(--accent);
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
    animation: messageIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    opacity: 0;
    transform-origin: left bottom;
  }

  .message.user {
    justify-content: flex-end;
    transform-origin: right bottom;
  }

  @keyframes messageIn {
    0% {
      opacity: 0;
      transform: scale(0.92) translateY(8px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
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
    animation: fadeIn 0.2s ease-out forwards;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
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
    animation: fieldIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    animation-delay: 0.1s;
    opacity: 0;
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
    animation: fieldIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    animation-delay: 0.1s;
    opacity: 0;
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

  /* Integration Picker */
  .integration-picker {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .integration-cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .integration-card {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-secondary);
    border: 2px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    position: relative;
  }

  .integration-card:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--accent-muted);
  }

  .integration-card.selected {
    background: var(--accent-muted);
    border-color: var(--accent);
  }

  .integration-card:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .integration-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .integration-name {
    font-weight: 600;
    color: var(--text-primary);
    flex-shrink: 0;
  }

  .integration-desc {
    font-size: 0.85rem;
    color: var(--text-muted);
    flex: 1;
  }

  .check-mark {
    color: var(--accent);
    font-weight: bold;
    font-size: 1.2rem;
  }

  .integration-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: center;
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

  /* fieldIn keyframe is used by various elements */
  @keyframes fieldIn {
    0% {
      opacity: 0;
      transform: translateY(12px) scale(0.96);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* Multi-modal input styles */
  .multimodal-input {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    animation: fieldIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    animation-delay: 0.1s;
    opacity: 0;
    position: relative;
  }

  .file-upload-area {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .close-upload-btn {
    align-self: flex-end;
    padding: var(--space-xs) var(--space-md);
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
  }

  .close-upload-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .voice-error {
    padding: var(--space-sm) var(--space-md);
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.3);
    border-radius: var(--radius-md);
    color: #dc2626;
    font-size: 13px;
    text-align: center;
  }

  .input-action-btn {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-full);
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .input-action-btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-muted);
  }

  .input-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .submit-btn {
    width: 48px;
    height: 48px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-lg);
    font-size: 20px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .input-hint {
    font-size: 12px;
    color: var(--text-muted);
    text-align: center;
    margin: 0;
  }
</style>
