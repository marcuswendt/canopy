// Layout server load function
// Passes auth session to all pages on Vercel

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  // Get session if auth is available (Vercel only)
  const session = await event.locals.auth?.();

  return {
    session,
  };
};
