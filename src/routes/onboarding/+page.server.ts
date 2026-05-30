import prisma from '$lib/server/prisma';
import { auth } from '$lib/server/auth';
import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

// Guard Onboarding: Only allow access if no administrator exists in the database
export const load: PageServerLoad = async () => {
  try {
    const adminExists = await prisma.user.findFirst({
      where: {
        role: 'admin'
      }
    });

    // If an administrator already exists, block onboarding access
    if (adminExists) {
      // throw redirect(303, '/login');
    }
  } catch (error) {
    // If the database isn't fully migrated yet, allow the page to render so the admin can debug
    console.error("Checking existing admin failed:", error);
  }

  return {};
};

export const actions: Actions = {
  default: async ({ request }) => {
    // Double check to prevent race conditions (two users submitting onboarding simultaneously)
    const adminExists = await prisma.user.findFirst({
      where: {
        role: 'admin'
      }
    });

    if (adminExists) {
      return fail(403, { error: 'Onboarding is locked. An administrator is already registered.' });
    }

    const data = await request.formData();
    const name = data.get('name')?.toString().trim();
    const email = data.get('email')?.toString().trim();
    const password = data.get('password')?.toString();
    const confirmPassword = data.get('confirmPassword')?.toString();

    // Basic validation checks
    if (!name || !email || !password || !confirmPassword) {
      return fail(400, { error: 'All fields are required to establish the root administrator account.' });
    }

    if (password !== confirmPassword) {
      return fail(400, { error: 'Verification passwords do not match.' });
    }

    if (password.length < 8) {
      return fail(400, { error: 'Administrative password must be at least 8 characters long.' });
    }

    try {
      // 1. Create the user using Better Auth
      const signUpResult = await auth.api.signUpEmail({
        body: {
          email: email.toLowerCase(),
          password,
          name
        }
      });

      if (!signUpResult) {
        return fail(500, { error: 'Failed to register the user with the authentication provider.' });
      }

      // 2. Safely promote the user to admin inside the local database
      await prisma.user.update({
        where: {
          email: email.toLowerCase()
        },
        data: {
          role: 'admin',
          requiresPasswordChange: false // Since they set their password directly
        }
      });

    } catch (err: any) {
      console.error("Onboarding server error:", err);
      return fail(500, { error: err.message || 'An error occurred while establishing administrative credentials.' });
    }

    // Success redirection
    throw redirect(303, '/login?onboarded=true');
  }
};
