import { BadRequestException, Body, Controller, Get, HttpCode, Headers, Post } from "@nestjs/common";
import { RateLimit } from "../common/rate-limit.decorator";
import { AuthService } from "./auth.service";
import { Public } from "./public.decorator";
import { SESSION_TOKEN_HEADER } from "./session-auth.guard";

interface LoginBody {
  email?: string;
  password?: string;
}

/**
 * BFF-facing auth surface (plan Approach step 1). `apps/web` Route Handlers
 * call these server-to-server and own the first-party session cookie;
 * `apps/api` never sees or sets a cookie, only the `X-Session-Token` header.
 */
@Controller("auth")
@Public()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @RateLimit({ limit: 5, windowMs: 60_000 })
  login(@Body() body: LoginBody) {
    if (!body?.email || !body?.password) {
      throw new BadRequestException("email and password are required");
    }
    return this.authService.login(body.email, body.password);
  }

  @Post("logout")
  @HttpCode(204)
  @RateLimit({ limit: 20, windowMs: 60_000 })
  async logout(@Headers(SESSION_TOKEN_HEADER) sessionToken?: string) {
    if (sessionToken) {
      await this.authService.logout(sessionToken);
    }
  }

  @Get("me")
  me(@Headers(SESSION_TOKEN_HEADER) sessionToken?: string) {
    return this.authService.me(sessionToken);
  }
}
