// src/hooks.server.ts
import { auth } from '$lib/server/auth';
import { redirect, type Handle } from '@sveltejs/kit';


export const handle: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;

  if (path.startsWith('/api/auth')) {
    return resolve(event);
  }

  const sessionData = await auth.api.getSession({
    headers: event.request.headers
  });

  const user = sessionData?.user;

  // RULE 1: Any user not logged in must be redirected to the login page.
  // (We skip this check if they are already on the login page to avoid infinite loops)
  if (!user && path !== '/login') {
    // If they are trying to access an API route, reject with JSON
    if (path.startsWith('/api')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // Otherwise, it's a page request — redirect to login
    throw redirect(303, '/login');
  }
  // If the user IS logged in...
  if (user) {
    // Prevent logged-in users from seeing the login page
    if (path === '/login') {
      throw redirect(303, user.role === 'admin' ? '/admin' : '/');
    }

    // (Optional) The password change enforcement we added earlier
    if (user.requiresPasswordChange && path !== '/change-password') {
      throw redirect(303, '/change-password');
    }

    // RULE 2: Regular users cannot access the admin panel
    if (path.startsWith('/admin') && user.role !== 'admin') {
      // Redirect them to a safe page (e.g., the root of your app)
      throw redirect(303, '/');
    }
  }

  // Attach the user to locals so your Svelte components can easily access the role
  if (user) {
    event.locals.user = user;
  }

  return resolve(event);
};
