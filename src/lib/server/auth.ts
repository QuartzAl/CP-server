// src/lib/auth.ts
import 'dotenv/config';
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "$lib/server/prisma";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:5173",
  database: prismaAdapter(prisma, {
    provider: "postgresql", // or "sqlite", "mysql"
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
  },
  user: {
    additionalFields: {
      requiresPasswordChange: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "user", // Defaults everyone to a regular user
      },
    },
  },
  plugins: [
    sveltekitCookies(getRequestEvent)
  ],
});
