import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/** Marks a route/controller as exempt from the global SessionAuthGuard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
