import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'build', 'dist-electron'],
    testTimeout: 30000, // 30s timeout for AI calls
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '$lib': resolve('./src/lib'),
    },
  },
});
