/** Matches `videos.format_classification` per PRD §15.3. */
export type FormatClassification = "unknown" | "short_candidate" | "long";

export interface ShortsDetectionInput {
  durationSeconds: number | null;
  title: string;
  description: string;
  /** Parsed from `videos.list?part=player` embedHtml, when available. */
  embedWidth?: number | null;
  embedHeight?: number | null;
}

export interface ShortsDetectionResult {
  classification: FormatClassification;
  confidence: number;
  reason: string;
}

const LONG_FORM_THRESHOLD_SECONDS = 180;
const LEGACY_SHORTS_THRESHOLD_SECONDS = 60;
const SHORTS_TAG_PATTERN = /#shorts/i;

function hasShortsTag(title: string, description: string): boolean {
  return SHORTS_TAG_PATTERN.test(title) || SHORTS_TAG_PATTERN.test(description);
}

function classifyByTagOrLegacyDuration(input: ShortsDetectionInput): ShortsDetectionResult {
  if (hasShortsTag(input.title, input.description)) {
    return { classification: "short_candidate", confidence: 0.5, reason: "shorts_tag" };
  }
  if (input.durationSeconds !== null && input.durationSeconds <= LEGACY_SHORTS_THRESHOLD_SECONDS) {
    return { classification: "short_candidate", confidence: 0.3, reason: "legacy_duration_le_60s" };
  }
  return { classification: "unknown", confidence: 0, reason: "no_signal_available" };
}

/**
 * Shorts detection heuristic per [[0002-no-vendor-outlier-finder]] Follow-Up
 * #1: duration > 3 min is long-form; ≤ 3 min checks the player embed aspect
 * ratio (taller-than-wide => Short); when the embed shape is unavailable,
 * falls back to a `#shorts` tag, then to the legacy ≤60s rule.
 */
export function classifyFormat(input: ShortsDetectionInput): ShortsDetectionResult {
  if (input.durationSeconds === null) {
    return classifyByTagOrLegacyDuration(input);
  }

  if (input.durationSeconds > LONG_FORM_THRESHOLD_SECONDS) {
    return { classification: "long", confidence: 1, reason: "duration_over_3_min" };
  }

  const { embedWidth, embedHeight } = input;
  if (embedWidth != null && embedHeight != null && embedWidth > 0 && embedHeight > 0) {
    if (embedHeight > embedWidth) {
      return { classification: "short_candidate", confidence: 0.9, reason: "player_aspect_portrait" };
    }
    return { classification: "long", confidence: 0.6, reason: "player_aspect_landscape" };
  }

  return classifyByTagOrLegacyDuration(input);
}
