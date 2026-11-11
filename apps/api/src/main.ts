import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";

/** PRD §20.4 CORS allowlist — comma-separated origins; unset means no cross-origin browser caller is allowed (plan Scope, 2026-11-06). `apps/web`'s own server-to-server calls to `apps/api` are not browser requests and are unaffected by CORS either way. */
function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());

  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  app.enableCors({ origin: allowedOrigins.length > 0 ? allowedOrigins : false });

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
}

bootstrap();
