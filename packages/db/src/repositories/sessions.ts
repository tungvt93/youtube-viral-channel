import type { PrismaClient, Session, User } from "../../generated/client";

export interface CreateSessionInput {
  userId: string;
  sessionToken: string;
  expiresAt: Date;
}

export function createSession(db: PrismaClient, input: CreateSessionInput): Promise<Session> {
  return db.session.create({
    data: {
      userId: input.userId,
      sessionToken: input.sessionToken,
      expiresAt: input.expiresAt,
    },
  });
}

export type ActiveSessionWithUser = Session & { user: User };

/**
 * Looks up a session by token and returns it with its `User` only when still
 * valid (`expiresAt` in the future relative to `now`) — an expired row is
 * treated the same as no row at all, never returned for the guard/`/auth/me`
 * to accept.
 */
export async function getActiveSessionByToken(
  db: PrismaClient,
  sessionToken: string,
  now: Date,
): Promise<ActiveSessionWithUser | null> {
  const session = await db.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  });
  if (!session || session.expiresAt <= now) {
    return null;
  }
  return session;
}

/** Idempotent: deleting an already-gone/garbage token is a no-op, not an error (logout must never fail on a stale session). */
export async function deleteSession(db: PrismaClient, sessionToken: string): Promise<void> {
  await db.session.deleteMany({ where: { sessionToken } });
}
