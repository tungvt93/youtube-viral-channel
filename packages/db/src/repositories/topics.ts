import type { PrismaClient, Topic, VideoTopic } from "../../generated/client";

const MAX_SLUG_LENGTH = 160;

/**
 * Turns a free-text AI-proposed topic label into the `topics.slug` lookup
 * key: lowercased, non-alphanumeric runs collapsed to a single hyphen,
 * leading/trailing hyphens trimmed, capped to the column's `varchar(160)`.
 * Two different free-text labels that normalize to the same slug are
 * treated as the same topic — this is the whole point of matching by slug
 * instead of by exact label text.
 */
export function slugifyTopicLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, MAX_SLUG_LENGTH);
}

export function findTopicBySlug(db: PrismaClient, slug: string): Promise<Topic | null> {
  return db.topic.findUnique({ where: { slug } });
}

export function getTopicById(db: PrismaClient, id: string): Promise<Topic | null> {
  return db.topic.findUnique({ where: { id } });
}

/**
 * Finds an existing topic by slug, or creates a new `status = "candidate"`,
 * `created_by = "ai"` topic row (PRD §10: AI-proposed topics start as
 * candidates, promoted/merged later by `topic-normalization`). Handles the
 * create-race on the unique `slug` constraint by re-reading rather than
 * failing the whole classification run over a benign concurrent insert.
 */
export async function getOrCreateCandidateTopic(
  db: PrismaClient,
  input: { canonicalName: string; description: string; confidence: number },
): Promise<Topic> {
  const slug = slugifyTopicLabel(input.canonicalName);
  const existing = await findTopicBySlug(db, slug);
  if (existing) {
    return existing;
  }
  try {
    return await db.topic.create({
      data: {
        slug,
        canonicalName: input.canonicalName,
        description: input.description,
        status: "candidate",
        confidence: input.confidence,
        createdBy: "ai",
      },
    });
  } catch (error) {
    const again = await findTopicBySlug(db, slug);
    if (again) {
      return again;
    }
    throw error;
  }
}

export interface UpsertVideoTopicInput {
  videoId: string;
  topicId: string;
  relationType: string;
  confidence: number;
  classificationModel: string;
  promptVersion: string;
  classifiedAt: Date;
}

/**
 * Links a video to a topic it was just classified into. Upserted on the
 * composite `(video_id, topic_id)` key so re-running classification for the
 * same video (shouldn't happen past the first successful run, but is safe
 * if it does) updates the relation instead of erroring. `topicId` is stored
 * exactly as resolved at classification time and is never rewritten on a
 * later merge — readers resolve `merged_into_topic_id` themselves (plan
 * Risk: "Merge semantics for video_topics").
 */
export function upsertVideoTopic(db: PrismaClient, input: UpsertVideoTopicInput): Promise<VideoTopic> {
  const data = {
    relationType: input.relationType,
    confidence: input.confidence,
    classificationModel: input.classificationModel,
    promptVersion: input.promptVersion,
    classifiedAt: input.classifiedAt,
  };
  return db.videoTopic.upsert({
    where: { videoId_topicId: { videoId: input.videoId, topicId: input.topicId } },
    create: { videoId: input.videoId, topicId: input.topicId, ...data },
    update: data,
  });
}

export interface NormalizationCandidateRow {
  id: string;
  slug: string;
  canonicalName: string;
  description: string;
  videoCount: number;
  sampleVideoTitles: string[];
}

/**
 * Current `status = "candidate"` topics for a `topic-normalization` batch,
 * each with its video count and a small sample of linked video titles (the
 * context `normalizeTopics` needs to tell real duplicates apart). Ordered
 * oldest-created-first so the longest-standing candidates get resolved
 * first across repeated ticks.
 */
