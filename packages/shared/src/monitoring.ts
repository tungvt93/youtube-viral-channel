/** PRD §7.2 monitoring states. Phase 2 only ever sets candidate/monitoring/unavailable (see plan Scope); high_signal/cooling/archived are unreachable until Phase 3 computes the growth signal that would set them. */
export type MonitoringState = "candidate" | "monitoring" | "high_signal" | "cooling" | "archived" | "unavailable";

export type SnapshotOutcome = "success" | "not_found";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * PRD §7.3 frequency table (video age/state → next due interval):
 *   - Candidate mới, tín hiệu cao (new candidate, high signal): 2-4h
 *   - Candidate thông thường: 6h
 *   - Video 3-7 ngày: 12h
 *   - Video trên 7 ngày: 24h
 *   - Cooling/archived: giảm tần suất hoặc dừng
 * The "high signal" row depends on a signal priority Phase 2 doesn't compute
 * (that's Phase 3 scoring), so `candidate`/`monitoring` both fall through to
 * the age-based rows below it. `high_signal` uses the midpoint (3h) of its
 * row for when a later phase starts setting that state.
 */
export function computeNextSnapshotDueAt(state: MonitoringState, publishedAt: Date, now: Date): Date {
  const ageMs = now.getTime() - publishedAt.getTime();
  return new Date(now.getTime() + intervalHoursFor(state, ageMs) * HOUR_MS);
}

function intervalHoursFor(state: MonitoringState, ageMs: number): number {
  switch (state) {
    case "unavailable":
      return 24;
    case "cooling":
    case "archived":
      return 48;
    case "high_signal":
      return 3;
    case "candidate":
    case "monitoring":
    default:
      if (ageMs < 3 * DAY_MS) return 6;
      if (ageMs < 7 * DAY_MS) return 12;
      return 24;
  }
}

/**
 * PRD §7.2's only two state transitions that don't depend on a growth signal:
 * `candidate` → `monitoring` on a video's first successful snapshot, and any
 * state → `unavailable` once the API stops returning the video. Every other
 * state is left unchanged on success — `unavailable` is terminal for Phase 2
 * (recovery, were the video to reappear, is out of scope; see plan Scope).
 */
export function nextMonitoringState(current: MonitoringState, outcome: SnapshotOutcome): MonitoringState {
  if (outcome === "not_found") {
    return "unavailable";
  }
  if (current === "candidate") {
    return "monitoring";
  }
  return current;
}
