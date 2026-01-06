#!/usr/bin/env node
// Build script for Electron main process
// Bundles src/electron/main.js into dist-electron/main.cjs

const esbuild = require('esbuild');

async function build() {
  try {
    await esbuild.build({
      entryPoints: ['src/electron/main.js'],
      bundle: true,
      platform: 'node',
      target: 'node20',
      outfile: 'dist-electron/main.cjs',
      format: 'cjs',
      // Don't bundle these - provided by runtime or native
      external: ['electron', 'better-sqlite3'],
      // Add banner to handle import.meta.url in CJS
      banner: {
        js: `
// Banner: Polyfill import.meta.url for CJS
const __importMetaUrl = require("url").pathToFileURL(__filename).href;
`.trim()
      },
      // Replace import.meta.url with our polyfill
      define: {
        'import.meta.url': '__importMetaUrl',
      },
      sourcemap: true,
      minify: false,
    });
    console.log('Main process built successfully: dist-electron/main.cjs');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
