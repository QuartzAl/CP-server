// src/routes/api/auth/[...all]/+server.ts
import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

// Pass all GET requests to Better Auth
export const GET: RequestHandler = ({ request }) => {
  return auth.handler(request);
};

// Pass all POST requests to Better Auth
export const POST: RequestHandler = ({ request }) => {
  return auth.handler(request);
};
