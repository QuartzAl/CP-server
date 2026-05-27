// src/routes/change-password/+page.server.ts
import { auth } from '$lib/server/auth';
import prisma from '$lib/server/prisma';
import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // 1. Double check the user is actually logged in
  if (!locals.user) {
    throw redirect(303, '/login');
  }

  // 2. If they somehow navigated here but DON'T need a password change, 
  // send them away so they don't get trapped.
  if (!locals.user.requiresPasswordChange) {
    throw redirect(303, locals.user.role === 'admin' ? '/admin' : '/');
  }

  return { user: locals.user };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { error: 'Unauthorized' });

    const data = await request.formData();
    const currentPassword = data.get('currentPassword')?.toString();
    const newPassword = data.get('newPassword')?.toString();
    const confirmPassword = data.get('confirmPassword')?.toString();

    // Basic Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      return fail(400, { error: 'All fields are required.' });
    }
    if (newPassword !== confirmPassword) {
      return fail(400, { error: 'New passwords do not match.' });
    }
    if (newPassword.length < 8) {
      return fail(400, { error: 'Password must be at least 8 characters long.' });
    }

    try {
      // Step 1: Tell Better Auth to update the password securely
      await auth.api.changePassword({
        headers: request.headers,
        body: {
          currentPassword,
          newPassword,
          revokeOtherSessions: true // Kicks out any other active sessions for security
        }
      });

      // Step 2: Remove the "forced reset" flag in Prisma
      await prisma.user.update({
        where: { id: locals.user.id },
        data: { requiresPasswordChange: false }
      });

      await auth.api.signInEmail({
        body: {
          email: locals.user.email,
          password: newPassword
        },
        headers: request.headers
      })

    } catch (err: any) {
      // Catch any Better Auth errors (e.g., wrong current password)
      return fail(400, {
        error: err.message || 'Failed to change password. Please verify your current temporary password.'
      });
    }

    // Step 3: Success! Redirect them to their designated dashboard.
    throw redirect(303, locals.user.role === 'admin' ? '/admin' : '/');
  }
};
