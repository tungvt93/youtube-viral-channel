import type { PrismaClient } from "../../generated/client";

export interface CreateAdminAuditLogInput {
  userId: string;
  method: string;
  path: string;
  statusCode: number;
  createdAt: Date;
}

/**
 * `AdminAuditLogInterceptor`'s write (PRD §20.4 audit log for admin
 * actions) — method+path+statusCode+userId+timestamp only, never
 * request/response bodies.
 */
export function createAdminAuditLog(db: PrismaClient, input: CreateAdminAuditLogInput) {
  return db.adminAuditLog.create({ data: input });
}
