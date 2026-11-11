import type { PrismaClient, User } from "../../generated/client";

/** Login lookup (PRD §11.1 FR-AUTH-01) — email is the unique login identifier. */
export function findUserByEmail(db: PrismaClient, email: string): Promise<User | null> {
  return db.user.findUnique({ where: { email } });
}
