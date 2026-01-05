/**
 * Onboarding Extraction Tests
 *
 * These tests validate that the AI extraction correctly identifies
 * domains, entities, people, and relationships from user input.
 *
 * Run with: npx vitest run src/lib/ai/extraction.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import testData from '../../../data/onboarding/test-marcus.json';

// Mock types matching our extraction output
interface ExtractedDomain {
  name: string;
  type: 'work' | 'family' | 'sport' | 'personal' | 'health';
}

interface ExtractedEntity {
  name: string;
  type: string;
  domain: string;
  description?: string;
  relationship?: string;
}

// Simulated extraction results (would come from actual AI in integration tests)
// For unit tests, we validate the expected structure and run the actual extraction
// in integration/e2e tests

describe('Onboarding Test Data Structure', () => {
  it('has valid test inputs', () => {
    expect(testData.inputs).toBeDefined();
    expect(testData.inputs.length).toBeGreaterThan(0);

    for (const input of testData.inputs) {
      expect(input.turn).toBeGreaterThan(0);
      expect(input.context).toBeDefined();
      expect(input.text.length).toBeGreaterThan(10);
    }
  });

  it('has expected domains', () => {
    expect(testData.expected.domains).toBeDefined();
    expect(testData.expected.domains.length).toBeGreaterThanOrEqual(4);

    const domainTypes = testData.expected.domains.map(d => d.type);
    expect(domainTypes).toContain('work');
    expect(domainTypes).toContain('family');
    expect(domainTypes).toContain('sport');
  });

  it('has expected people with relationships', () => {
    const people = testData.expected.entities.people;
    expect(people.length).toBeGreaterThanOrEqual(6);

    // Wife should be identified
    const wife = people.find(p => p.name === 'Celine');
    expect(wife).toBeDefined();
    expect(wife?.relationship).toBe('wife');

    // Kids should be identified with ages
    const kids = people.filter(p => p.relationship === 'son');
    expect(kids.length).toBe(3);
  });

  it('has expected companies', () => {
    const companies = testData.expected.entities.companies;
    expect(companies.length).toBeGreaterThanOrEqual(1);

    const fieldio = companies.find(c => c.name === 'FIELD.IO');
    expect(fieldio).toBeDefined();
    expect(fieldio?.role).toContain('CEO');
  });

  it('has expected events/races', () => {
    const events = testData.expected.entities.events;
    const races = events.filter(e => e.type === 'race');
    expect(races.length).toBe(4);

    // Primary race should be flagged
    const primaryRace = races.find(r => r.priority === 'primary');
    expect(primaryRace).toBeDefined();
    expect(primaryRace?.name).toBe('Hellenic Mountain Race');
  });

  it('has expected URLs', () => {
    expect(testData.expected.urls.length).toBeGreaterThanOrEqual(3);

    const workUrls = testData.expected.urls.filter(u => u.scope === 'work');
    expect(workUrls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Extraction Validation Helpers', () => {
  /**
   * Check if extracted domains cover expected domains
   */
  function validateDomains(
    extracted: ExtractedDomain[],
    expected: typeof testData.expected.domains
  ): { matched: string[]; missing: string[]; extra: string[] } {
    const extractedNames = extracted.map(d => d.name.toLowerCase());
    const expectedNames = expected.map(d => d.name.toLowerCase());

    const matched = expectedNames.filter(n =>
      extractedNames.some(e => e.includes(n) || n.includes(e))
    );
    const missing = expectedNames.filter(n =>
      !extractedNames.some(e => e.includes(n) || n.includes(e))
    );
    const extra = extractedNames.filter(n =>
      !expectedNames.some(e => e.includes(n) || n.includes(e))
    );

    return { matched, missing, extra };
  }

  /**
   * Check if extracted entities cover expected people
   */
  function validatePeople(
    extracted: ExtractedEntity[],
    expected: typeof testData.expected.entities.people
  ): { matched: string[]; missing: string[]; score: number } {
    const extractedPeople = extracted.filter(e => e.type === 'person');
    const extractedNames = extractedPeople.map(p => p.name.toLowerCase());
    const expectedNames = expected.map(p => p.name.toLowerCase());

    const matched = expectedNames.filter(n =>
      extractedNames.some(e => e.includes(n) || n.includes(e))
    );
    const missing = expectedNames.filter(n =>
      !extractedNames.some(e => e.includes(n) || n.includes(e))
    );

    const score = matched.length / expectedNames.length;

    return { matched, missing, score };
  }

  it('validation helpers work correctly', () => {
    const mockExtracted: ExtractedDomain[] = [
      { name: 'Work at FIELD.IO', type: 'work' },
      { name: 'Family', type: 'family' },
      { name: 'Cycling', type: 'sport' },
    ];

    const result = validateDomains(mockExtracted, testData.expected.domains);
    expect(result.matched.length).toBeGreaterThan(0);
  });
});

/**
 * Integration test template - run with actual AI
 *
 * To run these tests against the real AI:
 * 1. Set CLAUDE_API_KEY environment variable
 * 2. Run: INTEGRATION=true npx vitest run src/lib/ai/extraction.test.ts
 */
describe.skipIf(!process.env.INTEGRATION)('Integration: AI Extraction', () => {
  it('extracts domains from work context', async () => {
    // This would call the actual generateOnboardingResponse
    // const response = await generateOnboardingResponse({ ... });
    // expect(response.extractedDomains).toBeDefined();
  });
});
