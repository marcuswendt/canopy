<script lang="ts">
  import { marked } from 'marked';

  interface Props {
    content: string;
    inline?: boolean;
  }

  let { content, inline = false }: Props = $props();

  // Configure marked for safe rendering
  marked.setOptions({
    breaks: true, // Convert \n to <br>
    gfm: true,    // GitHub Flavored Markdown
  });

  // Custom renderer for links to open in new tab
  const renderer = new marked.Renderer();
  renderer.link = ({ href, title, text }) => {
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };

  // Render markdown to HTML
  let html = $derived.by(() => {
    if (!content) return '';

    try {
      if (inline) {
        return marked.parseInline(content, { renderer }) as string;
      }
      return marked.parse(content, { renderer }) as string;
    } catch (e) {
      console.error('Markdown parsing error:', e);
      return content;
    }
  });
</script>

<div class="markdown" class:inline>
  {@html html}
</div>

<style>
  .markdown {
    line-height: 1.6;
    word-wrap: break-word;
  }

  .markdown.inline {
    display: inline;
  }

  .markdown :global(p) {
    margin: 0 0 0.75em 0;
  }

  .markdown :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown :global(strong) {
    font-weight: 600;
    color: var(--text-primary);
  }

  .markdown :global(em) {
    font-style: italic;
  }

  .markdown :global(code) {
    font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 0.9em;
    background: var(--bg-tertiary);
    padding: 0.15em 0.4em;
    border-radius: var(--radius-sm);
    color: var(--text-primary);
  }

  .markdown :global(pre) {
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    overflow-x: auto;
    margin: 0.75em 0;
  }

  .markdown :global(pre code) {
    background: none;
    padding: 0;
    font-size: 0.85em;
    line-height: 1.5;
  }

  .markdown :global(ul),
  .markdown :global(ol) {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }

  .markdown :global(li) {
    margin: 0.25em 0;
  }

  .markdown :global(li::marker) {
    color: var(--text-muted);
  }

  .markdown :global(blockquote) {
    margin: 0.75em 0;
    padding: 0.5em 1em;
    border-left: 3px solid var(--accent);
    background: var(--bg-secondary);
    color: var(--text-secondary);
  }

  .markdown :global(blockquote p) {
    margin: 0;
  }

  .markdown :global(h1),
  .markdown :global(h2),
  .markdown :global(h3),
  .markdown :global(h4) {
    margin: 1em 0 0.5em 0;
    font-weight: 600;
    color: var(--text-primary);
  }

  .markdown :global(h1:first-child),
  .markdown :global(h2:first-child),
  .markdown :global(h3:first-child),
  .markdown :global(h4:first-child) {
    margin-top: 0;
  }

  .markdown :global(h1) { font-size: 1.5em; }
  .markdown :global(h2) { font-size: 1.3em; }
  .markdown :global(h3) { font-size: 1.1em; }
  .markdown :global(h4) { font-size: 1em; }

  .markdown :global(a) {
    color: var(--accent);
    text-decoration: none;
  }

  .markdown :global(a:hover) {
    text-decoration: underline;
  }

  .markdown :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 1em 0;
  }

  .markdown :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0.75em 0;
  }

  .markdown :global(th),
  .markdown :global(td) {
    border: 1px solid var(--border);
    padding: 0.5em;
    text-align: left;
  }

  .markdown :global(th) {
    background: var(--bg-secondary);
    font-weight: 600;
  }

  .markdown :global(img) {
    max-width: 100%;
    border-radius: var(--radius-md);
  }

  /* Task lists (GFM) */
  .markdown :global(input[type="checkbox"]) {
    margin-right: 0.5em;
  }

  .markdown :global(ul.contains-task-list) {
    list-style: none;
    padding-left: 0;
  }
</style>
