<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { rayState, needsOnboarding, rayStateLoaded } from '$lib/coach/store';
  import { get } from 'svelte/store';
  import { RAY_VOICE, type OnboardingPhase, getPersonalGreeting } from '$lib/coach/ray';
  import { createEntity, updateEntityMention, getEntities } from '$lib/client/db/client';
  import { loadEntities } from '$lib/client/stores/entities';
  import type { Entity } from '$lib/client/db/types';
  import { persona, platforms, syncAllPlatforms } from '$lib/persona/store';
  import { hasApiKey } from '$lib/ai';
  import { userSettings, guessLocation } from '$lib/client/stores/settings';
  import {
    generateOnboardingResponse,
    extractFromUrl,
    extractFromOnboardingDocument,
    type OnboardingContext,
    type OnboardingResponse,
    type OnboardingDocumentExtraction
  } from '$lib/ai/extraction';

  // URL regex for detecting links in user input
  const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  import PlatformInput from '$lib/client/components/PlatformInput.svelte';
  import FileDropZone from '$lib/client/components/FileDropZone.svelte';
  import UploadedFiles from '$lib/client/components/UploadedFiles.svelte';
  import VoiceInput from '$lib/client/components/VoiceInput.svelte';
  import Markdown from '$lib/client/components/Markdown.svelte';
  import { uploads, completedUploads, type FileUpload } from '$lib/client/uploads';
  import { getAvailableIntegrations } from '$lib/client/integrations/init';
  import { connectPlugin, pluginStates } from '$lib/client/integrations/registry';
  import StructuredInput, { type FieldConfig } from '$lib/client/components/StructuredInput.svelte';
  import MentionInput from '$lib/client/components/MentionInput.svelte';
  import EntityCarousel from '$lib/client/components/onboarding/EntityCarousel.svelte';
  import ConfirmationNotification from '$lib/client/components/onboarding/ConfirmationNotification.svelte';
  import CompletionSummary from '$lib/client/components/onboarding/CompletionSummary.svelte';

  let messages = $state<{ role: 'ray' | 'user'; content: string }[]>([]);
  let messagesEl = $state<HTMLDivElement | null>(null);
  let inputValue = $state('');
  let isProcessing = $state(false);
  // Simplified phases: api-setup → welcome → profile → conversation → complete
  let currentPhase = $state<'api-setup' | 'welcome' | 'profile' | 'conversation' | 'complete'>('api-setup');
  let showFileUpload = $state(false);
  let showPlatformInput = $state(false);

  // API key setup state
  let apiKeyInput = $state('');
  let apiKeyError = $state('');
  let checkingApiKey = $state(true);
  let isElectron = $state(false);
  let isWeb = $state(false);

  // Profile state (for StructuredInput)
  let profileValues = $state<Record<string, string>>({});
  let guessedLocation = $state('');
  let showFullProfileForm = $state(false);

  // Profile field configuration
  const profileFields: FieldConfig[] = [
    { id: 'name', label: 'Your name', required: true, placeholder: 'Marcus' },
    { id: 'nickname', label: 'Nickname', optional: true, placeholder: 'What friends call you' },
    { id: 'dob', label: 'Date of birth', type: 'date', optional: true },
    { id: 'location', label: 'Where are you based?', placeholder: 'City, Country' }
  ];

  // Collected data during onboarding (AI-driven)
  let collectedDomains = $state<string[]>([]);
  let collectedEntities = $state<{ name: string; type: string; domain: string; description?: string; relationship?: string; priority?: string; targetDate?: string; date?: string }[]>([]);
  let collectedUrls = $state<string[]>([]);

  // Existing entities from database (for duplicate detection)
  let existingEntities = $state<Entity[]>([]);

  // Normalize name for duplicate detection (case-insensitive, trim, collapse spaces)
  function normalizeName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  // Check if an entity with this name already exists
  function entityExists(name: string): boolean {
    const normalized = normalizeName(name);
    // Check both existing DB entities and newly collected entities
    const inDb = existingEntities.some(e => normalizeName(e.name) === normalized);
    const inCollected = collectedEntities.some(e => normalizeName(e.name) === normalized);
    return inDb || inCollected;
  }

  // Check if a domain already exists
  function domainExists(type: string): boolean {
    // Check in existingEntities for domain-type entities
    const inDb = existingEntities.some(e => e.type === 'domain' && e.domain === type);
    // Check in collectedDomains
    const inCollected = collectedDomains.includes(type);
    return inDb || inCollected;
  }

  // Entities pending confirmation (companies/organisations that are ambiguous)
  let pendingConfirmations = $state<{ name: string; type: string; domain: string; description?: string }[]>([]);

  // Carousel confirmation state
  let showEntityCarousel = $state(false);
  let carouselComplete = $state(false);
  let recentlyAdded = $state<{ name: string; type: string }[]>([]);
  let carouselConfirmedEntities = $state<{ name: string; type: string; domain?: string; relationship?: string }[]>([]);

  // Integration picker state
  let showIntegrationPicker = $state(false);
  let selectedIntegrations = $state<string[]>([]);
  let connectingIntegrations = $state(false);
  const availableIntegrations = getAvailableIntegrations();

  // Multi-modal input state
  let showFileDropZone = $state(false);
  let voiceError = $state('');

  // Track integrations: what's been offered and what's connected
  let offeredIntegrations = $state<string[]>([]);
  let pendingIntegration = $state<string | null>(null); // Integration suggested by AI, waiting to show

  // Filter which integrations to show (null = show all)
  let integrationFilter = $state<string[] | null>(null);

  // Derived: integrations to display (filtered or all)
  let displayedIntegrations = $derived(
    integrationFilter
      ? availableIntegrations.filter(i => integrationFilter!.includes(i.id))
      : availableIntegrations
  );

  // Derived: connected integrations
  let connectedIntegrations = $derived(
    [...$pluginStates.entries()].filter(([, state]) => state?.connected).map(([id]) => id)
  );

  onMount(async () => {
    // Guess location from system timezone
    guessedLocation = guessLocation();

    // Check if we're running in Electron or Web
    isElectron = typeof window !== 'undefined' && window.canopy?.setSecret !== undefined;
    isWeb = typeof window !== 'undefined' && !isElectron;

    // Web mode: API key is handled server-side
    if (isWeb) {
      profileValues = { ...profileValues, location: guessedLocation };

      // Check if API key is configured server-side
      const hasKey = await hasApiKey();
      checkingApiKey = false;

      if (hasKey) {
        // Start fresh onboarding
        currentPhase = 'welcome';
        addRayMessage(RAY_VOICE.onboarding.welcome);
        // Load existing entities for duplicate detection (don't block on this)
        try {
          existingEntities = await getEntities();
        } catch (e) {
          console.log('Could not load entities:', e);
        }
      } else {
        // Server doesn't have API key configured - show error
        apiKeyError = 'Claude API is not configured on this server. Please contact the administrator.';
      }
      return;
    }

    // Electron mode: API key is stored locally
    if (!isElectron) {
      // Neither web nor Electron - shouldn't happen, but handle gracefully
      profileValues = { ...profileValues, location: guessedLocation };
      checkingApiKey = false;
      return;
    }

    // Wait for ray state to load from persistence
    if (!get(rayStateLoaded)) {
      await new Promise<void>(resolve => {
        const unsubscribe = rayStateLoaded.subscribe(loaded => {
          if (loaded) {
            unsubscribe();
            resolve();
          }
        });
      });
    }

    // If onboarding is already complete, redirect to chat
    if (!get(needsOnboarding)) {
      goto('/chat');
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
      // Load existing entities for duplicate detection
      existingEntities = await getEntities();

      // If we have a saved profile, skip to conversation
      if (savedSettings.userName) {
        currentPhase = 'conversation';
        const displayName = savedSettings.nickname || savedSettings.userName;
        const greeting = getPersonalGreeting(displayName, savedSettings.location);
        addRayMessage(`${greeting}\n\nWelcome back. Let's continue where we left off.\n\nWhat are the main areas of your life that take your attention? Work, family, fitness, side projects...`);
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
      // Load existing entities for duplicate detection
      existingEntities = await getEntities();
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

  // Track which uploads we've already processed for AI response
  let processedUploadIds = $state<Set<string>>(new Set());

  // Store pre-extracted document data (Stage 1 results)
  let documentExtraction = $state<OnboardingDocumentExtraction | null>(null);

  // Process completed uploads and extract context for onboarding
  $effect(() => {
    const completed = $completedUploads;
    let hasNewDocuments = false;

    for (const upload of completed) {
      // Skip if already processed
      if (processedUploadIds.has(upload.id)) continue;

      // Mark as processed
      processedUploadIds = new Set([...processedUploadIds, upload.id]);

      // Check if this is a substantial document (not just an image)
      const hasContent = upload.textContent || upload.extracted?.text;
      if (hasContent && hasContent.length > 100) {
        hasNewDocuments = true;
      }

      if (upload.extracted?.entities && upload.extracted.entities.length > 0) {
        // Add extracted entities to our list
        for (const entity of upload.extracted.entities) {
          const exists = collectedEntities.some(e =>
            e.name.toLowerCase() === entity.name.toLowerCase()
          );
          if (!exists) {
            collectedEntities = [...collectedEntities, {
              name: entity.name,
              type: entity.type,
              domain: entity.domain || 'personal',
              description: entity.details?.description as string | undefined,
            }];
          }
        }
      }
    }

    // If we just processed a substantial document, trigger AI to respond intelligently
    if (hasNewDocuments && currentPhase === 'conversation' && !isProcessing) {
      // Auto-trigger AI response to process the document content
      processDocumentUpload();
    }
  });

  // Process a newly uploaded document using two-stage extraction
  async function processDocumentUpload() {
    isProcessing = true;

    // Gather document content from completed uploads
    const documentContents = $completedUploads
      .filter(u => u.textContent || u.extracted?.text)
      .map(u => ({
        filename: u.filename,
        content: u.textContent || u.extracted?.text || '',
      }))
      .filter(d => d.content.length > 0);

    if (documentContents.length === 0) {
      isProcessing = false;
      return;
    }

    // STAGE 1: Extract comprehensive data from the full document
    // This processes the complete document without truncation
    addRayMessage("Processing your document... I'll extract all the relevant information.");

    const fullContent = documentContents.map(d => d.content).join('\n\n---\n\n');
    const filename = documentContents.length === 1 ? documentContents[0].filename : 'multiple documents';

    const extraction = await extractFromOnboardingDocument(fullContent, filename);

    if (!extraction) {
      addRayMessage("I had trouble processing the document. Could you tell me a bit about yourself instead?");
      isProcessing = false;
      return;
    }

    // Store the extraction for use in carousel
    documentExtraction = extraction;
    console.log('Stage 1 complete:', extraction.entities.length, 'entities,', extraction.domains.length, 'domains');

    isProcessing = false;

    // Show confirmation message and launch carousel
    const totalItems = extraction.entities.length + extraction.domains.length;
    if (totalItems > 0) {
      addRayMessage(`I found ${totalItems} things in your document. Let's confirm what to add to your Canopy.`);
      await new Promise(r => setTimeout(r, 400));
      showEntityCarousel = true;
    } else {
      addRayMessage("I couldn't find specific entities in that document. Could you tell me more about yourself?");
    }
  }

  // Track URLs that have been fetched and their extracted context
  let fetchedUrlContexts = $state<Map<string, { title?: string; summary?: string; entities?: string[] }>>(new Map());

  /**
   * Fetch URL content in background and extract context
   * This runs asynchronously so it doesn't block the conversation
   * Uses Electron's ability to fetch without CORS restrictions when available
   */
  async function fetchUrlInBackground(url: string, platformId: string, scope: 'work' | 'personal') {
    try {
      let content: string | null = null;

      // Try fetching via Electron IPC if available (no CORS restrictions)
      if (window.canopy?.fetchUrl) {
        content = await window.canopy.fetchUrl(url);
      } else {
        // Fallback to direct fetch (may fail due to CORS)
        try {
          const response = await fetch(url, { mode: 'cors' });
          if (response.ok) {
            content = await response.text();
          }
        } catch {
          // CORS blocked - that's fine, we'll sync later
        }
      }

      if (content) {
        // Extract information using AI
        const extracted = await extractFromUrl(content, url);

        if (extracted) {
          // Store the context
          fetchedUrlContexts.set(url, {
            title: extracted.title,
            summary: extracted.summary,
            entities: extracted.entities?.map(e => e.name),
          });

          // Update persona with extracted profile info
          if (extracted.title || extracted.summary) {
            persona.setPlatformProfile(platformId, {
              name: extracted.title || url,
              bio: extracted.summary,
              url,
            });
          }

          // Add extracted entities to our knowledge
          if (extracted.entities) {
            for (const entity of extracted.entities) {
              const exists = collectedEntities.some(e =>
                e.name.toLowerCase() === entity.name.toLowerCase()
              );
              if (!exists) {
                collectedEntities = [...collectedEntities, {
                  name: entity.name,
                  type: entity.type,
                  domain: entity.domain || scope,
                  description: entity.source ? `From ${entity.source}` : undefined,
                }];
              }
            }
          }

          console.log(`Extracted context from ${url}:`, extracted.title);
        }
      } else {
        console.log(`Added ${url} to persona - will sync content later`);
      }
    } catch (error) {
      console.log(`Added ${url} to persona - will sync content later`);
    }
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
    // Handle conversation phase with AI-driven approach
    if (currentPhase === 'conversation') {
      await processConversation(input);
      return;
    }

    // Handle completion - redirect to chat
    if (currentPhase === 'complete') {
      goto(`/chat?q=${encodeURIComponent(input)}`);
      return;
    }

    // Default: move from welcome to profile
    if (currentPhase === 'welcome') {
      currentPhase = 'profile';
      addRayMessage(RAY_VOICE.onboarding.askProfile(guessedLocation));
    }
  }

  /**
   * AI-driven conversation flow
   * Single function that handles all onboarding conversation intelligently
   */
  async function processConversation(input: string) {
    try {
    // Extract URLs and add to persona (before AI call)
    const detectedUrls = input.match(URL_REGEX) || [];
    for (const url of detectedUrls) {
      const isWorkContext = /work|company|studio|business|job|career|field\.io/i.test(input);
      const scope = isWorkContext ? 'work' : 'personal';
      const platform = persona.addPlatform(url, scope);
      if (platform) {
        fetchUrlInBackground(url, platform.id, scope);
        if (!collectedUrls.includes(url)) {
          collectedUrls = [...collectedUrls, url];
        }
      }
    }

    // For long text inputs (likely pasted documents), run Stage 1 extraction first
    // This ensures comprehensive documents get proper structured extraction
    if (input.length > 500 && !documentExtraction) {
      console.log('Long input detected, running Stage 1 document extraction...');
      const extraction = await extractFromOnboardingDocument(input, 'pasted-content');
      if (extraction) {
        documentExtraction = extraction;
        console.log('Stage 1 complete:', extraction.entities.length, 'entities,', extraction.domains.length, 'domains');

        // Also populate collected data from extraction
        for (const domain of extraction.domains) {
          if (!collectedDomains.includes(domain.type)) {
            collectedDomains = [...collectedDomains, domain.type];
          }
        }
        for (const entity of extraction.entities) {
          if (!collectedEntities.some(e => e.name.toLowerCase() === entity.name.toLowerCase())) {
            collectedEntities = [...collectedEntities, {
              name: entity.name,
              type: entity.type,
              domain: entity.domain,
              description: entity.description,
            }];
          }
        }
      }
    }

    // Build context for AI - use pre-extracted document data if available
    const context: OnboardingContext = {
      messages: messages,
      collected: {
        domains: collectedDomains,
        entities: collectedEntities,
        urls: collectedUrls,
        integrations: connectedIntegrations,
        userName: profileValues.name,
        location: profileValues.location,
      },
      documentExtraction: documentExtraction || undefined, // Pass Stage 1 extraction if available
      availableIntegrations: availableIntegrations.map(i => ({
        id: i.id,
        name: i.name,
        description: i.description,
      })),
      offeredIntegrations: offeredIntegrations,
      connectedIntegrations: connectedIntegrations,
    };

    // Get AI response
    const response = await generateOnboardingResponse(context);

    // Update collected data from AI extraction
    if (response.extractedDomains && response.extractedDomains.length > 0) {
      for (const domain of response.extractedDomains) {
        // Check if this domain type already exists
        if (!domainExists(domain.type)) {
          collectedDomains = [...collectedDomains, domain.type];

          // Create a domain entity in the database
          const domainLabels: Record<string, string> = {
            work: 'Work & Career',
            family: 'Family & Home',
            sport: 'Sport & Fitness',
            personal: 'Personal Projects',
            health: 'Health & Wellness'
          };
          const created = await createEntity(
            'domain',
            domainLabels[domain.type] || domain.type,
            domain.type as any
          );
          if (created?.id) {
            await updateEntityMention(created.id);
            // Add to existingEntities so we don't create duplicates
            existingEntities = [...existingEntities, created];
          }

          // Also save to Ray state
          rayState.addDomain({
            id: domain.type,
            name: domainLabels[domain.type] || domain.type,
            type: domain.type,
            entities: [],
          });
        }
      }
    }

    if (response.extractedEntities && response.extractedEntities.length > 0) {
      for (const entity of response.extractedEntities) {
        // Check against both database and in-memory entities
        if (!entityExists(entity.name)) {
          // If entity needs confirmation (ambiguous company/org), add to pending list
          if (entity.needsConfirmation) {
            const alreadyPending = pendingConfirmations.some(
              p => normalizeName(p.name) === normalizeName(entity.name)
            );
            if (!alreadyPending) {
              pendingConfirmations = [...pendingConfirmations, {
                name: entity.name,
                type: entity.type,
                domain: entity.domain,
                description: entity.description
              }];
            }
            continue; // Don't auto-create, wait for confirmation
          }

          collectedEntities = [...collectedEntities, entity];
          // Save to database immediately
          const typeMap: Record<string, 'person' | 'project' | 'event' | 'concept' | 'goal' | 'focus'> = {
            person: 'person',
            project: 'project',
            company: 'project',
            event: 'event',
            goal: 'goal',
            focus: 'focus',
          };
          // Build description - include metadata for different entity types
          let description = entity.description || entity.relationship || '';
          if (entity.type === 'goal' || entity.type === 'focus') {
            const parts: string[] = [];
            if (entity.priority) parts.push(`Priority: ${entity.priority}`);
            if (entity.targetDate) parts.push(`Target: ${entity.targetDate}`);
            if (description) parts.push(description);
            description = parts.join(' | ');
          } else if (entity.type === 'event' && entity.date) {
            // Include date for events (birthdays, races, etc.)
            description = entity.date + (description ? ` | ${description}` : '');
          }
          const created = await createEntity(
            typeMap[entity.type] || 'project',
            entity.name,
            entity.domain as any,
            description
          );
          // Mark as mentioned so it shows up with a "last active" timestamp
          if (created?.id) {
            await updateEntityMention(created.id);
            // Add to existingEntities so we don't create duplicates in the same session
            existingEntities = [...existingEntities, created];
          }
        }
      }
    }

    // Show Ray's response
    addRayMessage(response.response);

    // Handle integration suggestion from AI
    if (response.suggestIntegration && !offeredIntegrations.includes(response.suggestIntegration)) {
      const integration = availableIntegrations.find(i => i.id === response.suggestIntegration);
      if (integration) {
        offeredIntegrations = [...offeredIntegrations, response.suggestIntegration];
        await new Promise(r => setTimeout(r, 600));
        addRayMessage(`I can connect with ${integration.name} to factor that data into our conversations. Want to set that up?`);
        showIntegrationPicker = true;
        integrationFilter = [response.suggestIntegration];
        selectedIntegrations = [response.suggestIntegration];
      }
    }

    // Check if onboarding is complete
    if (response.isComplete && !showIntegrationPicker) {
      await new Promise(r => setTimeout(r, 600));
      await finishOnboardingWithSummary();
    }
    } catch (err) {
      console.error('Onboarding conversation error:', err);
      addRayMessage("I had trouble processing that. Could you try rephrasing or sharing smaller pieces of information?");
    }
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

    // Move to AI-driven conversation
    currentPhase = 'conversation';
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
    collectedDomains = [];
    collectedEntities = [];
    collectedUrls = [];
    profileValues = {
      name: '',
      nickname: '',
      dob: '',
      location: guessedLocation
    };
    showFileUpload = false;
    showPlatformInput = false;
    showIntegrationPicker = false;
    showFullProfileForm = false;
    selectedIntegrations = [];
    integrationFilter = null;
    offeredIntegrations = [];
    pendingIntegration = null;

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
    integrationFilter = null;

    if (selectedIntegrations.length > 0) {
      const names = selectedIntegrations.map(id =>
        availableIntegrations.find(a => a.id === id)?.name || id
      ).join(', ');
      addRayMessage(`Connected: ${names}. I'll factor this data into my suggestions.`);
    }

    // Clear selection for next time
    selectedIntegrations = [];

    // Continue the conversation - AI decides what to ask next
    await continueConversationAfterIntegration();
  }

  async function continueConversationAfterIntegration() {
    isProcessing = true;

    // Build context - use pre-extracted document data if available
    const context: OnboardingContext = {
      messages: messages,
      collected: {
        domains: collectedDomains,
        entities: collectedEntities,
        urls: collectedUrls,
        integrations: connectedIntegrations,
        userName: profileValues.name,
        location: profileValues.location,
      },
      documentExtraction: documentExtraction || undefined,
      availableIntegrations: availableIntegrations.map(i => ({
        id: i.id,
        name: i.name,
        description: i.description,
      })),
      offeredIntegrations: offeredIntegrations,
      connectedIntegrations: connectedIntegrations,
    };

    // Get AI response
    const response = await generateOnboardingResponse(context);

    isProcessing = false;

    // Add any newly extracted domains
    if (response.extractedDomains && response.extractedDomains.length > 0) {
      for (const domain of response.extractedDomains) {
        if (!domainExists(domain.type)) {
          collectedDomains = [...collectedDomains, domain.type];
        }
      }
    }

    // Add any newly extracted entities
    if (response.extractedEntities) {
      for (const entity of response.extractedEntities) {
        if (entity.needsConfirmation) {
          pendingConfirmations = [...pendingConfirmations, entity];
        } else if (!collectedEntities.some(e => e.name === entity.name)) {
          collectedEntities = [...collectedEntities, entity];
        }
      }
    }

    // Show AI's next question
    addRayMessage(response.response);

    // Check if onboarding is complete
    if (response.isComplete) {
      await new Promise(r => setTimeout(r, 600));
      await finishOnboardingWithSummary();
    }
  }

  function skipIntegrations() {
    showIntegrationPicker = false;
    integrationFilter = null;
    selectedIntegrations = [];
    addRayMessage("No problem, you can always connect these later in Settings. What else should I know about your life?");
    // Continue the conversation - user will type their next message
  }

  // Confirm a pending entity (create it in the database)
  async function confirmPendingEntity(entity: { name: string; type: string; domain: string; description?: string }) {
    // Remove from pending
    pendingConfirmations = pendingConfirmations.filter(p => p.name !== entity.name);

    // Create the entity
    const typeMap: Record<string, 'person' | 'project' | 'event' | 'concept' | 'goal' | 'focus'> = {
      person: 'person',
      project: 'project',
      company: 'project',
      event: 'event',
      goal: 'goal',
      focus: 'focus',
    };
    const created = await createEntity(
      typeMap[entity.type] || 'project',
      entity.name,
      entity.domain as any,
      entity.description
    );
    if (created?.id) {
      await updateEntityMention(created.id);
      existingEntities = [...existingEntities, created];
      collectedEntities = [...collectedEntities, entity];
    }
  }

  // Reject a pending entity (don't create it)
  function rejectPendingEntity(entityName: string) {
    pendingConfirmations = pendingConfirmations.filter(p => p.name !== entityName);
  }

  // Confirm all pending entities
  async function confirmAllPending() {
    for (const entity of pendingConfirmations) {
      await confirmPendingEntity(entity);
    }
    pendingConfirmations = [];
  }

  // Reject all pending entities
  function rejectAllPending() {
    pendingConfirmations = [];
  }

  // Carousel event handlers
  async function handleCarouselConfirm(entity: { name: string; type: string; domain: string; description?: string; relationship?: string; priority?: string; date?: string }) {
    // Add to recently added for notification
    recentlyAdded = [...recentlyAdded, { name: entity.name, type: entity.type }];

    // Create the entity in the database
    const typeMap: Record<string, 'person' | 'project' | 'event' | 'concept' | 'goal' | 'focus' | 'domain'> = {
      person: 'person',
      project: 'project',
      company: 'project',
      event: 'event',
      goal: 'goal',
      focus: 'focus',
      domain: 'domain',
    };

    // Build description based on entity type
    let description = entity.description || entity.relationship || '';
    if (entity.type === 'goal' || entity.type === 'focus') {
      const parts: string[] = [];
      if (entity.priority) parts.push(`Priority: ${entity.priority}`);
      if (entity.date) parts.push(`Target: ${entity.date}`);
      if (description) parts.push(description);
      description = parts.join(' | ');
    } else if (entity.type === 'event' && entity.date) {
      description = entity.date + (description ? ` | ${description}` : '');
    }

    // Handle domain entities specially
    if (entity.type === 'domain') {
      const domainLabels: Record<string, string> = {
        work: 'Work & Career',
        family: 'Family & Home',
        sport: 'Sport & Fitness',
        personal: 'Personal Projects',
        health: 'Health & Wellness'
      };
      const created = await createEntity(
        'domain',
        domainLabels[entity.name] || entity.name,
        entity.name as any
      );
      if (created?.id) {
        await updateEntityMention(created.id);
        existingEntities = [...existingEntities, created];
      }
      if (!collectedDomains.includes(entity.name)) {
        collectedDomains = [...collectedDomains, entity.name];
      }
      rayState.addDomain({
        id: entity.name,
        name: domainLabels[entity.name] || entity.name,
        type: entity.name as 'work' | 'family' | 'sport' | 'personal' | 'health',
        entities: [],
      });
    } else {
      const created = await createEntity(
        typeMap[entity.type] || 'project',
        entity.name,
        (entity.domain || 'personal') as any,
        description
      );
      if (created?.id) {
        await updateEntityMention(created.id);
        existingEntities = [...existingEntities, created];
        collectedEntities = [...collectedEntities, entity];
      }
    }

    // Track in carousel confirmed list
    carouselConfirmedEntities = [...carouselConfirmedEntities, {
      name: entity.name,
      type: entity.type,
      domain: entity.domain,
      relationship: entity.relationship,
    }];
  }

  function handleCarouselComplete() {
    showEntityCarousel = false;
    carouselComplete = true;
  }

  async function handleCompletionContinue() {
    carouselComplete = false;
    carouselConfirmedEntities = [];
    recentlyAdded = [];
    await finishOnboardingWithSummary();
  }

  async function finishOnboardingWithSummary() {
    // Build structured summary from collected data
    let summary = '';

    // 1. Life Spaces/Domains - use clean type labels from rayState
    const currentState = get(rayState);
    const domains = currentState.lifeContext?.domains || [];
    if (domains.length > 0) {
      // Group by type and show clean labels
      const domainLabels: Record<string, string> = {
        work: 'Work & Career',
        family: 'Family & Home',
        sport: 'Sport & Fitness',
        personal: 'Personal Projects',
        health: 'Health & Wellness'
      };
      summary += '**Spaces:**\n';
      // Deduplicate by type
      const seenTypes = new Set<string>();
      const uniqueDomains = domains.filter(d => {
        if (seenTypes.has(d.type)) return false;
        seenTypes.add(d.type);
        return true;
      });
      summary += uniqueDomains.map(d => `  ◆ ${domainLabels[d.type] || d.type}`).join('\n');
    }

    // 2. Focuses (life themes - filter by type='focus')
    const focuses = collectedEntities.filter(e => e.type === 'focus');
    if (focuses.length > 0) {
      summary += '\n\n**Key focuses:**\n';
      // Sort by priority: critical first, then active, then background
      const priorityOrder = { critical: 0, active: 1, background: 2 };
      const sortedFocuses = [...focuses].sort((a, b) => {
        const aPri = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
        const bPri = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;
        return aPri - bPri;
      });
      summary += sortedFocuses.map(f => {
        let line = `  ◇ ${f.name}`;
        if (f.priority === 'critical') line += ' ⭐';
        return line;
      }).join('\n');
    }

    // 3. People (filter by type='person')
    const people = collectedEntities.filter(e => e.type === 'person');
    if (people.length > 0) {
      summary += '\n\n**People:**\n';
      summary += people.map(p =>
        `  └── ${p.name}${p.relationship ? ` (${p.relationship})` : ''}`
      ).join('\n');
    }

    // 4. Projects (filter by type='project' or 'company')
    const projects = collectedEntities.filter(e => e.type === 'project' || e.type === 'company');
    if (projects.length > 0) {
      summary += '\n\n**Projects:**\n';
      summary += projects.map(p => {
        const domainLabel = p.domain === 'work' ? 'work' : p.domain === 'personal' ? 'side' : p.domain;
        return `  └── ${p.name}${domainLabel ? ` (${domainLabel})` : ''}`;
      }).join('\n');
    }

    // 5. Events (filter by type='event')
    const events = collectedEntities.filter(e => e.type === 'event');
    if (events.length > 0) {
      summary += '\n\n**Upcoming:**\n';
      summary += events.slice(0, 8).map(e => {
        let line = `  └── ${e.name}`;
        if (e.date) line += ` (${e.date})`;
        return line;
      }).join('\n');
    }

    // 6. Goals (filter by type='goal')
    const goals = collectedEntities.filter(e => e.type === 'goal');
    if (goals.length > 0) {
      summary += '\n\n**Goals:**\n';
      // Sort by priority: critical first, then active, then background
      const priorityOrder = { critical: 0, active: 1, background: 2 };
      const sortedGoals = [...goals].sort((a, b) => {
        const aPri = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
        const bPri = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;
        return aPri - bPri;
      });
      summary += sortedGoals.map(g => {
        let line = `  └── ${g.name}`;
        if (g.priority === 'critical') line += ' ⭐';
        if (g.targetDate) line += ` (${g.targetDate})`;
        return line;
      }).join('\n');
    }

    // 7. Digital presence - only show user's own profiles (not external references)
    // Filter to profiles that are clearly owned by the user (strava athlete pages, personal sites, company sites)
    const userName = profileValues.name?.toLowerCase() || '';
    const ownedPlatforms = $platforms.filter(p => {
      // Strava athlete profile is user's own
      if (p.type === 'strava' && p.url.includes('/athletes/')) return true;
      // LinkedIn profile is user's own
      if (p.type === 'linkedin') return true;
      // Instagram profile is user's own
      if (p.type === 'instagram') return true;
      // Personal website containing user's name
      if (p.url.toLowerCase().includes(userName.split(' ')[0]?.toLowerCase() || '')) return true;
      // Company websites mentioned as "work" scope are likely user's company
      if (p.scope === 'work' && (p.type === 'website' || p.type === 'portfolio')) return true;
      return false;
    });

    if (ownedPlatforms.length > 0) {
      summary += '\n\n**Connected profiles:**\n';
      summary += ownedPlatforms.map(p => `  └── ${p.profile?.name || p.handle || new URL(p.url).hostname}`).join('\n');
    }

    addRayMessage(`Here's your life as I understand it:\n\n${summary}\n\nReady when you are. What's on your mind?`);
    rayState.completeOnboarding();
    await loadEntities();
    currentPhase = 'complete';
  }

</script>

<div class="onboarding-container" id="onboarding">
  <div class="onboarding-content">
    <!-- Header with logo and actions -->
    <div class="onboarding-header">
      <a href="/settings" class="settings-link" title="Settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </a>
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
      {:else}
        <div class="header-spacer"></div>
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
      {:else if !isElectron && !isWeb}
        <div class="api-setup">
          <h2>Loading...</h2>
          <p class="api-description">
            Checking environment...
          </p>
        </div>
      {:else if isWeb && apiKeyError}
        <div class="api-setup">
          <h2>Configuration Error</h2>
          <p class="api-description">
            {apiKeyError}
          </p>
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

      <!-- Entity Carousel Confirmation -->
      {#if showEntityCarousel && documentExtraction}
        <EntityCarousel
          extractedEntities={documentExtraction.entities}
          extractedDomains={documentExtraction.domains}
          onConfirm={handleCarouselConfirm}
          onComplete={handleCarouselComplete}
        />
      {/if}

      <!-- Completion Summary -->
      {#if carouselComplete}
        <CompletionSummary
          confirmedEntities={carouselConfirmedEntities}
          onContinue={handleCompletionContinue}
        />
      {/if}

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
        <!-- If name is already filled, show a simple confirmation first -->
        {#if profileValues.name?.trim() && !showFullProfileForm}
          <div class="profile-confirm">
            <p class="confirm-greeting">Hi <strong>{profileValues.name}</strong>!</p>
            <p class="confirm-question">Is this your name?</p>
            <div class="confirm-actions">
              <button class="primary-btn" onclick={() => saveProfile()}>
                Yes, continue
              </button>
              <button class="secondary-btn" onclick={() => showFullProfileForm = true}>
                Edit details
              </button>
            </div>
          </div>
        {:else}
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
        {/if}
      {:else if showIntegrationPicker}
        <div class="integration-picker">
          <div class="integration-cards">
            {#each displayedIntegrations as integration (integration.id)}
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
      {:else}
        <!-- Multi-modal input area -->
        <div class="multimodal-input">
          {#if showFileDropZone}
            <div class="file-upload-area">
              <FileDropZone
                maxFiles={20}
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

            <MentionInput
              bind:value={inputValue}
              placeholder="Type, speak, or drop files..."
              disabled={isProcessing}
              onsubmit={handleSubmit}
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
      {/if}
    {/if}
  </div>

  <!-- Confirmation Notification Toast -->
  <ConfirmationNotification {recentlyAdded} />
</div>

<style>
  .onboarding-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      180deg,
      var(--gradient-sky) 0%,
      var(--gradient-mid) 30%,
      var(--gradient-low) 60%,
      var(--gradient-ground) 100%
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
    background: var(--card-bg);
    padding: var(--space-xl);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px var(--card-shadow);
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

  .settings-link {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    border-radius: var(--radius-full);
    transition: all var(--transition-fast);
    opacity: 0.6;
  }

  .settings-link:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    opacity: 1;
  }

  .header-spacer {
    width: 32px;
    position: absolute;
    right: 0;
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
    align-items: flex-end;
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

  /* Pending confirmations */
  .pending-confirmations {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-md);
    margin-bottom: var(--space-md);
    animation: fieldIn 0.3s ease forwards;
  }

  .pending-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-sm);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .pending-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .text-btn {
    background: none;
    border: none;
    color: var(--accent);
    font-size: 13px;
    cursor: pointer;
    padding: 4px 8px;
  }

  .text-btn:hover {
    text-decoration: underline;
  }

  .text-btn.muted {
    color: var(--text-muted);
  }

  .pending-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .pending-entity {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
  }

  .entity-name {
    flex: 1;
    font-size: 14px;
    color: var(--text-primary);
  }

  .entity-type {
    font-size: 12px;
    color: var(--text-muted);
    padding: 2px 6px;
    background: var(--bg-secondary);
    border-radius: var(--radius-sm);
  }

  .entity-actions {
    display: flex;
    gap: 4px;
  }

  .confirm-btn, .reject-btn {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .confirm-btn {
    background: var(--accent-muted);
    color: var(--accent);
  }

  .confirm-btn:hover {
    background: var(--accent);
    color: white;
  }

  .reject-btn {
    background: var(--bg-secondary);
    color: var(--text-muted);
  }

  .reject-btn:hover {
    background: var(--error-bg);
    color: var(--error);
  }

  /* Focus confirmations - interpretive themes */
  .focus-confirmations {
    border-color: var(--accent-muted);
  }

  .focus-confirmations .pending-header span {
    font-style: italic;
    color: var(--text-secondary);
  }

  .focus-entity {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-xs);
  }

  .focus-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    width: 100%;
  }

  .focus-content .entity-name {
    font-weight: 500;
  }

  .focus-description {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .focus-entity .entity-actions {
    align-self: flex-end;
    margin-top: var(--space-xs);
  }

  /* Profile confirmation UI */
  .profile-confirm {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    text-align: center;
    animation: fieldIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    opacity: 0;
  }

  .confirm-greeting {
    font-size: 20px;
    color: var(--text-primary);
    margin: 0;
  }

  .confirm-greeting strong {
    color: var(--accent);
  }

  .confirm-question {
    font-size: 15px;
    color: var(--text-secondary);
    margin: 0;
  }

  .confirm-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    align-items: center;
    margin-top: var(--space-sm);
  }
</style>
