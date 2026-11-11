import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import { Logger } from "nestjs-pino";

interface ErrorResponseBody {
  code: string;
  message: string;
  details: unknown;
  requestId: string | undefined;
}

interface RequestWithId {
  id?: string;
  method: string;
  url: string;
}

interface ResponseLike {
  status(code: number): { json(body: ErrorResponseBody): unknown };
}

const STATUS_CODE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(HttpStatus)
    .filter(([, value]) => typeof value === "number")
    .map(([name, value]) => [value as number, name]),
);

/** Non-`HttpException` errors never surface their raw message/stack to the client (PRD §16.8: "Không trả API key hoặc secret"). */
function buildErrorBody(exception: unknown): { message: string; details: unknown } {
  if (exception instanceof HttpException) {
    const payload = exception.getResponse();
    if (typeof payload === "string") {
      return { message: payload, details: null };
    }
    if (typeof payload === "object" && payload !== null) {
      const { message, ...rest } = payload as Record<string, unknown>;
      delete rest.statusCode;
      delete rest.error;
      const details = Object.keys(rest).length > 0 ? rest : null;
      const messageText = Array.isArray(message) ? message.join(", ") : typeof message === "string" ? message : exception.message;
      return { message: messageText, details };
    }
    return { message: exception.message, details: null };
  }
  return { message: "Internal server error", details: null };
}

/**
 * Global `APP_FILTER` (plan Scope): unified JSON error shape for every
 * unhandled exception — PRD §16.8's `code`/`message`/`details`/`requestId`
 * — logged via the existing Pino logger regardless of exception type.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithId>();
    const response = ctx.getResponse<ResponseLike>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const { message, details } = buildErrorBody(exception);

    const body: ErrorResponseBody = {
      code: STATUS_CODE_NAMES[status] ?? "INTERNAL_SERVER_ERROR",
      message,
      details,
      requestId: request.id,
    };

    const logDetail = exception instanceof Error ? exception.message : message;
    const logMessage = `${request.method} ${request.url} -> ${status}: ${logDetail}`;
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logMessage, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(logMessage);
    }

    response.status(status).json(body);
  }
}
