#!/usr/bin/env node
/**
 * Onboarding Extraction Test Runner
 *
 * Tests the AI-driven onboarding extraction against expected outputs.
 *
 * Usage:
 *   node scripts/test-onboarding.js
 *   node scripts/test-onboarding.js --dry-run  # Show inputs only
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load test data
const testDataPath = join(__dirname, '../data/onboarding/test-marcus.json');
const testData = JSON.parse(readFileSync(testDataPath, 'utf-8'));

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function log(msg: string, color?: keyof typeof colors) {
  if (color) {
    console.log(`${colors[color]}${msg}${colors.reset}`);
  } else {
    console.log(msg);
  }
}

function printSection(title: string) {
  console.log();
  log(`━━━ ${title} ━━━`, 'cyan');
}

function printExpected() {
  printSection('EXPECTED RESULTS');

  log('\nDomains:', 'bold');
  for (const domain of testData.expected.domains) {
    console.log(`  ◆ ${domain.name} (${domain.type})`);
  }

  log('\nPeople:', 'bold');
  for (const person of testData.expected.entities.people) {
    const details = [person.relationship];
    if (person.age !== undefined) details.push(`age ${person.age}`);
    if (person.notes) details.push(person.notes);
    console.log(`  👤 ${person.name} — ${details.join(', ')}`);
  }

  log('\nCompanies:', 'bold');
  for (const company of testData.expected.entities.companies) {
    console.log(`  🏢 ${company.name}${company.role ? ` (${company.role})` : ''}`);
  }

  log('\nEvents/Races:', 'bold');
  for (const event of testData.expected.entities.events) {
    const priority = event.priority === 'primary' ? ' ⭐' : '';
    console.log(`  📅 ${event.name} — ${event.date}${priority}`);
  }

  log('\nProjects:', 'bold');
  for (const project of testData.expected.entities.projects) {
    console.log(`  📋 ${project.name} (${project.domain})`);
  }

  log('\nURLs:', 'bold');
  for (const url of testData.expected.urls) {
    console.log(`  🔗 ${url.url} [${url.scope}]`);
  }

  log('\nSuggested Integrations:', 'bold');
  console.log(`  ${testData.expected.integrations_to_suggest.join(', ')}`);
}

function printInputs() {
  printSection('TEST INPUTS');

  for (const input of testData.inputs) {
    log(`\n[Turn ${input.turn}] ${input.context.toUpperCase()}`, 'yellow');
    console.log(colors.dim + input.text.substring(0, 200) + (input.text.length > 200 ? '...' : '') + colors.reset);
  }
}

interface ValidationResult {
  domain: string;
  expected: string[];
  found: string[];
  missing: string[];
  score: number;
}

function validateExtraction(extracted: {
  domains?: Array<{ name: string; type: string }>;
  entities?: Array<{ name: string; type: string; domain: string }>;
}): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Validate domains
  const expectedDomainNames = testData.expected.domains.map((d: any) => d.name.toLowerCase());
  const extractedDomainNames = (extracted.domains || []).map(d => d.name.toLowerCase());

  const foundDomains = expectedDomainNames.filter((n: string) =>
    extractedDomainNames.some(e => e.includes(n) || n.includes(e))
  );
  const missingDomains = expectedDomainNames.filter((n: string) =>
    !extractedDomainNames.some(e => e.includes(n) || n.includes(e))
  );

  results.push({
    domain: 'Domains',
    expected: expectedDomainNames,
    found: foundDomains,
    missing: missingDomains,
    score: foundDomains.length / expectedDomainNames.length,
  });

  // Validate people
  const expectedPeopleNames = testData.expected.entities.people.map((p: any) => p.name.toLowerCase());
  const extractedPeople = (extracted.entities || []).filter(e => e.type === 'person');
  const extractedPeopleNames = extractedPeople.map(p => p.name.toLowerCase());

  const foundPeople = expectedPeopleNames.filter((n: string) =>
    extractedPeopleNames.some(e => e.includes(n) || n.includes(e))
  );
  const missingPeople = expectedPeopleNames.filter((n: string) =>
    !extractedPeopleNames.some(e => e.includes(n) || n.includes(e))
  );

  results.push({
    domain: 'People',
    expected: expectedPeopleNames,
    found: foundPeople,
    missing: missingPeople,
    score: foundPeople.length / expectedPeopleNames.length,
  });

  return results;
}

function printValidation(results: ValidationResult[]) {
  printSection('VALIDATION RESULTS');

  for (const result of results) {
    const pct = Math.round(result.score * 100);
    const color = pct >= 80 ? 'green' : pct >= 50 ? 'yellow' : 'red';

    log(`\n${result.domain}: ${pct}%`, color);
    if (result.missing.length > 0) {
      log(`  Missing: ${result.missing.join(', ')}`, 'red');
    }
    if (result.found.length > 0) {
      log(`  Found: ${result.found.join(', ')}`, 'green');
    }
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const turnArg = args.find(a => a.startsWith('--turn='));
  const specificTurn = turnArg ? parseInt(turnArg.split('=')[1]) : null;

  log('╔════════════════════════════════════════╗', 'cyan');
  log('║   Canopy Onboarding Extraction Test    ║', 'cyan');
  log('╚════════════════════════════════════════╝', 'cyan');

  console.log(`\nTest subject: ${testData.name}`);
  console.log(`Location: ${testData.location}`);
  console.log(`Inputs: ${testData.inputs.length} turns`);

  if (dryRun) {
    printInputs();
    printExpected();
    return;
  }

  // For now, just show expected - actual AI testing requires the full app context
  printExpected();

  log('\n' + '─'.repeat(50), 'dim');
  log('To test with actual AI extraction:', 'dim');
  log('  1. Run the Electron app', 'dim');
  log('  2. Go through onboarding with the test inputs', 'dim');
  log('  3. Compare extracted data in Data Inspector (Cmd+Shift+D)', 'dim');
}

main().catch(console.error);
