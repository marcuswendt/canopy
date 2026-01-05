/**
 * Test Setup Module - Integration test initialization
 *
 * This module sets up the test environment for integration tests:
 * - Registers test AI provider (direct Anthropic API access)
 * - Initializes isolated test database
 * - Provides test helpers and fixtures
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... npm run test:integration
 */

import { config } from 'dotenv';

// Load .env file at the top level
config();

import { registerProvider, setActiveProvider, getProvider } from '../ai/provider';
import { testProvider } from '../ai/providers/test';
import { getTestDb, resetTestDatabase, closeTestDb } from '../db/test-db';
import { beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Check if integration tests should run
 */
export function shouldRunIntegrationTests(): boolean {
  return process.env.INTEGRATION === 'true';
}

/**
 * Check if AI provider is available (API key is set)
 */
export function isAIAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Setup integration test environment
 * Call this in your test file's beforeAll hook
 */
export async function setupIntegrationTests(): Promise<void> {
  console.log('\n=== Setting up integration test environment ===');

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('WARNING: ANTHROPIC_API_KEY not set. AI tests will be skipped.');
    console.warn('Set it in .env or run with: ANTHROPIC_API_KEY=sk-ant-... npm run test:integration');
  } else {
    // Register and activate the test provider
    registerProvider(testProvider);
    setActiveProvider('test');
    console.log('Test AI provider registered and activated');

    // Verify provider is configured
    const provider = getProvider();
    if (provider) {
      const configured = await provider.isConfigured();
      console.log(`AI Provider configured: ${configured}`);
    }
  }

  // Initialize test database
  getTestDb();
  console.log('Test database initialized');

  console.log('=== Integration test setup complete ===\n');
}

/**
 * Cleanup integration test environment
 * Call this in your test file's afterAll hook
 */
export function cleanupIntegrationTests(): void {
  closeTestDb();
  console.log('\nIntegration test cleanup complete');
}

/**
 * Reset test database between tests
 * Call this in beforeEach if you need a clean slate for each test
 */
export function resetTestData(): void {
  resetTestDatabase();
}

/**
 * Global test setup for vitest
 * This runs once before all tests when configured in vitest.config.ts
 */
export async function setup(): Promise<void> {
  if (shouldRunIntegrationTests()) {
    await setupIntegrationTests();
  }
}

/**
 * Global test teardown for vitest
 */
export function teardown(): void {
  if (shouldRunIntegrationTests()) {
    cleanupIntegrationTests();
  }
}

/**
 * Helper to create describe blocks that only run in integration mode
 */
export function describeIntegration(name: string, fn: () => void): void {
  if (shouldRunIntegrationTests()) {
    describe(name, fn);
  } else {
    describe.skip(name, fn);
  }
}

/**
 * Vitest global setup hook
 */
export default async function globalSetup(): Promise<() => void> {
  await setup();
  return teardown;
}

// Export test utilities
export { getTestDb, resetTestDatabase, closeTestDb } from '../db/test-db';
export { testProvider } from '../ai/providers/test';
