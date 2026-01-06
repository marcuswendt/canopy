<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { entities } from '$lib/client/stores/entities';
  import {
    createThread,
    addMessage,
    getThreadMessages,
    getRecentThreads,
    updateThread,
    extractEntitiesFromText,
    detectDomains,
    updateEntityMention,
    recordCoOccurrence,
    createMemory,
    getMemories
  } from '$lib/client/db/client';
  import { generateChatResponse, getReferencesForQuery, extractChatSuggestions } from '$lib/ai/extraction';
  import { selectRelevantMemories } from '$lib/ai/memory';
  import { hasApiKey, getFallbackMessage } from '$lib/ai';
  import {
    suggestionsByMessage,
    addSuggestion,
    confirmSuggestion,
    rejectSuggestion,
    confirmAllForMessage,
    rejectAllForMessage,
    startCleanupInterval,
    stopCleanupInterval
  } from '$lib/client/stores/suggestions';
  import SuggestionBar from '$lib/client/components/SuggestionBar.svelte';
  import { buildChatContext, estimateMessageTokens } from '$lib/ai/context';
  import type { Entity, Message, Thread, Memory } from '$lib/client/db/types';
  import type { ReferenceContext } from '$lib/reference/types';
  import DomainBadge from '$lib/client/components/DomainBadge.svelte';
  import MentionInput from '$lib/client/components/MentionInput.svelte';
  import ArtifactPanel from '$lib/client/components/ArtifactPanel.svelte';
  import Markdown from '$lib/client/components/Markdown.svelte';
  import FileDropZone from '$lib/client/components/FileDropZone.svelte';
  import UploadedFiles from '$lib/client/components/UploadedFiles.svelte';
  import { loadArtifacts } from '$lib/client/stores/artifacts';
  import { uploads, completedUploads, type FileUpload } from '$lib/client/uploads';
  import { userSettings } from '$lib/client/stores/settings';
  import { weather } from '$lib/client/stores/weather';

  let inputValue = $state('');
  let messages = $state<Message[]>([]);
  let isLoading = $state(false);
  let streamingContent = $state('');
  let threadId = $state<string | null>(null);
  let contextEntities = $state<Entity[]>([]);
  let threadDomains = $state<Set<string>>(new Set());
  let activeStream: { cancel: () => void } | null = null;
  let explicitMentions = $state<Entity[]>([]);
  let mentionInputRef: MentionInput;
  let showArtifacts = $state(true);
  let messagesContainer: HTMLDivElement;
  let memoryPromptDismissed = $state(false);
  let memoryPromptSaving = $state(false);
  let showFileUpload = $state(false);

  // Auto-scroll to bottom when messages change
  $effect(() => {
    // Track dependencies
    messages.length;
    streamingContent;
    // Scroll after DOM update
    if (messagesContainer) {
      requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      });
    }
  });

  // Context management state
  let threadSummary = $state<string | undefined>(undefined);
  let summaryUpToIndex = $state(0);

  onMount(async () => {
    // Start suggestion cleanup interval (Bonsai system)
    startCleanupInterval();

    // Load artifacts and user settings
    loadArtifacts();
    userSettings.load();
    const query = $page.url.searchParams.get('q');
    const entityId = $page.url.searchParams.get('entity');
    const existingThreadId = $page.url.searchParams.get('thread');

    if (existingThreadId) {
      threadId = existingThreadId;
      messages = await getThreadMessages(existingThreadId);

      // Load existing summary from thread
      const threads = await getRecentThreads(100);
      const currentThread = threads.find(t => t.id === existingThreadId);
      if (currentThread) {
        threadSummary = currentThread.summary;
        summaryUpToIndex = currentThread.summary_up_to || 0;
      }
    }

    if (entityId) {
      const entity = $entities.find(e => e.id === entityId);
      if (entity) {
        contextEntities = [entity];
        threadDomains.add(entity.domain);
      }
    }

    if (query) {
      inputValue = query;
      setTimeout(() => sendMessage(), 100);
    }
  });
  
  async function sendMessage() {
    if (!inputValue.trim() || isLoading) return;

    const content = inputValue;
    const currentExplicitMentions = [...explicitMentions];
    inputValue = '';
    explicitMentions = [];
    mentionInputRef?.clear();
    isLoading = true;

    if (!threadId) {
      const thread = await createThread(content.slice(0, 50));
      if (thread) threadId = thread.id;
    }

    // Combine explicit @mentions with implicit text detection
    const implicitEntities = extractEntitiesFromText(content, $entities);
    const mentionedEntities = [
      ...currentExplicitMentions,
      ...implicitEntities.filter(e => !currentExplicitMentions.find(m => m.id === e.id))
    ];
    const detectedDomains = detectDomains(content);
    
    for (const entity of mentionedEntities) {
      if (!contextEntities.find(e => e.id === entity.id)) {
        contextEntities = [...contextEntities, entity];
      }
      threadDomains.add(entity.domain);
      await updateEntityMention(entity.id);
    }

    // Record co-occurrence relationships between mentioned entities
    if (mentionedEntities.length >= 2) {
      await recordCoOccurrence(mentionedEntities.map(e => e.id));
    }

    for (const domain of detectedDomains) {
      threadDomains.add(domain);
    }
    threadDomains = threadDomains;
    
    const userMessage = await addMessage(threadId!, 'user', content, mentionedEntities.map(e => e.id));
    if (userMessage) messages = [...messages, userMessage];

    // Build optimized context using smart compaction
    const fullHistory = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const contextResult = await buildChatContext(content, {
      threadHistory: fullHistory,
      allEntities: $entities,
      existingSummary: threadSummary,
      summaryUpToIndex,
    });

    // Persist summary if compaction occurred
    if (contextResult.wasCompacted && contextResult.summary && threadId) {
      threadSummary = contextResult.summary;
      summaryUpToIndex = messages.length;
      await updateThread(threadId, {
        summary: contextResult.summary,
        summaryUpTo: messages.length,
      });
    }

    // Start streaming response
    streamingContent = '';
    const settings = userSettings.get();

    // Fetch weather if location is set
    let weatherContext: string | undefined;
    if (settings.location) {
      const weatherData = await weather.fetch(settings.location);
      if (weatherData) {
        weatherContext = weather.formatForContext(weatherData);
      }
    }

    // Fetch relevant memories for context
    let relevantMemories: Memory[] = [];
    try {
      const allMemories = await getMemories(50);
      relevantMemories = selectRelevantMemories(
        allMemories,
        content,
        mentionedEntities.map(e => e.id),
        5
      );
    } catch (err) {
      console.warn('Failed to fetch memories:', err);
    }

    // Search reference sources (Notion, Apple Notes) when relevant
    let referenceContext: ReferenceContext | undefined;
    try {
      referenceContext = await getReferencesForQuery(content, contextResult.entities);
    } catch (err) {
      console.warn('Failed to search references:', err);
    }

    // Capture the user message for memory extraction
    const userMessageContent = content;

    activeStream = generateChatResponse(
      content,
      {
        entities: contextResult.entities,
        memories: relevantMemories,
        threadHistory: contextResult.messages,
        userName: settings.userName,
        location: settings.location,
        weather: weatherContext,
        referenceContext,
      },
      {
        onDelta: (delta) => {
          streamingContent += delta;
        },
        onEnd: async () => {
          const finalContent = streamingContent;
          streamingContent = '';
          activeStream = null;

          const assistantMessage = await addMessage(threadId!, 'assistant', finalContent, []);
          if (assistantMessage) messages = [...messages, assistantMessage];
          isLoading = false;

          // Extract suggestions for Bonsai confirmation (non-blocking)
          extractAndCreateSuggestions(
            userMessageContent,
            finalContent,
            assistantMessage?.id || '',
            threadId!
          );
        },
        onError: async (error) => {
          console.error('Chat error:', error);
          streamingContent = '';
          activeStream = null;

          const errorMessage = getFallbackMessage({ error, code: 'STREAM_ERROR' });
          const assistantMessage = await addMessage(threadId!, 'assistant', errorMessage, []);
          if (assistantMessage) messages = [...messages, assistantMessage];
          isLoading = false;
        }
      }
    );
  }

  /**
   * Extract entity and memory suggestions for Bonsai confirmation
   * Runs in background to not block the UI
   */
  async function extractAndCreateSuggestions(
    userMessage: string,
    assistantResponse: string,
    messageId: string,
    sourceThreadId: string
  ) {
    console.log('[Bonsai] Starting suggestion extraction...', {
      userMessageLength: userMessage.length,
      assistantResponseLength: assistantResponse.length,
      messageId,
    });

    try {
      // Fetch existing data to avoid duplicates
      const existingMemories = await getMemories(50);
      console.log('[Bonsai] Existing data:', {
        entities: $entities.length,
        memories: existingMemories.length,
      });

      // Extract suggestions using the combined extraction
      const suggestions = await extractChatSuggestions(
        userMessage,
        assistantResponse,
        $entities,
        existingMemories
      );

      console.log('[Bonsai] Extraction result:', suggestions);

      // Add entity suggestions
      for (const entity of suggestions.entities) {
        addSuggestion({
          type: 'entity',
          messageId,
          threadId: sourceThreadId,
          entity: {
            name: entity.name,
            type: entity.type,
            domain: entity.domain,
            description: entity.description,
            relationship: entity.relationship,
            confidence: entity.confidence,
          },
        });
      }

      // Add memory suggestions
      for (const memory of suggestions.memories) {
        addSuggestion({
          type: 'memory',
          messageId,
          threadId: sourceThreadId,
          memory: {
            content: memory.content,
            importance: memory.importance,
            category: memory.category,
            entityNames: memory.entityNames,
          },
        });
      }

      const total = suggestions.entities.length + suggestions.memories.length;
      console.log(`[Bonsai] Created ${total} suggestions for confirmation`);
    } catch (err) {
      console.error('[Bonsai] Suggestion extraction failed:', err);
    }
  }

  /**
   * Save a pattern memory when user clicks "Yes, remember this"
   * Summarizes the conversation themes and entities discussed
   */
  async function savePatternMemory() {
    if (memoryPromptSaving || !threadId) return;

    memoryPromptSaving = true;

    try {
      // Build a summary of the conversation pattern
      const domains = [...threadDomains];
      const entityNames = contextEntities.map(e => e.name);

      // Create a pattern description based on what was discussed
      let patternContent = 'Pattern noted: ';

      if (domains.length > 1) {
        patternContent += `Cross-domain discussion connecting ${domains.join(', ')}. `;
      } else if (domains.length === 1) {
        patternContent += `Focus on ${domains[0]}. `;
      }

      if (entityNames.length > 0) {
        patternContent += `Involves: ${entityNames.join(', ')}.`;
      }

      // If we have specific themes, add them
      if (domains.includes('work') && domains.includes('family')) {
        patternContent = 'Pattern noted: The interplay between work and family life - tracking how these domains interact and affect each other.';
      } else if (domains.includes('sport') && domains.includes('work')) {
        patternContent = 'Pattern noted: Balancing athletic training with professional responsibilities - how these priorities compete and complement each other.';
      }

      // Add entity context if available
      if (entityNames.length > 0) {
        patternContent += ` Key entities: ${entityNames.join(', ')}.`;
      }

      await createMemory(
        patternContent,
        'thread',
        threadId,
        contextEntities.map(e => e.id),
        0.8 // High importance for user-confirmed patterns
      );

      memoryPromptDismissed = true;
      console.log('Pattern memory saved:', patternContent);
    } catch (err) {
      console.error('Failed to save pattern memory:', err);
    } finally {
      memoryPromptSaving = false;
    }
  }

  function dismissMemoryPrompt() {
    memoryPromptDismissed = true;
  }

  onDestroy(() => {
    // Clean up active stream
    if (activeStream) {
      activeStream.cancel();
    }
    // Stop suggestion cleanup interval
    stopCleanupInterval();
  });
