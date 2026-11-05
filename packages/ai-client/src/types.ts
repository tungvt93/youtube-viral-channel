/**
 * PRD §19.1 AIProvider shape, narrowed to the two MVP tasks this phase
 * implements (PRD §19.2 MVP split) — `summarizeTrend` is explicitly a later
 * phase and is not part of this interface.
 */

/** Raw metadata handed to `classifyVideo`. Every string field here is untrusted, creator-supplied content — see `./prompt`'s framing. */
export interface ClassifyVideoInput {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  channelTitle: string;
  channelDescription: string;
}

/**
 * PRD §10.4 classification output shape, field names kept exactly as
 * specified (snake_case) rather than camelCased, since this is the literal
 * contract both the prompt and the Zod schema validate against.
 */
export interface ClassificationResult {
  primary_topic: string;
  secondary_topics: string[];
  format: string;
  content_language: string;
  keywords: string[];
  confidence: number;
  needs_review: boolean;
}

/** One existing candidate topic handed to `normalizeTopics` for a batch merge/promotion decision. */
export interface TopicNormalizationCandidate {
  id: string;
  slug: string;
  canonicalName: string;
  description: string;
  /** A small sample of titles from videos linked to this topic — context for the model, not an exhaustive list. */
  sampleVideoTitles: string[];
  videoCount: number;
}

export interface NormalizeTopicsInput {
  candidates: TopicNormalizationCandidate[];
}

/**
 * One proposed action for one candidate topic (task-local shape — the PRD
 * does not specify an exact wire schema for normalization, only the
 * behavior: propose merges/promotions over accumulated candidates).
 * `merge_into_topic_id` must reference another `id` from the same input
 * batch when `action === "merge"`.
 */
export interface TopicNormalizationProposal {
  topic_id: string;
  action: "merge" | "promote" | "keep";
  merge_into_topic_id: string | null;
  canonical_name: string | null;
  description: string | null;
  reason: string;
}

export interface NormalizeTopicsOutput {
  proposals: TopicNormalizationProposal[];
}

/** PRD §19.1: the two MVP AI tasks this phase owns. Gemini-only for MVP (docs/decisions/0001-mvp-scope-decisions.md item 7). */
export interface AIProvider {
  classifyVideo(input: ClassifyVideoInput): Promise<ClassificationResult>;
  normalizeTopics(input: NormalizeTopicsInput): Promise<NormalizeTopicsOutput>;
}
