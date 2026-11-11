import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { ActiveSessionWithUser } from "@yvi/db";

type RequestUser = ActiveSessionWithUser["user"];

interface RequestWithUser {
  user?: RequestUser;
}

/** Reads `request.user`, already populated by the global `SessionAuthGuard` for every non-`@Public()` route. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): RequestUser => {
  const request = context.switchToHttp().getRequest<RequestWithUser>();
  return request.user as RequestUser;
});
