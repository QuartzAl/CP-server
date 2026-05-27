// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  // Pass the user from the hook to the frontend
  return {
    user: locals.user
  };
};
