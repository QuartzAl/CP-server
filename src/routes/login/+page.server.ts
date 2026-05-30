import type { PageServerLoad } from './$types';
import prisma from '$lib/server/prisma';
import { redirect } from '@sveltejs/kit';
// 1. This variable lives in the server's memory and persists across all user requests
let hasAdminCached = false;

export const load: PageServerLoad = async ({ locals }) => {
  // If already logged in, normal redirect
  if (locals.user) {
    throw redirect(303, '/');
  }

  // 2. Fast path: If we already know an admin exists in memory, skip the DB check!
  if (hasAdminCached) {
    return {};
  }

  // 3. Slow path: Only runs until the very first admin is registered
  const admin = await prisma.user.findFirst({
    where: { role: 'admin' }
  });

  if (!admin) {
    // No admin exists yet -> Send them to the onboarding route
    throw redirect(303, '/onboarding');
  }

  // 4. Cache the result so we never query the database for this check again
  hasAdminCached = true;

  return {};
};

