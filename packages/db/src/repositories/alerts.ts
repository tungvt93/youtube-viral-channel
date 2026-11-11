import type { Alert, PrismaClient } from "../../generated/client";

export interface CreateAlertInput {
  alertType: string;
  entityType: string;
  entityId: string;
  message: string;
  severity: string;
  triggeredAt: Date;
}

/**
 * Inserts an `Alert` unless an existing row for the same
 * `(alertType, entityType, entityId)` already fired within the last
 * `cooldownMs` (PRD §11.7: dedup by key + cooldown) — returns `null` (no
 * insert) when deduplicated, the created row otherwise.
 */
export async function createAlertIfDue(db: PrismaClient, input: CreateAlertInput, cooldownMs: number): Promise<Alert | null> {
  const cooldownStart = new Date(input.triggeredAt.getTime() - cooldownMs);
  const existing = await db.alert.findFirst({
    where: {
      alertType: input.alertType,
      entityType: input.entityType,
      entityId: input.entityId,
      triggeredAt: { gte: cooldownStart },
    },
  });
  if (existing) {
    return null;
  }
  return db.alert.create({ data: input });
}

export interface AlertListFilter {
  isRead?: boolean;
  limit: number;
  offset: number;
}

/** `GET /alerts` backing query (PRD §16.7) — newest-triggered-first, optional `isRead` filter. */
export function listAlerts(db: PrismaClient, filter: AlertListFilter): Promise<Alert[]> {
  return db.alert.findMany({
    where: filter.isRead !== undefined ? { isRead: filter.isRead } : {},
    orderBy: { triggeredAt: "desc" },
    take: filter.limit,
    skip: filter.offset,
  });
}

export function getAlertById(db: PrismaClient, id: string): Promise<Alert | null> {
  return db.alert.findUnique({ where: { id } });
}

/** `PATCH /alerts/:id/read` write — sets `isRead`/`readAt`. The 404/already-read idempotency is handled by the caller (see `apps/api` alerts service), not here. */
export function markAlertRead(db: PrismaClient, id: string, readAt: Date): Promise<Alert> {
  return db.alert.update({ where: { id }, data: { isRead: true, readAt } });
}
