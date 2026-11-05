import { z } from "zod";

/**
 * PRD §10.4 classification output, validated field-for-field. The array/
 * string-length caps below are not from the PRD — they're first-cut,
 * task-local bounds (same role as this phase's other documented first-cut
 * constants) chosen to keep a single video's classification small and to
 * bound how much of a prompt-injection attempt in the source metadata could
 * even survive into stored output: 5 secondary topics, 10 keywords, and a
 * 200/100-char cap per label are all generous for a short topic/keyword
 * phrase while rejecting anything that looks like injected free text.
 */
export const ClassificationResultSchema = z.object({
  primary_topic: z.string().trim().min(1).max(200),
  secondary_topics: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
  format: z.string().trim().min(1).max(60),
  content_language: z.string().trim().min(2).max(10),
  keywords: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  confidence: z.number().min(0).max(1),
  needs_review: z.boolean(),
});

/**
 * Normalization proposal shape (task-local, see `./types`'
 * `TopicNormalizationProposal` doc comment). `max(200)` on `proposals`
 * bounds a single batch call the same way `MAX_CANDIDATES_PER_NORMALIZATION_RUN`
 * bounds the request side (see `gemini-provider.ts`).
 */
export const TopicNormalizationProposalSchema = z.object({
  topic_id: z.string().trim().min(1),
  action: z.enum(["merge", "promote", "keep"]),
  merge_into_topic_id: z.string().trim().min(1).nullable().default(null),
  canonical_name: z.string().trim().min(1).max(200).nullable().default(null),
  description: z.string().trim().max(2000).nullable().default(null),
  reason: z.string().trim().min(1).max(500),
});

export const NormalizeTopicsResultSchema = z.object({
  proposals: z.array(TopicNormalizationProposalSchema).max(200).default([]),
});
