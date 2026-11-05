import type { AIProvider } from "@yvi/ai-client";
import type { PrismaClient } from "@yvi/db";
import type { YouTubeClient } from "@yvi/youtube-client";
import type { Logger } from "pino";
import type { Queues } from "../queues/index";

/**
 * Dependencies are injected (rather than imported as singletons) so every
 * processor can be unit-tested against a mocked db/youtube/ai/queues without
 * a real Redis/Postgres/network call.
 */
export interface ProcessorDeps {
  db: PrismaClient;
  youtube: YouTubeClient;
  ai: AIProvider;
  /** The Gemini model id actually configured for `ai` — `AIProvider` doesn't expose it, but `ai_classification_runs.model` needs it recorded verbatim. */
  aiModel: string;
  queues: Queues;
  logger: Logger;
  now?: () => Date;
}