export async function listCandidateTopicsForNormalization(
  db: PrismaClient,
  limit: number,
): Promise<NormalizationCandidateRow[]> {
  const rows = await db.topic.findMany({
    where: { status: "candidate" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      slug: true,
      canonicalName: true,
      description: true,
      _count: { select: { videoTopics: true } },
      videoTopics: {
        take: 5,
        orderBy: { classifiedAt: "desc" },
        select: { video: { select: { title: true } } },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    canonicalName: row.canonicalName,
    description: row.description,
    videoCount: row._count.videoTopics,
    sampleVideoTitles: row.videoTopics.map((vt) => vt.video.title),
  }));
}

/** Applies a `topic-normalization` "merge" proposal: PRD-style soft merge, no `video_topics` rewrite (see `upsertVideoTopic` doc comment). */
export function applyTopicMerge(db: PrismaClient, topicId: string, mergeIntoTopicId: string): Promise<Topic> {
  return db.topic.update({
    where: { id: topicId },
    data: { status: "merged", mergedIntoTopicId: mergeIntoTopicId },
  });
}

/**
 * Applies a `topic-normalization` "promote" proposal: candidate -> active,
 * optionally applying the model's cleaned-up name/description. `"active"`
 * and `"merged"` are task-local status values (the PRD specifies the
 * candidate -> normalize workflow's behavior, not a literal status enum) —
 * chosen to read naturally alongside the schema's existing `"candidate"`
 * default.
 */
export function applyTopicPromotion(
  db: PrismaClient,
  topicId: string,
  updates: { canonicalName: string | null; description: string | null },
): Promise<Topic> {
  return db.topic.update({
    where: { id: topicId },
    data: {
      status: "active",
      canonicalName: updates.canonicalName ?? undefined,
      description: updates.description ?? undefined,
    },
  });
}

export interface TopicListFilter {
  status?: string;
  marketId?: string;
  limit: number;
  offset: number;
}

export interface TopicListRow {
  id: string;
  slug: string;
  canonicalName: string;
  description: string;
  status: string;
  confidence: number;
  createdBy: string;
  createdAt: Date;
  latestMarketId: string | null;
  latestMomentumScore: number | null;
  latestLifecycleState: string | null;
  latestWindowEnd: Date | null;
}

/**
 * `GET /topics` backing query: each topic plus its single latest
 * `trend_snapshot` (optionally restricted to one market), same `DISTINCT
 * ON`/`LEFT JOIN LATERAL` shape as `channels.ts`'s `listChannels`. Topics
 * with no snapshot yet (nothing observed in any window) still appear, with
 * null trend fields, sorted after topics that do have one.
 */
export async function listTopics(db: PrismaClient, filter: TopicListFilter): Promise<TopicListRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [filter.limit, filter.offset];
  let marketClause = "";
  if (filter.marketId) {
    params.push(filter.marketId);
    marketClause = `AND market_id = $${params.length}`;
  }
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`t.status = $${params.length}`);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return db.$queryRawUnsafe<TopicListRow[]>(
    `
    SELECT
      t.id AS "id",
      t.slug AS "slug",
      t.canonical_name AS "canonicalName",
      t.description AS "description",
      t.status AS "status",
      t.confidence AS "confidence",
      t.created_by AS "createdBy",
      t.created_at AS "createdAt",
      latest.market_id AS "latestMarketId",
      latest.momentum_score AS "latestMomentumScore",
      latest.lifecycle_state AS "latestLifecycleState",
      latest.window_end AS "latestWindowEnd"
    FROM topics t
    LEFT JOIN LATERAL (
      SELECT market_id, momentum_score, lifecycle_state, window_end
      FROM trend_snapshots
      WHERE topic_id = t.id ${marketClause}
      ORDER BY window_end DESC
      LIMIT 1
    ) latest ON true
    ${whereClause}
    ORDER BY latest.momentum_score DESC NULLS LAST, t.created_at DESC
    LIMIT $1 OFFSET $2
    `,
    ...params,
  );
}
