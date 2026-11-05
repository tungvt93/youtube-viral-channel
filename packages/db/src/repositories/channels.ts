import type { Channel, PrismaClient } from "../../generated/client";

export interface ChannelUpsertInput {
  youtubeChannelId: string;
  title: string;
  description: string;
  customUrl: string | null;
  thumbnailUrl: string | null;
  creatorCountry: string | null;
  publishedAt: Date | null;
  uploadsPlaylistId: string | null;
  currentSubscriberCount: bigint | null;
  currentViewCount: bigint | null;
  currentVideoCount: bigint | null;
  subscriberCountHidden: boolean;
}

/**
 * Upserts a channel by its unique `youtube_channel_id`. Called from the
 * channel-enrichment processor, which only calls `channels.list` (playlist
 * fetching is out of scope for Phase 1, see PRD §25 Phase 4).
 */
export function upsertChannel(db: PrismaClient, input: ChannelUpsertInput): Promise<Channel> {
  const data = {
    title: input.title,
    description: input.description,
    customUrl: input.customUrl,
    thumbnailUrl: input.thumbnailUrl,
    creatorCountry: input.creatorCountry,
    publishedAt: input.publishedAt,
    uploadsPlaylistId: input.uploadsPlaylistId,
    currentSubscriberCount: input.currentSubscriberCount,
    currentViewCount: input.currentViewCount,
    currentVideoCount: input.currentVideoCount,
    subscriberCountHidden: input.subscriberCountHidden,
    lastEnrichedAt: new Date(),
  };
  return db.channel.upsert({
    where: { youtubeChannelId: input.youtubeChannelId },
    create: { youtubeChannelId: input.youtubeChannelId, ...data },
    update: data,
  });
}

/**
 * Creates a bare-minimum channel row from a discovery-time channel id alone,
 * so that `Video.channelId` can be set before full channel enrichment runs.
 * Fields required by the schema but not yet known are filled with
 * placeholders that `upsertChannel` overwrites once enrichment completes.
 */
export function ensureChannelStub(db: PrismaClient, youtubeChannelId: string): Promise<Channel> {
  return db.channel.upsert({
    where: { youtubeChannelId },
    create: {
      youtubeChannelId,
      title: "",
      description: "",
      subscriberCountHidden: false,
    },
    update: {},
  });
}

export function getChannelByYoutubeId(db: PrismaClient, youtubeChannelId: string): Promise<Channel | null> {
  return db.channel.findUnique({ where: { youtubeChannelId } });
}
