// Auth.js configuration for Canopy web deployment
// Only active on Vercel - Electron skips auth entirely

import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/sveltekit/providers/google';
import type { Handle } from '@sveltejs/kit';

// Allowed email addresses (invite-only access)
// In production, this could come from env var or database
const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS || '').split(',').filter(Boolean)
);

export const { handle, signIn, signOut } = SvelteKitAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Allow all users if no whitelist is configured (dev mode)
      if (ALLOWED_EMAILS.size === 0) {
        return true;
      }
      // Check if user's email is in the allowed list
      if (user.email && ALLOWED_EMAILS.has(user.email)) {
        return true;
      }
      // Reject unauthorized users
      return false;
    },
    async session({ session, token }) {
      // Add user ID to session for database scoping
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  trustHost: true,
});

// Export auth handle for use in hooks.server.ts
export const authHandle: Handle = handle;
