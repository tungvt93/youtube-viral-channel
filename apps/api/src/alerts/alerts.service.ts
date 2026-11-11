import { Injectable, NotFoundException } from "@nestjs/common";
import { getAlertById, listAlerts, markAlertRead, prisma, type Alert } from "@yvi/db";

/** Default/maximum page size for `GET /alerts` — same reasoning as `MAX_LIMIT` in the videos/channels modules. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface AlertDto {
  id: string;
  alertType: string;
  entityType: string;
  entityId: string;
  message: string;
  severity: string;
  isRead: boolean;
  triggeredAt: string;
  readAt: string | null;
}

export interface AlertListQuery {
  isRead?: string;
  limit?: string;
  offset?: string;
}

function toAlertDto(alert: Alert): AlertDto {
  return {
    id: alert.id,
    alertType: alert.alertType,
    entityType: alert.entityType,
    entityId: alert.entityId,
    message: alert.message,
    severity: alert.severity,
    isRead: alert.isRead,
    triggeredAt: alert.triggeredAt.toISOString(),
    readAt: alert.readAt ? alert.readAt.toISOString() : null,
  };
}

/** Mirrors `parseListQuery` in the videos/channels/topics modules: bound-clamp pagination, pass filters through untouched. */
export function parseListQuery(query: AlertListQuery): { isRead?: boolean; limit: number; offset: number } {
  const parsedLimit = query.limit !== undefined ? Number(query.limit) : DEFAULT_LIMIT;
  const parsedOffset = query.offset !== undefined ? Number(query.offset) : 0;
  return {
    isRead: query.isRead === "true" ? true : query.isRead === "false" ? false : undefined,
    limit: Math.min(Math.max(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_LIMIT, 1), MAX_LIMIT),
    offset: Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0,
  };
}

@Injectable()
export class AlertsService {
  /** `GET /alerts` (PRD §16.7) — newest-`triggeredAt`-first, optionally filtered to unread/read. */
  async list(query: AlertListQuery): Promise<AlertDto[]> {
    const filter = parseListQuery(query);
    const rows = await listAlerts(prisma, filter);
    return rows.map(toAlertDto);
  }

  /**
   * `PATCH /alerts/:id/read` (PRD §16.7) — idempotent: a second call against
   * an already-read alert returns it unchanged (original `readAt`
   * preserved) rather than re-stamping `readAt` (plan Decisions, 2026-11-06).
   */
  async markRead(id: string): Promise<AlertDto> {
    const existing = await getAlertById(prisma, id);
    if (!existing) {
      throw new NotFoundException(`alert ${id} not found`);
    }
    if (existing.isRead) {
      return toAlertDto(existing);
    }
    const updated = await markAlertRead(prisma, id, new Date());
    return toAlertDto(updated);
  }
}
