<script lang="ts">
  interface Props {
    domain: string;
    small?: boolean;
  }

  let { domain, small = false }: Props = $props();
</script>

<span 
  class="domain-badge" 
  class:small
  data-domain={domain}
>
  {domain}
</span>

<style>
  .domain-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 500;
    text-transform: lowercase;
  }
  
  .domain-badge.small {
    padding: 1px 6px;
    font-size: 10px;
  }
  
  .domain-badge[data-domain="work"] {
    background: var(--domain-work-bg);
    color: var(--domain-work);
  }
  
  .domain-badge[data-domain="family"] {
    background: var(--domain-family-bg);
    color: var(--domain-family);
  }
  
  .domain-badge[data-domain="sport"] {
    background: var(--domain-sport-bg);
    color: var(--domain-sport);
  }
  
  .domain-badge[data-domain="personal"] {
    background: var(--domain-personal-bg);
    color: var(--domain-personal);
  }
  
  .domain-badge[data-domain="health"] {
    background: var(--domain-health-bg);
    color: var(--domain-health);
  }
</style>
