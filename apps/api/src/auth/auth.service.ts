import { randomBytes } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { createSession, deleteSession, findUserByEmail, getActiveSessionByToken, prisma } from "@yvi/db";

/** First-cut session lifetime (task-local default, not yet backed by a PRD requirement). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

export interface LoginResult {
  sessionToken: string;
  expiresAt: Date;
  user: AuthenticatedUser;
}

function toAuthenticatedUser(user: { id: string; email: string; role: string }): AuthenticatedUser {
  return { id: user.id, email: user.email, role: user.role };
}

@Injectable()
export class AuthService {
  async login(email: string, password: string): Promise<LoginResult> {
    const user = await findUserByEmail(prisma, email);
    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordMatches = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await createSession(prisma, { userId: user.id, sessionToken, expiresAt });

    return { sessionToken, expiresAt, user: toAuthenticatedUser(user) };
  }

  async logout(sessionToken: string): Promise<void> {
    await deleteSession(prisma, sessionToken);
  }

  async me(sessionToken: string | undefined): Promise<AuthenticatedUser> {
    if (!sessionToken) {
      throw new UnauthorizedException("Missing session token");
    }

    const session = await getActiveSessionByToken(prisma, sessionToken, new Date());
    if (!session) {
      throw new UnauthorizedException("Invalid or expired session");
    }

    return toAuthenticatedUser(session.user);
  }
}
