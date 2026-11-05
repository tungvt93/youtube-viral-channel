import type { PrismaClient } from "@yvi/db";
import type { YouTubeClient } from "@yvi/youtube-client";
import type { Logger } from "pino";
import type { Queues } from "../queues/index";

/**
 * Dependencies are injected (rather than imported as singletons) so every
 * processor can be unit-tested against a mocked db/youtube/queues without a
 * real Redis/Postgres/network call.
 */
export interface ProcessorDeps {
  db: PrismaClient;
  youtube: YouTubeClient;
  queues: Queues;
  logger: Logger;
  now?: () => Date;
}
