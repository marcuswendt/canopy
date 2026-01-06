/**
 * Vitest Setup File - runs before each test file is loaded
 *
 * This file is executed before any test file imports are resolved,
 * allowing us to register the test AI provider before other modules
 * initialize their default providers.
 *
 * IMPORTANT: This must be loaded before any AI-related imports!
 */

import { config } from 'dotenv';

// Load .env file first
config();

// Only set up test provider when running integration tests
if (process.env.INTEGRATION === 'true' && process.env.ANTHROPIC_API_KEY) {
  console.log('\n=== Setting up integration test environment ===');

  // Import provider registry first (before index.ts auto-registers Claude)
  const { registerProvider, setActiveProvider, getProvider } = await import('../ai/provider');
  const { testProvider } = await import('../ai/providers/test');

  // Register and activate test provider
  registerProvider(testProvider);
  setActiveProvider('test');

  console.log('Test AI provider registered and activated');

  // Verify configuration
  const provider = getProvider();
  if (provider) {
    const configured = await provider.isConfigured();
    console.log(`AI Provider configured: ${configured}`);
    if (!configured) {
      console.warn('WARNING: API key may be invalid or missing');
    }
  }

  console.log('=== Integration test setup complete ===\n');
} else if (process.env.INTEGRATION === 'true') {
  console.warn('\n=== WARNING: INTEGRATION tests enabled but ANTHROPIC_API_KEY not set ===');
  console.warn('Set it in .env or run with: ANTHROPIC_API_KEY=sk-ant-... npm run test:integration\n');
}
