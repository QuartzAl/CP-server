// src/lib/server/prisma.ts
// import { PrismaClient } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";
import { DATABASE_URL } from '$env/static/private'

const connectionString = DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = global.__prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV === 'development') {
  global.__prisma = prisma;
}

export default prisma;
