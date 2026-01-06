import adapterStatic from '@sveltejs/adapter-static';
import adapterVercel from '@sveltejs/adapter-vercel';

// Use Vercel adapter when VERCEL env var is set, otherwise static for Electron
const isVercel = process.env.VERCEL === '1';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: isVercel
      ? adapterVercel({
          runtime: 'nodejs22.x',
        })
      : adapterStatic({
          fallback: 'index.html',
        }),
  },
};

export default config;
