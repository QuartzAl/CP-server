// src/routes/admin/+page.server.ts
import prisma from '$lib/server/prisma';
import { auth } from '$lib/server/auth';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async () => {
  // Fetch users via Prisma singleton
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' }
  });
  // console.log(users);

  return { users };
};

export const actions: Actions = {
  createUser: async ({ request }) => {
    const data = await request.formData();
    const email = data.get('email')?.toString();
    const role = data.get('role')?.toString() || 'user';

    if (!email) return fail(400, { error: 'Email is required' });
    const generatedPassword = crypto.randomUUID().slice(0, 12);

    try {
      await auth.api.signUpEmail({
        body: {
          email,
          password: generatedPassword,
          name: email.split('@')[0],
          requiresPasswordChange: true, // Flag them for forced reset
          role: role
        }
      });

      return {
        success: true,
        email,
        generatedPassword // Return to UI so Admin can copy it
      };
    } catch (err) {
      console.log(err);
      return fail(500, { error: 'Failed to create user.' });
    }
  },
  changeRole: async ({ request, locals }) => {
    console.log("--- CHANGE ROLE TRIGGERED ---");
    console.log("Executing User Role:", locals.user?.role);
    // Security check: Only admins can change roles
    if (locals.user?.role !== 'admin') return fail(403, { error: 'Forbidden' });

    const data = await request.formData();
    const userId = data.get('userId')?.toString();
    const newRole = data.get('role')?.toString();

    if (!userId || !newRole) return fail(400, { error: 'Missing data' });

    // Prevent the admin from accidentally demoting themselves
    if (userId === locals.user.id && newRole !== 'admin') {
      return fail(400, { error: 'You cannot demote yourself.' });
    }

    try {
      await prisma.user.update({
        where: { id: userId },
        data: { role: newRole }
      });
      return { success: true };
    } catch (error) {
      return fail(500, { error: 'Failed to update role.' });
    }
  },

  deleteUser: async ({ request, locals }) => {
    // Security check: Only admins can delete
    if (locals.user?.role !== 'admin') return fail(403, { error: 'Forbidden' });

    const data = await request.formData();
    const userId = data.get('userId')?.toString();

    if (!userId) return fail(400, { error: 'Missing User ID' });

    // Prevent the admin from accidentally deleting themselves
    if (userId === locals.user.id) {
      return fail(400, { error: 'You cannot delete your own account.' });
    }

    try {
      await prisma.user.delete({
        where: { id: userId }
      });
      return { success: true };
    } catch (error) {
      return fail(500, { error: 'Failed to delete user.' });
    }
  }
};
