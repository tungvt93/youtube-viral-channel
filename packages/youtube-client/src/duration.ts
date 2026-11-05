const ISO_8601_DURATION = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;

/**
 * Parses a YouTube `contentDetails.duration` value (ISO 8601, e.g. "PT1M3S")
 * into whole seconds. Returns null for unparseable input rather than
 * guessing, since callers (Shorts heuristic) must distinguish "no signal"
 * from "zero seconds".
 */
export function parseIso8601DurationToSeconds(duration: string): number | null {
  const match = ISO_8601_DURATION.exec(duration.trim());
  if (!match) {
    return null;
  }
  const [, hours, minutes, seconds] = match;
  if (!hours && !minutes && !seconds) {
    return null;
  }
  return Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}
