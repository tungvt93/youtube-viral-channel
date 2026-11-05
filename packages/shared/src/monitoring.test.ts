import { describe, expect, it } from "vitest";
import { computeNextSnapshotDueAt, nextMonitoringState, type MonitoringState } from "./monitoring";

const NOW = new Date("2026-11-05T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / HOUR_MS;
}

describe("computeNextSnapshotDueAt", () => {
  it("uses the 6h candidate cadence for a brand-new candidate video", () => {
    const due = computeNextSnapshotDueAt("candidate", new Date("2026-11-05T11:00:00Z"), NOW);
    expect(hoursBetween(NOW, due)).toBe(6);
  });

  it("uses the 6h cadence for a monitoring video under 3 days old", () => {
    const due = computeNextSnapshotDueAt("monitoring", new Date("2026-11-04T00:00:00Z"), NOW);
    expect(hoursBetween(NOW, due)).toBe(6);
  });

  it("uses the 12h cadence for a video 3-7 days old", () => {
    const due = computeNextSnapshotDueAt("monitoring", new Date("2026-11-01T00:00:00Z"), NOW);
    expect(hoursBetween(NOW, due)).toBe(12);
  });

  it("uses the 24h cadence for a video over 7 days old", () => {
    const due = computeNextSnapshotDueAt("monitoring", new Date("2026-10-20T00:00:00Z"), NOW);
    expect(hoursBetween(NOW, due)).toBe(24);
  });

  it("uses the 3h midpoint cadence for high_signal", () => {
    const due = computeNextSnapshotDueAt("high_signal", new Date("2026-11-01T00:00:00Z"), NOW);
    expect(hoursBetween(NOW, due)).toBe(3);
  });

  it("uses a reduced 48h cadence for cooling", () => {
    const due = computeNextSnapshotDueAt("cooling", new Date("2026-11-01T00:00:00Z"), NOW);
    expect(hoursBetween(NOW, due)).toBe(48);
  });

  it("uses a reduced 48h cadence for archived", () => {
    const due = computeNextSnapshotDueAt("archived", new Date("2026-11-01T00:00:00Z"), NOW);
    expect(hoursBetween(NOW, due)).toBe(48);
  });

  it("uses a 24h cadence for unavailable", () => {
    const due = computeNextSnapshotDueAt("unavailable", new Date("2026-11-01T00:00:00Z"), NOW);
    expect(hoursBetween(NOW, due)).toBe(24);
  });
});

describe("nextMonitoringState", () => {
  const states: MonitoringState[] = ["candidate", "monitoring", "high_signal", "cooling", "archived", "unavailable"];

  it("transitions candidate to monitoring on first success", () => {
    expect(nextMonitoringState("candidate", "success")).toBe("monitoring");
  });

  it.each(states.filter((s) => s !== "candidate"))("leaves %s unchanged on success", (state) => {
    expect(nextMonitoringState(state, "success")).toBe(state);
  });

  it.each(states)("transitions %s to unavailable when the API no longer returns the video", (state) => {
    expect(nextMonitoringState(state, "not_found")).toBe("unavailable");
  });
});
