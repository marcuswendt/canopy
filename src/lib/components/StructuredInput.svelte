<script lang="ts" module>
  /**
   * StructuredInput - A reusable component for collecting structured form data
   * within a chat-like interface. Supports text, date, select fields with
   * validation and staggered animations.
   */

  export interface FieldConfig {
    id: string;
    label: string;
    type?: 'text' | 'date' | 'select' | 'textarea';
    placeholder?: string;
    required?: boolean;
    optional?: boolean;
    hint?: string;
    options?: { value: string; label: string }[];
  }
</script>

<script lang="ts">
  interface Props {
    fields: FieldConfig[];
    values?: Record<string, string>;
    submitLabel?: string;
    disabled?: boolean;
    onsubmit?: (values: Record<string, string>) => void;
  }

  let {
    fields,
    values = $bindable({}),
    submitLabel = 'Continue',
    disabled = false,
    onsubmit,
  }: Props = $props();

  // Initialize values for all fields
  $effect(() => {
    for (const field of fields) {
      if (values[field.id] === undefined) {
        values[field.id] = '';
      }
    }
  });

  // Check if form is valid (all required fields have values)
  let isValid = $derived(
    fields.every(field => !field.required || values[field.id]?.trim())
  );

  function handleSubmit() {
    if (!isValid || disabled) return;
    onsubmit?.(values);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && isValid) {
      e.preventDefault();
      handleSubmit();
    }
  }
</script>

<div class="structured-input">
  <div class="fields">
    {#each fields as field, i (field.id)}
      <div class="field" style="animation-delay: {0.05 + i * 0.05}s">
        <label for={field.id}>
          {field.label}
          {#if field.required}
            <span class="required">*</span>
          {:else if field.optional}
            <span class="optional">(optional)</span>
          {/if}
        </label>

        {#if field.type === 'select' && field.options}
          <select
            id={field.id}
            bind:value={values[field.id]}
            {disabled}
          >
            <option value="">Select...</option>
            {#each field.options as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {:else if field.type === 'textarea'}
          <textarea
            id={field.id}
            placeholder={field.placeholder}
            bind:value={values[field.id]}
            {disabled}
            rows="3"
          ></textarea>
        {:else if field.type === 'date'}
          <input
            id={field.id}
            type="date"
            bind:value={values[field.id]}
            {disabled}
          />
        {:else}
          <input
            id={field.id}
            type="text"
            placeholder={field.placeholder}
            bind:value={values[field.id]}
            onkeydown={handleKeydown}
            {disabled}
          />
        {/if}

        {#if field.hint}
          <span class="hint">{field.hint}</span>
        {/if}
      </div>
    {/each}
  </div>

  <div class="actions" style="animation-delay: {0.05 + fields.length * 0.05 + 0.05}s">
    <button
      class="submit-btn"
      onclick={handleSubmit}
      disabled={!isValid || disabled}
    >
      {disabled ? 'Processing...' : submitLabel}
    </button>
  </div>
</div>

<style>
  .structured-input {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    animation: fieldIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    opacity: 0;
  }

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

  .field label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .field .required {
    color: #dc2626;
  }

  .field .optional {
    font-weight: 400;
    color: var(--text-muted);
    font-size: 12px;
  }

  .field input,
  .field select,
  .field textarea {
    padding: var(--space-md);
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 15px;
    font-family: inherit;
  }

  .field input:focus,
  .field select:focus,
  .field textarea:focus {
    outline: none;
    border-color: var(--accent);
  }

  .field textarea {
    resize: vertical;
    min-height: 80px;
  }

  .hint {
    font-size: 12px;
    color: var(--text-muted);
    font-style: italic;
  }

  .actions {
    display: flex;
    justify-content: center;
    margin-top: var(--space-sm);
    animation: fieldIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    opacity: 0;
  }

  .submit-btn {
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

  .submit-btn:hover:not(:disabled) {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }

  .submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
</style>
