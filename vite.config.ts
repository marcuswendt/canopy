import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'esnext',
  },
  ssr: {
    // Don't bundle native modules - they'll be dynamically imported at runtime
    external: ['better-sqlite3'],
  },
});
