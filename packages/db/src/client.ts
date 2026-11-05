import { PrismaClient } from "../generated/client";

/**
 * Single shared PrismaClient, generated from apps/api/prisma/schema.prisma
 * (the schema's source of truth stays in apps/api; this package only
 * centralizes the generated client + typed repositories so both apps/api
 * and apps/worker query the same database through the same singleton).
 */
export const prisma = new PrismaClient();

export type { PrismaClient } from "../generated/client";
