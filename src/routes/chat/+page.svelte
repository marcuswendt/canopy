<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { entities } from '$lib/stores/entities';
  import {
    createThread,
    addMessage,
    getThreadMessages,
    extractEntitiesFromText,
    detectDomains,
    updateEntityMention
  } from '$lib/db/client';
  import type { Entity, Message } from '$lib/db/types';
  import DomainBadge from '$lib/components/DomainBadge.svelte';

  let inputValue = $state('');
  let messages = $state<Message[]>([]);
  let isLoading = $state(false);
  let threadId = $state<string | null>(null);
  let contextEntities = $state<Entity[]>([]);
  let threadDomains = $state<Set<string>>(new Set());
  
  onMount(async () => {
    const query = $page.url.searchParams.get('q');
    const entityId = $page.url.searchParams.get('entity');
    const existingThreadId = $page.url.searchParams.get('thread');
    
    if (existingThreadId) {
      threadId = existingThreadId;
      messages = await getThreadMessages(existingThreadId);
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
    inputValue = '';
    isLoading = true;
    
    if (!threadId) {
      const thread = await createThread(content.slice(0, 50));
      if (thread) threadId = thread.id;
    }
    
    const mentionedEntities = extractEntitiesFromText(content, $entities);
    const detectedDomains = detectDomains(content);
    
    for (const entity of mentionedEntities) {
      if (!contextEntities.find(e => e.id === entity.id)) {
        contextEntities = [...contextEntities, entity];
      }
      threadDomains.add(entity.domain);
      await updateEntityMention(entity.id);
    }
    
    for (const domain of detectedDomains) {
      threadDomains.add(domain);
    }
    threadDomains = threadDomains;
    
    const userMessage = await addMessage(threadId!, 'user', content, mentionedEntities.map(e => e.id));
    if (userMessage) messages = [...messages, userMessage];
    
    // Mock AI response - replace with Claude API
    setTimeout(async () => {
      const response = generateResponse(content, contextEntities);
      const assistantMessage = await addMessage(threadId!, 'assistant', response, []);
      if (assistantMessage) messages = [...messages, assistantMessage];
      isLoading = false;
    }, 800);
  }
  
  function generateResponse(query: string, context: Entity[]): string {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('training') || lowerQuery.includes('hmr') || lowerQuery.includes('balance')) {
      return `That tension makes sense. These aren't really separate compartments—they're drawing from the same well of energy and attention.\n\nLooking at what's live right now:\n\n• **Abel Tasman Jan 12-17** — one week away\n• **Samsung pitch** — active, high stakes\n• **HMR base phase** — 281 TSS behind target\n\nThe trip is non-negotiable family time. Samsung has a deadline. Training can flex.\n\nWhat if this week you focused on Saturday's long ride only, skipped Sunday, and gave yourself permission to be present for trip prep?`;
    }
    
    if (lowerQuery.includes('samsung') || lowerQuery.includes('pitch')) {
      return `Here's what I know about Samsung:\n\n• **Project**: One UI Visual Language rebrand\n• **Value**: £600-750K potential\n• **Status**: Active, high stakes\n\nYou last mentioned this 2 days ago. What's on your mind about it?`;
    }
    
    if (context.length > 0) {
      let response = `Based on what's active:\n\n`;
      for (const entity of context.slice(0, 3)) {
        response += `• **${entity.name}** — ${entity.description || entity.domain}\n`;
      }
      return response + `\nWhat would you like to explore?`;
    }
    
    return `I'm tracking several things that might be relevant:\n\n• **Samsung pitch** — work, active\n• **Abel Tasman** — family trip coming up\n• **HMR training** — base phase\n\nWhich area would you like to dig into?`;
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
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
      <div class="messages">
        {#each messages as message}
          <div class="message {message.role}">
            {#if message.role === 'user'}
              <div class="message-bubble">{message.content}</div>
            {:else}
              <div class="message-content">
                {@html message.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}
              </div>
            {/if}
          </div>
        {/each}
        
        {#if isLoading}
          <div class="message assistant">
            <div class="typing-indicator"><span></span><span></span><span></span></div>
          </div>
        {/if}
      </div>
      
      {#if messages.length >= 4 && !isLoading}
        <div class="memory-prompt animate-fade-in">
          <p>Want me to remember this pattern? The interplay between training, work, and family seems worth tracking.</p>
          <div class="memory-actions">
            <button class="memory-btn primary">Yes, remember this</button>
            <button class="memory-btn">Not now</button>
          </div>
        </div>
      {/if}
      
      <div class="input-area">
        <div class="input-container">
          <textarea
            placeholder="What's on your mind..."
            bind:value={inputValue}
            onkeydown={handleKeydown}
            rows="1"
          ></textarea>
          <div class="input-actions">
            <button class="input-action" title="Attach">📎</button>
            <button class="input-action" title="Voice">🎤</button>
            <button class="send-btn" onclick={sendMessage} disabled={!inputValue.trim() || isLoading}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <aside class="context-sidebar">
      <section class="context-section">
        <h3 class="context-title">Context</h3>
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
    </aside>
  </div>
</div>

<style>
  .chat-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
  }
  
  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    padding-top: 44px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
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
    line-height: 1.6;
    color: var(--text-primary);
  }
  
  .message-content :global(strong) { font-weight: 600; }
  
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
  
  .input-container textarea {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 15px;
    color: var(--text-primary);
    resize: none;
    padding: var(--space-sm);
    line-height: 1.4;
    font-family: inherit;
  }
  
  .input-container textarea::placeholder { color: var(--text-muted); }
  .input-container textarea:focus { outline: none; }
  
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
    width: 260px;
    border-left: 1px solid var(--border);
    background: var(--bg-secondary);
    padding: var(--space-md);
    overflow-y: auto;
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
