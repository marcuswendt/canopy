#!/usr/bin/env node
/**
 * Electron launcher.
 *
 * Ensures ELECTRON_RUN_AS_NODE is not set when running Electron,
 * which can be inherited from parent processes (like VSCode or Claude Code).
 *
 * Note: Native modules (better-sqlite3) may need to be rebuilt for Electron.
 * Run `npx @electron/rebuild` if you see NODE_MODULE_VERSION errors.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;

// Get the electron binary path
console.log('[launcher] Getting electron binary path...');
const electronBinaryPath = require('electron');
console.log('[launcher] Binary:', electronBinaryPath);

if (!fs.existsSync(electronBinaryPath)) {
  console.error('[launcher] ERROR: Binary not found');
  process.exit(1);
}

// Run Electron with a clean environment (without ELECTRON_RUN_AS_NODE)
const args = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['.'];
console.log('[launcher] Starting Electron with args:', args);

// Create environment without ELECTRON_RUN_AS_NODE
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinaryPath, args, {
  stdio: 'inherit',
  cwd: projectRoot,
  env: env
});

child.on('close', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('[launcher] Spawn error:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});
process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});
