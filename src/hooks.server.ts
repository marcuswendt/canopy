// Server hooks for Canopy
// Handles authentication on Vercel, skips for local/Electron

import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// Only import auth on Vercel to avoid loading Google provider in Electron
const isVercel = process.env.VERCEL === '1';

// Create the auth handle dynamically
let authHandle: Handle = async ({ event, resolve }) => resolve(event);

if (isVercel) {
  // Dynamic import to avoid bundling auth in Electron builds
  const auth = await import('$lib/server/auth');
  authHandle = auth.authHandle;
}

// Protect routes that require authentication
const protectRoutes: Handle = async ({ event, resolve }) => {
  // Skip protection on local/Electron
  if (!isVercel) {
    return resolve(event);
  }

  const { pathname } = event.url;

  // Public routes that don't require auth
  // Note: /api/claude GET is public (only returns config status, not sensitive)
  const publicPaths = ['/login', '/api/auth', '/auth', '/api/claude'];
  const isPublic = publicPaths.some(p => pathname.startsWith(p));

  if (isPublic) {
    return resolve(event);
  }

  // Check if user is authenticated
  const session = await event.locals.auth?.();

  if (!session?.user) {
    // Redirect to login
    return new Response(null, {
      status: 302,
      headers: { Location: '/login' },
    });
  }

  return resolve(event);
};

export const handle = sequence(authHandle, protectRoutes);
