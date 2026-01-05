<script lang="ts">
  // Voice Input Component using Web Speech API
  // Allows users to speak instead of typing

  interface Props {
    disabled?: boolean;
    onresult?: (transcript: string) => void;
    onerror?: (error: string) => void;
  }

  let {
    disabled = false,
    onresult,
    onerror,
  }: Props = $props();

  let isListening = $state(false);
  let transcript = $state('');
  let interimTranscript = $state('');
  let recognition: SpeechRecognition | null = $state(null);
  let isSupported = $state(false);

  // Check for Web Speech API support
  $effect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      isSupported = !!SpeechRecognition;

      if (isSupported && !recognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let finalTranscript = '';
          let interim = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              finalTranscript += result[0].transcript;
            } else {
              interim += result[0].transcript;
            }
          }

          if (finalTranscript) {
            transcript += finalTranscript;
          }
          interimTranscript = interim;
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error);
          isListening = false;

          if (event.error === 'no-speech') {
            onerror?.('No speech detected. Please try again.');
          } else if (event.error === 'audio-capture') {
            onerror?.('No microphone found. Please check your settings.');
          } else if (event.error === 'not-allowed') {
            onerror?.('Microphone access denied. Please enable it in your browser settings.');
          } else {
            onerror?.(`Speech recognition error: ${event.error}`);
          }
        };

        recognition.onend = () => {
          // If we were listening and it ended, we might want to restart or finalize
          if (isListening && transcript) {
            // User might be taking a pause, auto-stop after recognition ends
            stopListening();
          }
          isListening = false;
        };
      }
    }
  });

  function startListening() {
    if (!recognition || disabled) return;

    transcript = '';
    interimTranscript = '';
    isListening = true;

    try {
      recognition.start();
    } catch (e) {
      // Already started
      console.warn('Recognition already started');
    }
  }

  function stopListening() {
    if (!recognition) return;

    isListening = false;
    recognition.stop();

    // Send the final transcript
    const finalText = transcript.trim();
    if (finalText) {
      onresult?.(finalText);
    }

    transcript = '';
    interimTranscript = '';
  }

  function toggleListening() {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }
</script>

{#if isSupported}
  <button
    class="voice-btn"
    class:listening={isListening}
    onclick={toggleListening}
    {disabled}
    title={isListening ? 'Stop recording' : 'Start voice input'}
    aria-label={isListening ? 'Stop recording' : 'Start voice input'}
  >
    {#if isListening}
      <span class="mic-icon recording">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      </span>
    {:else}
      <span class="mic-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </span>
    {/if}
  </button>

  {#if isListening && (transcript || interimTranscript)}
    <div class="transcript-preview">
      <span class="final">{transcript}</span>
      <span class="interim">{interimTranscript}</span>
    </div>
  {/if}
{/if}

<style>
  .voice-btn {
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

  .voice-btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-muted);
  }

  .voice-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .voice-btn.listening {
    border-color: #dc2626;
    background: rgba(220, 38, 38, 0.1);
    color: #dc2626;
    animation: pulse-border 1.5s infinite;
  }

  @keyframes pulse-border {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4);
    }
    50% {
      box-shadow: 0 0 0 8px rgba(220, 38, 38, 0);
    }
  }

  .mic-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mic-icon.recording {
    animation: pulse-scale 0.5s infinite alternate;
  }

  @keyframes pulse-scale {
    from { transform: scale(0.9); }
    to { transform: scale(1.1); }
  }

  .transcript-preview {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
    margin-bottom: var(--space-sm);
    font-size: 14px;
    max-height: 80px;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .transcript-preview .final {
    color: var(--text-primary);
  }

  .transcript-preview .interim {
    color: var(--text-muted);
    font-style: italic;
  }
</style>
