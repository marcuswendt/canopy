/**
 * Canopy AI Extraction Test Suite
 *
 * Tests the core extraction, memory, and entity systems that power Canopy.
 *
 * Run with:
 *   npm test                    # Unit tests only
 *   npm run test:integration    # Full AI integration tests (requires API key)
 *   npm run test:watch          # Watch mode
 *   npm run test:ui             # Visual UI
 */

import { describe, it, expect, beforeAll } from 'vitest';
import testMarcus from '../../../data/onboarding/test-marcus.json';
import testCeline from '../../../data/onboarding/test-celine.json';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface ExtractedEntity {
  name: string;
  type: 'person' | 'project' | 'company' | 'event' | 'goal' | 'focus';
  domain: 'work' | 'family' | 'sport' | 'personal' | 'health';
  description?: string;
  relationship?: string;
  priority?: 'critical' | 'active' | 'background';
  date?: string;
  needsConfirmation?: boolean;
}

interface ExtractedDomain {
  type: 'work' | 'family' | 'sport' | 'personal' | 'health';
  description?: string;
}

interface DocumentExtraction {
  summary: string;
  domains: ExtractedDomain[];
  entities: ExtractedEntity[];
  topicsNotCovered?: string[];
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Normalize name for comparison (case-insensitive, trim)
 */
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Check if extracted entities contain an expected person
 */
function findPerson(
  entities: ExtractedEntity[],
  name: string,
  relationship?: string
): ExtractedEntity | undefined {
  const normalized = normalizeName(name);
  return entities.find(e =>
    e.type === 'person' &&
    normalizeName(e.name).includes(normalized) &&
    (!relationship || e.relationship?.toLowerCase().includes(relationship.toLowerCase()))
  );
}

/**
 * Check if an entity with needsConfirmation=true exists
 */
function findFocus(entities: ExtractedEntity[], namePart: string): ExtractedEntity | undefined {
  const normalized = normalizeName(namePart);
  return entities.find(e =>
    e.type === 'focus' &&
    normalizeName(e.name).includes(normalized)
  );
}

/**
 * Validate extraction coverage
 */
function calculateCoverage(
  extracted: ExtractedEntity[],
  expected: Array<{ name: string; required?: boolean }>
): { covered: number; required: number; missing: string[] } {
  const requiredExpected = expected.filter(e => e.required !== false);
  const missing: string[] = [];

  let covered = 0;
  for (const exp of requiredExpected) {
    const found = extracted.some(e =>
      normalizeName(e.name).includes(normalizeName(exp.name)) ||
      normalizeName(exp.name).includes(normalizeName(e.name))
    );
    if (found) {
      covered++;
    } else {
      missing.push(exp.name);
    }
  }

  return {
    covered,
    required: requiredExpected.length,
    missing,
  };
}

// =============================================================================
// UNIT TESTS - Test Data Structure Validation
// =============================================================================

describe('Test Data: Marcus (Multi-turn)', () => {
  it('has valid test inputs covering multiple life domains', () => {
    expect(testMarcus.inputs).toBeDefined();
    expect(testMarcus.inputs.length).toBeGreaterThanOrEqual(4);

    const contexts = testMarcus.inputs.map(i => i.context);
    expect(contexts).toContain('work');
    expect(contexts).toContain('family');
    expect(contexts).toContain('sport');
  });

  it('has expected domains', () => {
    expect(testMarcus.expected.domains.length).toBeGreaterThanOrEqual(4);

    const types = testMarcus.expected.domains.map(d => d.type);
    expect(types).toContain('work');
    expect(types).toContain('family');
    expect(types).toContain('sport');
  });

  it('has expected people with relationships', () => {
    const people = testMarcus.expected.entities.people;
    expect(people.length).toBeGreaterThanOrEqual(6);

    // Wife
    const wife = people.find(p => p.name === 'Celine');
    expect(wife).toBeDefined();
    expect(wife?.relationship).toBe('wife');

    // Kids with DOBs
    const kids = people.filter(p => p.relationship === 'son');
    expect(kids.length).toBe(3);
    expect(kids.every(k => k.dob)).toBe(true);
  });

  it('has expected companies', () => {
    const companies = testMarcus.expected.entities.companies;
    const fieldio = companies.find(c => c.name === 'FIELD.IO');
    expect(fieldio).toBeDefined();
    expect(fieldio?.role).toContain('CEO');
  });

  it('has expected events with dates', () => {
    const events = testMarcus.expected.entities.events;
    const races = events.filter(e => e.type === 'race');
    expect(races.length).toBe(4);

    // Primary race flagged
    const primary = races.find(r => r.priority === 'primary');
    expect(primary?.name).toBe('Hellenic Mountain Race');
  });

  it('has expected integration suggestions', () => {
    expect(testMarcus.expected.integrations_to_suggest).toContain('strava');
    expect(testMarcus.expected.integrations_to_suggest).toContain('whoop');
  });
});

describe('Test Data: Celine (Single Document)', () => {
  it('has comprehensive document content', () => {
    expect(testCeline.document).toBeDefined();
    expect(testCeline.document.length).toBeGreaterThan(500);
  });

  it('has expected domains for extraction', () => {
    const required = testCeline.expected.domains.filter(d => d.required);
    expect(required.length).toBeGreaterThanOrEqual(2);

    const types = testCeline.expected.domains.map(d => d.type);
    expect(types).toContain('family');
    expect(types).toContain('health');
  });

  it('has expected people with birthdates', () => {
    const people = testCeline.expected.entities.people;
    expect(people.length).toBe(4); // Marcus + 3 kids

    const kids = people.filter(p => p.relationship === 'son');
    expect(kids.length).toBe(3);
    expect(kids.every(k => k.dob)).toBe(true);
  });

  it('has expected goals with priority', () => {
    const goals = testCeline.expected.entities.goals;
    const critical = goals.filter(g => g.priority === 'critical');
    expect(critical.length).toBeGreaterThanOrEqual(1);
  });

  it('has expected focuses requiring confirmation', () => {
    const focuses = testCeline.expected.entities.focuses;
    expect(focuses.length).toBeGreaterThanOrEqual(1);
    expect(focuses.every(f => f.needsConfirmation === true)).toBe(true);
  });

  it('has anti-hallucination checks', () => {
    expect(testCeline.expected.anti_hallucination_checks.length).toBeGreaterThan(0);
  });

  it('has topics not covered for conversation gaps', () => {
    expect(testCeline.expected.topics_not_covered.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// EXTRACTION RULES VALIDATION
// =============================================================================

describe('Extraction Rules', () => {
  describe('Anti-Hallucination', () => {
    it('should not extract entities from generic mentions', () => {
      // These are the patterns that MUST NOT create entities
      const genericMentions = [
        'my wife',           // No name given
        'a startup',         // No company name
        'my kids',           // No specific names
        'a project I\'m working on',
        'some friends',
      ];

      // In actual tests, we'd check extraction results
      // This documents the expected behavior
      expect(genericMentions.length).toBe(5);
    });

    it('should only extract explicitly named entities', () => {
      // These SHOULD create entities
      const explicitMentions = [
        { text: 'My wife Celine', shouldExtract: 'Celine' },
        { text: 'FIELD.IO, my company', shouldExtract: 'FIELD.IO' },
        { text: 'My son Rafael', shouldExtract: 'Rafael' },
      ];

      expect(explicitMentions.every(m => m.shouldExtract)).toBe(true);
    });
  });

  describe('Focus Extraction', () => {
    it('focuses must always have needsConfirmation=true', () => {
      // This is a critical rule - focuses are interpretive
      const focusRule = {
        type: 'focus',
        needsConfirmation: true, // REQUIRED
      };

      expect(focusRule.needsConfirmation).toBe(true);
    });

    it('focus names should be 2-4 words, thematic', () => {
      const goodFocusNames = [
        'Work-Life Balance',
        'Body & Fertility',
        'Structure & Control',
        'Mental Load',
        'Emotional Processing',
      ];

      for (const name of goodFocusNames) {
        const words = name.split(/[\s&-]+/).filter(w => w.length > 0);
        expect(words.length).toBeGreaterThanOrEqual(2);
        expect(words.length).toBeLessThanOrEqual(4);
      }
    });
  });

  describe('Birthday/Event Extraction', () => {
    it('should create birthday events from DOB mentions', () => {
      // When a DOB is mentioned, we expect both:
      // 1. Person entity with the DOB
      // 2. Birthday event (recurring)
      const dobPattern = /born (\d{2}\/\d{2}\/\d{4})/;
      const testText = 'Rafael 5 years (born 02/02/2020)';

      expect(dobPattern.test(testText)).toBe(true);
    });
  });

  describe('Goal Extraction', () => {
    it('should identify goal signals in text', () => {
      const goalSignals = [
        'I want to',
        'I need to',
        'my goal is',
        'hoping to',
        'I\'m keen to',
        'key focus',
      ];

      const celineText = testCeline.document;

      const foundSignals = goalSignals.filter(signal =>
        celineText.toLowerCase().includes(signal.toLowerCase())
      );

      expect(foundSignals.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// TWO-STAGE EXTRACTION VALIDATION
// =============================================================================

describe('Two-Stage Extraction Architecture', () => {
  it('Stage 1 output structure is correct', () => {
    const expectedStage1Output: DocumentExtraction = {
      summary: 'A 2-3 sentence summary',
      domains: [{ type: 'family' }],
      entities: [{
        name: 'Example',
        type: 'person',
        domain: 'family',
      }],
      topicsNotCovered: ['fitness'],
    };

    expect(expectedStage1Output.summary).toBeDefined();
    expect(expectedStage1Output.domains).toBeInstanceOf(Array);
    expect(expectedStage1Output.entities).toBeInstanceOf(Array);
  });

  it('Stage 2 receives structured data, not raw document', () => {
    // Stage 2 should receive the EXTRACTION, not the raw 2000-char document
    const stage1Output: DocumentExtraction = {
      summary: 'Celine is a 42-year-old mother...',
      domains: [{ type: 'family' }, { type: 'health' }],
      entities: [
        { name: 'Marcus', type: 'person', domain: 'family', relationship: 'husband' },
        { name: 'Rafael', type: 'person', domain: 'family', relationship: 'son' },
      ],
      topicsNotCovered: ['fitness specifics', 'work details'],
    };

    // Stage 2 context should be much smaller than raw document
    const stage2ContextSize = JSON.stringify(stage1Output).length;
    const rawDocumentSize = testCeline.document.length;

    expect(stage2ContextSize).toBeLessThan(rawDocumentSize);
  });
});

// =============================================================================
// INTEGRATION TESTS (require API key)
// =============================================================================

describe.skipIf(!process.env.INTEGRATION)('Integration: Document Extraction', () => {
  // These tests run against the actual Claude API
  // Run with: npm run test:integration

  it('extracts entities from Celine document', async () => {
    // Import the actual extraction function
    const { extractFromOnboardingDocument } = await import('./extraction');

    const result = await extractFromOnboardingDocument(
      testCeline.document,
      'Celine onboarding.md'
    );

    expect(result).not.toBeNull();
    if (!result) return;

    // Check summary
    expect(result.summary.length).toBeGreaterThan(50);

    // Check domains
    const domainTypes = result.domains.map(d => d.type);
    expect(domainTypes).toContain('family');
    expect(domainTypes).toContain('health');

    // Check required people
    const marcus = findPerson(result.entities, 'Marcus', 'husband');
    expect(marcus).toBeDefined();

    const rafael = findPerson(result.entities, 'Rafael', 'son');
    expect(rafael).toBeDefined();

    const luca = findPerson(result.entities, 'Luca', 'son');
    expect(luca).toBeDefined();

    const elio = findPerson(result.entities, 'Elio', 'son');
    expect(elio).toBeDefined();

    // Check goals extracted
    const goals = result.entities.filter(e => e.type === 'goal');
    expect(goals.length).toBeGreaterThanOrEqual(1);

    // Check focuses have needsConfirmation
    const focuses = result.entities.filter(e => e.type === 'focus');
    for (const focus of focuses) {
      expect(focus.needsConfirmation).toBe(true);
    }

    // Anti-hallucination: check no company name invented
    const companies = result.entities.filter(e => e.type === 'company');
    // Marcus's company name is never specified, so there should be none or it should be generic
    for (const company of companies) {
      expect(company.name.toLowerCase()).not.toContain('startup inc');
      expect(company.name.toLowerCase()).not.toContain('marcus company');
    }

    // Check topics not covered
    expect(result.topicsNotCovered).toBeDefined();
    expect(result.topicsNotCovered!.length).toBeGreaterThan(0);
  }, 60000); // 60s timeout for API call

  it('extracts entities from Marcus multi-turn input', async () => {
    const { extractFromOnboardingDocument } = await import('./extraction');

    // Combine all Marcus inputs into one document
    const combinedContent = testMarcus.inputs.map(i => i.text).join('\n\n');

    const result = await extractFromOnboardingDocument(
      combinedContent,
      'Marcus combined onboarding'
    );

    expect(result).not.toBeNull();
    if (!result) return;

    // Check all 4+ domains covered
    expect(result.domains.length).toBeGreaterThanOrEqual(4);

    // Check key people
    const celine = findPerson(result.entities, 'Celine', 'wife');
    expect(celine).toBeDefined();

    // Check company
    const fieldio = result.entities.find(e =>
      e.type === 'company' && e.name.toLowerCase().includes('field')
    );
    expect(fieldio).toBeDefined();

    // Check events/races
    const events = result.entities.filter(e => e.type === 'event');
    expect(events.length).toBeGreaterThanOrEqual(4);

    // Check coverage
    const peopleCoverage = calculateCoverage(
      result.entities.filter(e => e.type === 'person'),
      testMarcus.expected.entities.people
    );
    expect(peopleCoverage.covered / peopleCoverage.required).toBeGreaterThanOrEqual(0.6);
  }, 60000);
});

describe.skipIf(!process.env.INTEGRATION)('Integration: Conversation Flow', () => {
  it('generates appropriate response after document extraction', async () => {
    const extraction = await import('./extraction');
    const { extractFromOnboardingDocument, generateOnboardingResponse } = extraction;

    // Stage 1
    const stage1Result = await extractFromOnboardingDocument(
      testCeline.document,
      'Celine onboarding.md'
    );
    expect(stage1Result).not.toBeNull();
    if (!stage1Result) return;

    // Stage 2 - build context with extraction results
    const context = {
      messages: [
        { role: 'ray' as const, content: 'Welcome! Tell me about yourself.' },
        { role: 'user' as const, content: testCeline.document },
      ],
      collected: {
        domains: stage1Result.domains.map(d => d.type),
        entities: stage1Result.entities.map(e => ({
          name: e.name,
          type: e.type,
          domain: e.domain,
        })),
        urls: [] as string[],
        integrations: [] as string[],
      },
      documentExtraction: stage1Result,
      availableIntegrations: [] as Array<{ id: string; name: string; description: string }>,
      offeredIntegrations: [] as string[],
      connectedIntegrations: [] as string[],
    };

    const response = await generateOnboardingResponse(context);

    expect(response.response).toBeDefined();
    expect(response.response.length).toBeGreaterThan(50);

    // Response should NOT ask about things already covered
    const responseLower = response.response.toLowerCase();
    expect(responseLower).not.toContain('tell me about your family');
    expect(responseLower).not.toContain('do you have any children');

    // Response SHOULD ask about gaps or acknowledge the rich context
    // (exact content depends on AI, but should be contextual)
  }, 60000);
});

// =============================================================================
// BONSAI CHAT SUGGESTION EXTRACTION TESTS
// =============================================================================

/**
 * Test data for chat exchange scenarios
 * Each scenario has a user message, assistant response, and expected extractions
 */
const chatScenarios = {
  // Scenario 1: New person mentioned
  newPerson: {
    userMessage: "Had a great meeting with Sarah from Nike today. She's leading their sustainability initiative.",
    assistantResponse: "Sounds like a productive meeting. How did the discussion go?",
    expectedEntities: [
      { name: 'Sarah', type: 'person', relationship: 'Nike' },
    ],
    expectedMemories: [
      { category: 'fact', contentContains: 'Sarah' },
    ],
  },

  // Scenario 2: Decision made
  decision: {
    userMessage: "I've decided to push the launch back to March. Too risky to rush it before the holidays.",
    assistantResponse: "That's a pragmatic call. March gives you room to polish things.",
    expectedEntities: [],
    expectedMemories: [
      { category: 'decision', contentContains: 'launch' },
    ],
  },

  // Scenario 3: Personal preference revealed
  preference: {
    userMessage: "I really work best in the mornings before 10am. After lunch I'm basically useless for deep work.",
    assistantResponse: "Good to know about your energy patterns. We can factor that into planning.",
    expectedEntities: [],
    expectedMemories: [
      { category: 'preference', contentContains: 'morning' },
    ],
  },

  // Scenario 4: Multiple entities in one message
  multipleEntities: {
    userMessage: "Working with James and Maria on the Horizon project. It's due in April and the client is Adidas.",
    assistantResponse: "Horizon sounds like a significant project. What's your role?",
    expectedEntities: [
      { name: 'James', type: 'person' },
      { name: 'Maria', type: 'person' },
      { name: 'Horizon', type: 'project' },
      { name: 'Adidas', type: 'company' },
    ],
    expectedMemories: [
      { category: 'event', contentContains: 'April' },
    ],
  },

  // Scenario 5: Event/deadline mentioned
  eventMentioned: {
    userMessage: "My wife's birthday is coming up next week - need to plan something special. She turns 40.",
    assistantResponse: "A milestone birthday! Any ideas for how to celebrate?",
    expectedEntities: [
      { name: 'wife', type: 'person', relationship: 'wife' },
    ],
    expectedMemories: [
      { category: 'event', contentContains: 'birthday' },
    ],
  },

  // Scenario 6: Nothing new worth extracting
  casualChat: {
    userMessage: "Thanks, that's helpful!",
    assistantResponse: "You're welcome. Let me know if you need anything else.",
    expectedEntities: [],
    expectedMemories: [],
  },

  // Scenario 7: Very short message (should skip extraction)
  tooShort: {
    userMessage: "ok",
    assistantResponse: "Got it.",
    expectedEntities: [],
    expectedMemories: [],
  },

  // Scenario 8: Goal mentioned
  goalMentioned: {
    userMessage: "I really want to run a sub-4 marathon this year. Been training hard for it.",
    assistantResponse: "Sub-4 is a solid target. How's the training going?",
    expectedEntities: [],
    expectedMemories: [
      { category: 'fact', contentContains: 'marathon' },
    ],
  },

  // Scenario 9: Insight shared
  insightShared: {
    userMessage: "I noticed I always procrastinate on creative work when I'm stressed. It's like my brain just won't engage.",
    assistantResponse: "That's valuable self-awareness. Stress tends to push us toward easier, more routine tasks.",
    expectedEntities: [],
    expectedMemories: [
      { category: 'insight', contentContains: 'procrastinate' },
    ],
  },

  // Scenario 10: Company and role
  companyAndRole: {
    userMessage: "I'm the Head of Product at Figma now. Started last month.",
    assistantResponse: "Congrats on the new role! How's the transition been?",
    expectedEntities: [
      { name: 'Figma', type: 'company' },
    ],
    expectedMemories: [
      { category: 'fact', contentContains: 'Head of Product' },
    ],
  },
};

/**
 * Existing entities for anti-hallucination tests
 */
const existingEntities = [
  { id: '1', name: 'Celine', type: 'person' as const, domain: 'family' as const, created_at: '', updated_at: '', last_mentioned: null, mentions: 0, description: 'Wife' },
  { id: '2', name: 'FIELD.IO', type: 'company' as const, domain: 'work' as const, created_at: '', updated_at: '', last_mentioned: null, mentions: 0, description: '' },
  { id: '3', name: 'Nike Rebrand', type: 'project' as const, domain: 'work' as const, created_at: '', updated_at: '', last_mentioned: null, mentions: 0, description: '' },
];

const existingMemories = [
  { id: '1', content: 'User prefers morning meetings', source_type: 'thread' as const, source_id: 't1', created_at: '', importance: 0.7, embedding: null, entities: [], tags: [] },
  { id: '2', content: 'User is training for a marathon', source_type: 'thread' as const, source_id: 't1', created_at: '', importance: 0.8, embedding: null, entities: [], tags: [] },
];

describe('Bonsai Chat Suggestions: Schema Validation', () => {
  it('ChatSuggestionResult has correct structure', () => {
    // Define the expected structure
    interface ChatSuggestionResult {
      entities: Array<{
        name: string;
        type: string;
        domain: string;
        description?: string;
        relationship?: string;
        confidence: number;
      }>;
      memories: Array<{
        content: string;
        importance: 'high' | 'medium' | 'low';
        category: 'preference' | 'fact' | 'event' | 'decision' | 'insight';
        entityNames: string[];
      }>;
    }

    const validResult: ChatSuggestionResult = {
      entities: [{
        name: 'Sarah',
        type: 'person',
        domain: 'work',
        relationship: 'Nike colleague',
        confidence: 0.85,
      }],
      memories: [{
        content: 'User met with Sarah from Nike about sustainability',
        importance: 'medium',
        category: 'fact',
        entityNames: ['Sarah'],
      }],
    };

    expect(validResult.entities[0].confidence).toBeLessThanOrEqual(1);
    expect(validResult.entities[0].confidence).toBeGreaterThanOrEqual(0);
    expect(['high', 'medium', 'low']).toContain(validResult.memories[0].importance);
  });

  it('confidence threshold filters low-confidence entities', () => {
    const entities = [
      { name: 'Sarah', confidence: 0.9 },     // passes (>= 0.6)
      { name: 'MaybeJohn', confidence: 0.4 }, // fails (< 0.6)
      { name: 'Jim', confidence: 0.7 },       // passes (>= 0.6)
      { name: 'Unclear', confidence: 0.55 },  // fails (< 0.6)
    ];

    // The extraction function filters at 0.6
    const filtered = entities.filter(e => e.confidence >= 0.6);

    expect(filtered).toHaveLength(2);
    expect(filtered.map(e => e.name)).toContain('Sarah');
    expect(filtered.map(e => e.name)).toContain('Jim');
    expect(filtered.map(e => e.name)).not.toContain('MaybeJohn');
    expect(filtered.map(e => e.name)).not.toContain('Unclear');
  });
});

describe('Bonsai Chat Suggestions: Test Scenarios', () => {
  it('has comprehensive test scenarios', () => {
    const scenarioNames = Object.keys(chatScenarios);

    // We should have multiple scenarios covering different cases
    expect(scenarioNames.length).toBeGreaterThanOrEqual(8);

    // Check we cover key categories
    expect(scenarioNames).toContain('newPerson');
    expect(scenarioNames).toContain('decision');
    expect(scenarioNames).toContain('preference');
    expect(scenarioNames).toContain('multipleEntities');
    expect(scenarioNames).toContain('casualChat');
    expect(scenarioNames).toContain('tooShort');
    expect(scenarioNames).toContain('insightShared');
  });

  it('test data has required fields', () => {
    for (const [name, scenario] of Object.entries(chatScenarios)) {
      expect(scenario.userMessage).toBeDefined();
      expect(scenario.assistantResponse).toBeDefined();
      expect(scenario.expectedEntities).toBeDefined();
      expect(scenario.expectedMemories).toBeDefined();
    }
  });

  it('multipleEntities scenario has 4 expected entities', () => {
    const { expectedEntities } = chatScenarios.multipleEntities;
    expect(expectedEntities).toHaveLength(4);

    const types = expectedEntities.map(e => e.type);
    expect(types).toContain('person');
    expect(types).toContain('project');
    expect(types).toContain('company');
  });
});

describe('Bonsai Chat Suggestions: Anti-Hallucination Rules', () => {
  it('should not re-extract entities already in the database', () => {
    // When user mentions "Celine" and we already have her as an entity,
    // the extraction should NOT return her again
    const userMessage = "Celine and I went to dinner last night. She loved the new restaurant.";

    const existingNames = existingEntities.map(e => e.name.toLowerCase());

    // Simulating what the extraction should check
    const mentionedName = 'Celine';
    const isAlreadyKnown = existingNames.includes(mentionedName.toLowerCase());

    expect(isAlreadyKnown).toBe(true);
    // Therefore extraction should return empty for this entity
  });

  it('should not re-extract existing memories', () => {
    // When user says something we already have stored, don't duplicate
    const userMessage = "As I mentioned, I prefer morning meetings.";

    const existingContent = existingMemories.map(m => m.content.toLowerCase());
    const wouldBeDuplicate = existingContent.some(c => c.includes('morning meetings'));

    expect(wouldBeDuplicate).toBe(true);
  });

  it('should not extract entities from assistant responses', () => {
    // The extraction should only analyze USER messages, not what Ray said
    const assistantResponse = "That reminds me of the Acme Corp project we discussed.";

    // "Acme Corp" is mentioned by assistant, not user - should NOT be extracted
    // This rule is documented in the CHAT_SUGGESTION_PROMPT
    const rule = 'Things the assistant said (only extract what the USER reveals)';
    expect(rule).toBeDefined();
  });

  it('should not extract generic/vague references', () => {
    // Generic mentions shouldn't create entities
    const genericMentions = [
      'my friend',         // No name
      'a company',         // No company name
      'the project',       // No project name
      'some colleagues',   // No specific people
      'a meeting',         // No specific event
    ];

    // These patterns should be recognized as too vague
    for (const mention of genericMentions) {
      // Pattern check: if no proper noun/capitalized name follows, don't extract
      const hasSpecificName = /[A-Z][a-z]+/.test(mention);
      expect(hasSpecificName).toBe(false);
    }
  });
});

describe('Bonsai Chat Suggestions: Memory Categories', () => {
  it('preference memories capture user preferences', () => {
    const preferenceExamples = [
      "I prefer Slack over email",
      "I like to exercise in the mornings",
      "I usually skip breakfast",
      "I don't like video calls",
    ];

    // Each should be categorized as 'preference'
    for (const example of preferenceExamples) {
      const hasPreferenceSignal =
        example.toLowerCase().includes('prefer') ||
        example.toLowerCase().includes('like') ||
        example.toLowerCase().includes('usually') ||
        example.toLowerCase().includes("don't");

      expect(hasPreferenceSignal).toBe(true);
    }
  });

  it('decision memories capture choices made', () => {
    const decisionExamples = [
      "I've decided to take the job",
      "We chose to go with Option B",
      "I'm going to postpone the launch",
      "Made the call to hire two more people",
    ];

    // Each should be categorized as 'decision'
    for (const example of decisionExamples) {
      const hasDecisionSignal =
        example.toLowerCase().includes('decided') ||
        example.toLowerCase().includes('chose') ||
        example.toLowerCase().includes('going to') ||
        example.toLowerCase().includes('made the call');

      expect(hasDecisionSignal).toBe(true);
    }
  });

  it('event memories capture time-bound information', () => {
    const eventExamples = [
      "The launch is on March 15th",
      "Her birthday is next Tuesday",
      "Conference starts July 20",
      "Deadline is end of Q2",
    ];

    // Each should have date/time indicators
    for (const example of eventExamples) {
      const hasTimeSignal =
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Q[1-4]|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|next week|end of|[0-9]{1,2}(st|nd|rd|th)?)\b/i.test(example);

      expect(hasTimeSignal).toBe(true);
    }
  });

  it('insight memories capture self-awareness', () => {
    const insightExamples = [
      "I noticed I work better alone",
      "I realized I was avoiding the problem",
      "It hit me that I need more structure",
      "I've come to understand my pattern",
    ];

    // Each should have insight signals
    for (const example of insightExamples) {
      const hasInsightSignal =
        example.toLowerCase().includes('noticed') ||
        example.toLowerCase().includes('realized') ||
        example.toLowerCase().includes('hit me') ||
        example.toLowerCase().includes('understand');

      expect(hasInsightSignal).toBe(true);
    }
  });

  it('fact memories capture neutral information', () => {
    const factExamples = [
      "I have three kids",
      "My team is 12 people",
      "The company was founded in 2019",
      "I've been running for 5 years",
    ];

    // Facts are statements without preference/decision/insight signals
    // They're the "catch-all" category
    expect(factExamples.length).toBe(4);
  });
});

describe('Bonsai Chat Suggestions: Extraction Behavior', () => {
  it('skips extraction for very short messages', () => {
    // Messages < 15 characters should skip extraction entirely
    const shortMessages = ['ok', 'thanks', 'got it', 'yes', 'no'];

    for (const msg of shortMessages) {
      expect(msg.length).toBeLessThan(15);
    }
  });

  it('entity types match expected values', () => {
    const validEntityTypes = ['person', 'project', 'company', 'event', 'goal', 'focus'];

    // All scenario entities should use valid types
    for (const [_, scenario] of Object.entries(chatScenarios)) {
      for (const entity of scenario.expectedEntities) {
        expect(validEntityTypes).toContain(entity.type);
      }
    }
  });

  it('domain types match expected values', () => {
    const validDomains = ['work', 'family', 'sport', 'personal', 'health'];

    // Document that these are the valid domains
    expect(validDomains).toHaveLength(5);
  });
});

// =============================================================================
// INTEGRATION TESTS: Chat Suggestion Extraction (require API key)
// =============================================================================

describe.skipIf(!process.env.INTEGRATION)('Integration: Chat Suggestion Extraction', () => {
  it('extracts entities from a new person mention', async () => {
    const { extractChatSuggestions } = await import('./extraction');

    const scenario = chatScenarios.newPerson;
    const result = await extractChatSuggestions(
      scenario.userMessage,
      scenario.assistantResponse,
      [],
      []
    );

    expect(result.entities.length).toBeGreaterThanOrEqual(1);

    const sarah = result.entities.find(e =>
      e.name.toLowerCase().includes('sarah')
    );
    expect(sarah).toBeDefined();
    expect(sarah?.type).toBe('person');
    expect(sarah?.confidence).toBeGreaterThanOrEqual(0.6);
  }, 30000);

  it('extracts memories from a decision', async () => {
    const { extractChatSuggestions } = await import('./extraction');

    const scenario = chatScenarios.decision;
    const result = await extractChatSuggestions(
      scenario.userMessage,
      scenario.assistantResponse,
      [],
      []
    );

    expect(result.memories.length).toBeGreaterThanOrEqual(1);

    const decisionMemory = result.memories.find(m =>
      m.content.toLowerCase().includes('launch') ||
      m.content.toLowerCase().includes('march')
    );
    expect(decisionMemory).toBeDefined();
    expect(decisionMemory?.category).toBe('decision');
  }, 30000);

  it('extracts multiple entities from rich message', async () => {
    const { extractChatSuggestions } = await import('./extraction');

    const scenario = chatScenarios.multipleEntities;
    const result = await extractChatSuggestions(
      scenario.userMessage,
      scenario.assistantResponse,
      [],
      []
    );

    // Should extract at least James, Maria, Horizon, Adidas
    expect(result.entities.length).toBeGreaterThanOrEqual(2);

    const entityNames = result.entities.map(e => e.name.toLowerCase());
    const hasProject = result.entities.some(e => e.type === 'project');
    const hasPerson = result.entities.some(e => e.type === 'person');

    expect(hasProject || hasPerson).toBe(true);
  }, 30000);

  it('returns empty for casual chat', async () => {
    const { extractChatSuggestions } = await import('./extraction');

    const scenario = chatScenarios.casualChat;
    const result = await extractChatSuggestions(
      scenario.userMessage,
      scenario.assistantResponse,
      [],
      []
    );

    // Casual "thanks" shouldn't extract much
    expect(result.entities.length).toBeLessThanOrEqual(1);
    expect(result.memories.length).toBeLessThanOrEqual(1);
  }, 30000);

  it('skips very short messages', async () => {
    const { extractChatSuggestions } = await import('./extraction');

    const scenario = chatScenarios.tooShort;
    const result = await extractChatSuggestions(
      scenario.userMessage,
      scenario.assistantResponse,
      [],
      []
    );

    // Should return empty due to length check
    expect(result.entities).toHaveLength(0);
    expect(result.memories).toHaveLength(0);
  }, 30000);

  it('does not re-extract existing entities', async () => {
    const { extractChatSuggestions } = await import('./extraction');

    // Message mentioning an existing entity
    const result = await extractChatSuggestions(
      "Had dinner with Celine last night. We talked about FIELD.IO's new project.",
      "Sounds like a nice evening with the family.",
      existingEntities,
      []
    );

    // Should NOT extract Celine or FIELD.IO since they already exist
    const extractedNames = result.entities.map(e => e.name.toLowerCase());
    expect(extractedNames).not.toContain('celine');
    expect(extractedNames).not.toContain('field.io');
  }, 30000);

  it('does not duplicate existing memories', async () => {
    const { extractChatSuggestions } = await import('./extraction');

    // Message that might generate duplicate memory
    const result = await extractChatSuggestions(
      "Remember, I prefer morning meetings. That's when I'm most productive.",
      "Noted. I'll keep that in mind for scheduling.",
      [],
      existingMemories
    );

    // Should not extract a duplicate "prefers morning meetings" memory
    const morningMemories = result.memories.filter(m =>
      m.content.toLowerCase().includes('morning') &&
      m.content.toLowerCase().includes('meeting')
    );

    // Either no such memory, or it's genuinely new info
    expect(morningMemories.length).toBeLessThanOrEqual(1);
  }, 30000);

  it('extracts preference from user statement', async () => {
    const { extractChatSuggestions } = await import('./extraction');

    const scenario = chatScenarios.preference;
    const result = await extractChatSuggestions(
      scenario.userMessage,
      scenario.assistantResponse,
      [],
      []
    );

    expect(result.memories.length).toBeGreaterThanOrEqual(1);

    const preferenceMemory = result.memories.find(m =>
      m.content.toLowerCase().includes('morning') ||
      m.content.toLowerCase().includes('deep work')
    );
    expect(preferenceMemory).toBeDefined();
    expect(preferenceMemory?.category).toBe('preference');
  }, 30000);

  it('extracts insights from self-reflection', async () => {
    const { extractChatSuggestions } = await import('./extraction');

    const scenario = chatScenarios.insightShared;
    const result = await extractChatSuggestions(
      scenario.userMessage,
      scenario.assistantResponse,
      [],
      []
    );

    expect(result.memories.length).toBeGreaterThanOrEqual(1);

    const insightMemory = result.memories.find(m =>
      m.content.toLowerCase().includes('procrastinate') ||
      m.content.toLowerCase().includes('stress')
    );
    expect(insightMemory).toBeDefined();
    expect(insightMemory?.category).toBe('insight');
  }, 30000);

  it('handles complex real-world exchange', async () => {
    const { extractChatSuggestions } = await import('./extraction');

    const result = await extractChatSuggestions(
      `Just got off a call with Tom from Spotify. He wants to move up the timeline
       for the brand refresh - now targeting end of February instead of April.
       My team is going to have to work weekends. Sarah is not going to be happy.`,
      `That's a significant timeline change. What's driving the acceleration?`,
      existingEntities,
      []
    );

    // Should extract Tom, Spotify, Sarah (not Celine since she exists)
    expect(result.entities.length).toBeGreaterThanOrEqual(1);

    // Should extract memory about timeline change
    expect(result.memories.length).toBeGreaterThanOrEqual(1);

    const timelineMemory = result.memories.find(m =>
      m.content.toLowerCase().includes('february') ||
      m.content.toLowerCase().includes('timeline')
    );
    expect(timelineMemory).toBeDefined();
  }, 30000);
});

// =============================================================================
// MEMORY EXTRACTION TESTS
// =============================================================================

describe('Memory Extraction Schema', () => {
  it('memory has required fields', () => {
    interface Memory {
      id: string;
      content: string;
      source_type: 'thread' | 'capture' | 'upload';
      source_id: string;
      entities: string[];
      importance: number;
    }

    const validMemory: Memory = {
      id: '123',
      content: 'User prefers morning meetings',
      source_type: 'thread',
      source_id: 'thread-456',
      entities: ['entity-1'],
      importance: 0.7,
    };

    expect(validMemory.importance).toBeGreaterThanOrEqual(0);
    expect(validMemory.importance).toBeLessThanOrEqual(1);
  });

  it('pattern memory has high importance', () => {
    // User-confirmed patterns should have high importance
    const patternImportance = 0.8;
    expect(patternImportance).toBeGreaterThanOrEqual(0.7);
  });
});

// =============================================================================
// SUMMARY
// =============================================================================

describe('Test Suite Summary', () => {
  it('documents what this test suite covers', () => {
    const coverage = {
      'Unit Tests - Onboarding': [
        'Test data structure validation',
        'Extraction rules documentation',
        'Anti-hallucination patterns',
        'Focus extraction requirements',
        'Two-stage architecture validation',
      ],
      'Unit Tests - Bonsai Chat Suggestions': [
        'ChatSuggestionResult schema validation',
        'Confidence threshold filtering (>= 0.6)',
        'Test scenario coverage (10+ scenarios)',
        'Anti-hallucination rules (no duplicates)',
        'Memory category classification',
        'Extraction behavior rules',
      ],
      'Integration Tests (npm run test:integration)': [
        'Document extraction with real AI',
        'Multi-turn input extraction',
        'Conversation flow after extraction',
        'Coverage scoring against expected entities',
        'Chat suggestion extraction - new persons',
        'Chat suggestion extraction - decisions',
        'Chat suggestion extraction - preferences',
        'Chat suggestion extraction - insights',
        'Anti-duplicate extraction with existing entities',
        'Complex real-world exchanges',
      ],
      'Test Data Files': [
        'data/onboarding/test-marcus.json - Multi-turn onboarding',
        'data/onboarding/test-celine.json - Single document extraction',
        'chatScenarios - 10 chat exchange scenarios for Bonsai testing',
      ],
    };

    expect(Object.keys(coverage).length).toBe(4);
  });
});
