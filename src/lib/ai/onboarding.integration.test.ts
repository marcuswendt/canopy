/**
 * Onboarding Flow Integration Test
 *
 * Tests the full onboarding extraction pipeline with Marcus's comprehensive document.
 * Validates that Stage 1 + Stage 2 work correctly together.
 *
 * Run with:
 *   npm run test:integration
 *
 * Requires:
 *   - ANTHROPIC_API_KEY in .env
 *   - INTEGRATION=true environment variable (set by npm script)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractFromOnboardingDocument, generateOnboardingResponse } from './extraction';
import { shouldRunIntegrationTests, isAIAvailable, setupIntegrationTests } from '../test/setup';

// Load Marcus's onboarding document
const documentPath = join(process.cwd(), 'data/onboarding/Marcus onboarding.md');
let document: string;
try {
  document = readFileSync(documentPath, 'utf-8');
} catch {
  document = '';
}

// Check if we can run these tests
const canRunTests = shouldRunIntegrationTests() && isAIAvailable() && document;

describe.skipIf(!canRunTests)('Onboarding: Full Pipeline Test', () => {
  beforeAll(async () => {
    // Ensure test infrastructure is set up
    await setupIntegrationTests();
  });

  it('Stage 1: extracts comprehensive data from Marcus document', async () => {
    const extraction = await extractFromOnboardingDocument(document, 'Marcus onboarding.md');

    expect(extraction).not.toBeNull();
    if (!extraction) return;

    // Should have summary
    expect(extraction.summary.length).toBeGreaterThan(50);

    // Should extract multiple domains
    console.log('Domains:', extraction.domains.map(d => d.type));
    expect(extraction.domains.length).toBeGreaterThanOrEqual(3);

    const domainTypes = extraction.domains.map(d => d.type);
    expect(domainTypes).toContain('work');
    expect(domainTypes).toContain('family');
    expect(domainTypes).toContain('sport');

    // Should extract many entities
    console.log('Entity count:', extraction.entities.length);
    expect(extraction.entities.length).toBeGreaterThanOrEqual(10);

    // Check for key people
    const entityNames = extraction.entities.map(e => e.name.toLowerCase());
    expect(entityNames.some(n => n.includes('celine'))).toBe(true);

    // Check for key companies
    expect(entityNames.some(n => n.includes('field'))).toBe(true);
  }, 60000);

  it('Stage 2: generates isComplete=true for comprehensive document', async () => {
    // First run Stage 1
    const extraction = await extractFromOnboardingDocument(document, 'Marcus onboarding.md');
    expect(extraction).not.toBeNull();
    if (!extraction) return;

    // Build context like the onboarding page does
    const context = {
      messages: [
        { role: 'ray' as const, content: "What's on your mind? Tell me about yourself." },
        { role: 'user' as const, content: document },
      ],
      collected: {
        domains: extraction.domains.map(d => d.type),
        entities: extraction.entities.map(e => ({
          name: e.name,
          type: e.type,
          domain: e.domain,
          description: e.description,
        })),
        urls: [] as string[],
        integrations: [] as string[],
        userName: 'Marcus',
        location: 'London, UK',
      },
      documentExtraction: extraction,
      availableIntegrations: [
        { id: 'strava', name: 'Strava', description: 'Activity tracking' },
        { id: 'whoop', name: 'WHOOP', description: 'Recovery tracking' },
      ],
      offeredIntegrations: [] as string[],
      connectedIntegrations: [] as string[],
    };

    // Run Stage 2
    const response = await generateOnboardingResponse(context);

    console.log('Response:', response.response);
    console.log('isComplete:', response.isComplete);

    // Should complete onboarding
    expect(response.isComplete).toBe(true);

    // Should NOT contain generic fallback phrases
    const responseLower = response.response.toLowerCase();
    expect(responseLower).not.toContain('tell me more about what keeps you busy');
    expect(responseLower).not.toContain('what else takes up mental space');

    // Should acknowledge specific content
    const specificSignals = ['work', 'family', 'sport', 'field', 'celine', 'cycling', 'race', 'bikepacking'];
    const hasSpecificContent = specificSignals.some(s => responseLower.includes(s));
    expect(hasSpecificContent).toBe(true);
  }, 90000);
});
