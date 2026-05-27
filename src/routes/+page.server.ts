import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  // Just by existing, this forces goto() to ping the server,
  // which forces hooks.server.ts to run and check their role!
  return {
    user: locals.user
  };
};
