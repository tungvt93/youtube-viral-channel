import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { getActiveSessionByToken, prisma, type ActiveSessionWithUser } from "@yvi/db";
import { IS_PUBLIC_KEY } from "./public.decorator";

export const SESSION_TOKEN_HEADER = "x-session-token";

interface RequestWithUser {
  headers: Record<string, string | string[] | undefined>;
  user?: ActiveSessionWithUser["user"];
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.headers[SESSION_TOKEN_HEADER];
    if (typeof token !== "string" || token.length === 0) {
      throw new UnauthorizedException("Missing session token");
    }

    const session = await getActiveSessionByToken(prisma, token, new Date());
    if (!session) {
      throw new UnauthorizedException("Invalid or expired session");
    }

    request.user = session.user;
    return true;
  }
}
