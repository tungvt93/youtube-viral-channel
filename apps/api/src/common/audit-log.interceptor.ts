import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { createAdminAuditLog, prisma } from "@yvi/db";
import { Logger } from "nestjs-pino";
import type { Observable } from "rxjs";
import { catchError, tap } from "rxjs/operators";

interface RequestWithUser {
  method: string;
  path?: string;
  url: string;
  user?: { id: string };
}

interface ResponseLike {
  statusCode: number;
}

/**
 * Global `APP_INTERCEPTOR` (plan Scope, PRD §20.4): one `AdminAuditLog` row
 * per non-`GET` request where `request.user` is set — method+path+
 * statusCode+userId+timestamp only, never request/response bodies. A `GET`
 * or an unauthenticated request (no `request.user`, e.g. `POST /auth/login`
 * itself) is never audited.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithUser>();

    if (request.method === "GET" || !request.user) {
      return next.handle();
    }

    const userId = request.user.id;
    const method = request.method;
    const path = request.path ?? request.url;

    const write = (statusCode: number): void => {
      createAdminAuditLog(prisma, { userId, method, path, statusCode, createdAt: new Date() }).catch((error: unknown) => {
        this.logger.error(`failed to write admin audit log for ${method} ${path}: ${String(error)}`);
      });
    };

    return next.handle().pipe(
      tap(() => write(http.getResponse<ResponseLike>().statusCode)),
      catchError((error: unknown) => {
        const statusCode = typeof (error as { getStatus?: () => number })?.getStatus === "function" ? (error as { getStatus: () => number }).getStatus() : 500;
        write(statusCode);
        throw error;
      }),
    );
  }
}
