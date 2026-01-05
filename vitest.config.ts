import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'build', 'dist-electron'],
    testTimeout: 60000, // 60s timeout for AI calls
    hookTimeout: 60000,
    setupFiles: ['./src/lib/test/vitest-setup.ts'],
  },
  resolve: {
    alias: {
      '$lib': resolve('./src/lib'),
    },
  },
});
