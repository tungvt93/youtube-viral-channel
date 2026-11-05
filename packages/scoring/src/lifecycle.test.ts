import { describe, expect, it } from "vitest";
import { meetsViralCandidateThreshold, nextScoreDrivenState } from "./lifecycle";

describe("meetsViralCandidateThreshold", () => {
  const base = { vph: 100, vphP90: 50, outlierMultiplier: 5, validSnapshotCount: 2, ageDays: 3 };

  it("passes when all four PRD §8.4 conditions hold", () => {
    expect(meetsViralCandidateThreshold(base)).toBe(true);
  });

  it("fails when VPH does not beat the cohort p90", () => {
    expect(meetsViralCandidateThreshold({ ...base, vph: 10 })).toBe(false);
  });

  it("fails when the outlier multiplier is below 3", () => {
    expect(meetsViralCandidateThreshold({ ...base, outlierMultiplier: 2 })).toBe(false);
  });

  it("fails when the outlier multiplier is unavailable", () => {
    expect(meetsViralCandidateThreshold({ ...base, outlierMultiplier: null })).toBe(false);
  });

  it("fails when there are fewer than 2 valid snapshots", () => {
    expect(meetsViralCandidateThreshold({ ...base, validSnapshotCount: 1 })).toBe(false);
  });

  it("fails once the video is 14 days old or older", () => {
    expect(meetsViralCandidateThreshold({ ...base, ageDays: 14 })).toBe(false);
  });
});

describe("nextScoreDrivenState", () => {
  it("promotes monitoring to high_signal when the threshold is met", () => {
    expect(nextScoreDrivenState("monitoring", { meetsHighSignalThreshold: true, isDeclining: false })).toBe("high_signal");
  });

  it("keeps monitoring unchanged when the threshold is not met", () => {
    expect(nextScoreDrivenState("monitoring", { meetsHighSignalThreshold: false, isDeclining: false })).toBe("monitoring");
  });

  it("demotes high_signal to cooling on a declining VPH once it no longer meets the threshold", () => {
    expect(nextScoreDrivenState("high_signal", { meetsHighSignalThreshold: false, isDeclining: true })).toBe("cooling");
  });

  it("keeps high_signal when it still meets the threshold even if declining", () => {
    expect(nextScoreDrivenState("high_signal", { meetsHighSignalThreshold: true, isDeclining: true })).toBe("high_signal");
  });

  it("promotes cooling back to high_signal once growth resumes", () => {
    expect(nextScoreDrivenState("cooling", { meetsHighSignalThreshold: false, isDeclining: false })).toBe("high_signal");
  });

  it("keeps cooling when still declining", () => {
    expect(nextScoreDrivenState("cooling", { meetsHighSignalThreshold: false, isDeclining: true })).toBe("cooling");
  });

  it("leaves candidate, unavailable, and archived untouched regardless of signal", () => {
    expect(nextScoreDrivenState("candidate", { meetsHighSignalThreshold: true, isDeclining: false })).toBe("candidate");
    expect(nextScoreDrivenState("unavailable", { meetsHighSignalThreshold: true, isDeclining: false })).toBe("unavailable");
    expect(nextScoreDrivenState("archived", { meetsHighSignalThreshold: true, isDeclining: false })).toBe("archived");
  });
});