</script>

<div class="chat-container">
  <header class="chat-header drag-region">
    <button class="back-btn no-drag" onclick={() => goto('/')}>← Back</button>
    <div class="header-domains no-drag">
      {#each [...threadDomains] as domain}
        <DomainBadge {domain} />
      {/each}
    </div>
    <button class="header-action no-drag">⋮</button>
  </header>
  
  <div class="chat-body">
    <div class="messages-area">
      <div class="messages" bind:this={messagesContainer}>
        {#each messages as message (message.id)}
          <div class="message {message.role}">
            {#if message.role === 'user'}
              <div class="message-bubble">{message.content}</div>
            {:else}
              <div class="message-content">
                <Markdown content={message.content} />
              </div>
            {/if}
          </div>

          {#if message.role === 'assistant'}
            {@const msgSuggestions = $suggestionsByMessage.get(message.id) || []}
            {#if msgSuggestions.length > 0}
              <SuggestionBar
                suggestions={msgSuggestions}
                onconfirm={confirmSuggestion}
                onreject={rejectSuggestion}
                onconfirmall={() => confirmAllForMessage(message.id)}
                onrejectall={() => rejectAllForMessage(message.id)}
              />
            {/if}
          {/if}
        {/each}

        {#if streamingContent}
          <div class="message assistant">
            <div class="message-content streaming">
              <Markdown content={streamingContent} />
              <span class="cursor">▌</span>
            </div>
          </div>
        {:else if isLoading}
          <div class="message assistant">
            <div class="typing-indicator"><span></span><span></span><span></span></div>
          </div>
        {/if}
      </div>
      
      {#if messages.length >= 4 && !isLoading && !memoryPromptDismissed && threadDomains.size >= 2}
        <div class="memory-prompt animate-fade-in">
          <p>Want me to remember this pattern? {#if threadDomains.has('work') && threadDomains.has('family')}The interplay between work and family seems worth tracking.{:else if threadDomains.has('sport') && threadDomains.has('work')}The balance between training and work seems worth tracking.{:else}The connection between {[...threadDomains].join(' and ')} seems worth tracking.{/if}</p>
          <div class="memory-actions">
            <button
              class="memory-btn primary"
              onclick={savePatternMemory}
              disabled={memoryPromptSaving}
            >
              {memoryPromptSaving ? 'Saving...' : 'Yes, remember this'}
            </button>
            <button class="memory-btn" onclick={dismissMemoryPrompt}>Not now</button>
          </div>
        </div>
      {/if}
      
      <div class="input-area">
        {#if showFileUpload}
          <div class="file-upload-container">
            <FileDropZone
              compact={false}
              onfilesAdded={(files) => {
                if (files.length > 0) {
                  showFileUpload = false;
                }
              }}
            />
            <button class="close-upload-btn" onclick={() => showFileUpload = false}>
              Done
            </button>
          </div>
        {/if}

        <UploadedFiles showSuggestions={false} />

        <div class="input-container">
          <MentionInput
            bind:this={mentionInputRef}
            bind:value={inputValue}
            placeholder="What's on your mind... (use @ to mention entities)"
            disabled={isLoading}
            onsubmit={sendMessage}
            onchange={(_, mentions) => { explicitMentions = mentions; }}
          />
          <div class="input-actions">
            <button
              class="input-action"
              class:active={showFileUpload}
              title="Attach files"
              onclick={() => showFileUpload = !showFileUpload}
            >📎</button>
            <button class="input-action" title="Voice">🎤</button>
            <button class="send-btn" onclick={sendMessage} disabled={!inputValue.trim() || isLoading}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <aside class="context-sidebar">
      <div class="sidebar-tabs">
        <button
          class="sidebar-tab"
          class:active={!showArtifacts}
          onclick={() => showArtifacts = false}
        >
          Context
        </button>
        <button
          class="sidebar-tab"
          class:active={showArtifacts}
          onclick={() => showArtifacts = true}
        >
          Artifacts
        </button>
      </div>

      {#if showArtifacts}
        <div class="artifact-container">
          <ArtifactPanel {contextEntities} />
        </div>
      {:else}
        <div class="context-content">
          <section class="context-section">
            <h3 class="context-title">Entities</h3>
            {#each contextEntities as entity}
              <div class="context-item">
                <span class="context-name">{entity.name}</span>
                {#if entity.description}
                  <span class="context-desc">{entity.description}</span>
                {/if}
                <DomainBadge domain={entity.domain} small />
              </div>
            {/each}
            {#if contextEntities.length === 0}
              <p class="empty-context">Entities mentioned will appear here.</p>
            {/if}
          </section>

          <section class="context-section">
            <h3 class="context-title">This Thread</h3>
            <div class="thread-meta">
              <span>Started today</span>
              <span>{messages.length} messages</span>
            </div>
            <div class="thread-domains">
              {#each [...threadDomains] as domain}
                <DomainBadge {domain} small />
              {/each}
            </div>
          </section>

          <button class="view-memories-btn">View all memories →</button>
        </div>
      {/if}
    </aside>
  </div>
</div>

<style>
  .chat-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: linear-gradient(
      180deg,
      var(--gradient-sky) 0%,
      var(--gradient-mid) 30%,
      var(--gradient-low) 60%,
      var(--gradient-ground) 100%
    );
    padding: var(--space-md);
    padding-top: 40px;
    gap: 0;
  }

  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    flex-shrink: 0;
  }
  
  .back-btn {
    padding: var(--space-sm) var(--space-md);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 14px;
  }
  
  .back-btn:hover { color: var(--text-primary); }
  
  .header-domains {
    display: flex;
    gap: var(--space-sm);
  }
  
  .header-action {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 18px;
    border-radius: var(--radius-sm);
  }
  
  .chat-body {
    flex: 1;
    display: flex;
    overflow: hidden;
    background: var(--bg-primary);
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    min-height: 0;
  }
  
  .messages-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  
  .message { max-width: 85%; }
  .message.user { align-self: flex-end; }
  .message.assistant { align-self: flex-start; }
  
  .message-bubble {
    background: var(--bg-tertiary);
    padding: var(--space-md);
    border-radius: var(--radius-lg);
    border-bottom-right-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: 15px;
    line-height: 1.5;
  }
  
  .message-content {
    font-size: 15px;
    color: var(--text-primary);
  }

  .message-content.streaming {
    display: flex;
    align-items: flex-end;
    gap: 2px;
  }

  .message-content.streaming :global(.markdown) {
    flex: 1;
  }
  
  .typing-indicator {
    display: flex;
    gap: 4px;
    padding: var(--space-md);
  }
  
  .typing-indicator span {
    width: 8px;
    height: 8px;
    background: var(--text-muted);
    border-radius: 50%;
    animation: pulse 1.5s infinite;
  }
  
  .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
  .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

  .cursor {
    display: inline-block;
    animation: blink 1s infinite;
    color: var(--accent);
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
  
  .memory-prompt {
    margin: var(--space-md) var(--space-lg);
    padding: var(--space-md);
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
    border-left: 3px solid var(--accent);
  }
  
  .memory-prompt p {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: var(--space-sm);
  }
  
  .memory-actions {
    display: flex;
    gap: var(--space-sm);
  }
  
  .memory-btn {
    padding: var(--space-xs) var(--space-md);
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 13px;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }
  
  .memory-btn.primary {
    background: var(--accent);
    color: white;
  }
  
  .input-area {
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
  }
  
  .input-container {
    display: flex;
    align-items: flex-end;
    gap: var(--space-sm);
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-sm);
  }
  
  .input-actions {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }
  
  .input-action {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: var(--radius-sm);
    font-size: 14px;
    transition: all 0.15s ease;
  }

  .input-action:hover {
    background: var(--bg-tertiary);
  }

  .input-action.active {
    background: var(--accent-muted);
    color: var(--accent);
  }

  .file-upload-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
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

  .send-btn {
    padding: var(--space-sm) var(--space-md);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
  
  .send-btn:hover:not(:disabled) { background: var(--accent-hover); }
  .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  
  .context-sidebar {
    width: 300px;
    border-left: 1px solid var(--border);
    background: var(--bg-secondary);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
  }

  .sidebar-tab {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .sidebar-tab:hover {
    color: var(--text-secondary);
    background: var(--bg-tertiary);
  }

  .sidebar-tab.active {
    color: var(--text-primary);
    border-bottom: 2px solid var(--accent);
    margin-bottom: -1px;
  }

  .artifact-container {
    flex: 1;
    overflow: hidden;
  }

  .context-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .context-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  
  .context-title {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .context-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-sm);
    background: var(--bg-primary);
    border-radius: var(--radius-sm);
  }
  
  .context-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }
  
  .context-desc {
    font-size: 12px;
    color: var(--text-muted);
  }
  
  .empty-context {
    font-size: 12px;
    color: var(--text-muted);
    font-style: italic;
  }
  
  .thread-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13px;
    color: var(--text-secondary);
  }
  
  .thread-domains {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-top: var(--space-xs);
  }
  
  .view-memories-btn {
    margin-top: auto;
    padding: var(--space-sm);
    border: none;
    background: transparent;
    color: var(--accent);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
  }
  
  .view-memories-btn:hover { text-decoration: underline; }
  
  @media (max-width: 900px) {
    .context-sidebar { display: none; }
  }
</style>
