import { describe, expect, it } from "vitest";
import { computeNicheBreakoutSignal } from "./niche-breakout";

describe("computeNicheBreakoutSignal", () => {
  it("flags a breakout when subs are in the niche range and VSR clears the threshold", () => {
    expect(computeNicheBreakoutSignal(30_000, 10_000)).toEqual({ isBreakout: true, vsr: 3 });
  });

  it("does not flag when VSR is below the threshold", () => {
    expect(computeNicheBreakoutSignal(20_000, 10_000)).toEqual({ isBreakout: false, vsr: 2 });
  });

  it("does not flag a channel below the niche subscriber floor, even at a huge VSR", () => {
    const signal = computeNicheBreakoutSignal(100_000, 500);
    expect(signal.isBreakout).toBe(false);
    expect(signal.vsr).toBe(200);
  });

  it("does not flag a channel above the niche subscriber ceiling, even at a huge VSR", () => {
    const signal = computeNicheBreakoutSignal(1_000_000, 100_000);
    expect(signal.isBreakout).toBe(false);
    expect(signal.vsr).toBe(10);
  });

  it("reports no VSR when the subscriber count is unavailable", () => {
    expect(computeNicheBreakoutSignal(30_000, null)).toEqual({ isBreakout: false, vsr: null });
  });

  it("reports no VSR when the subscriber count is zero", () => {
    expect(computeNicheBreakoutSignal(30_000, 0)).toEqual({ isBreakout: false, vsr: null });
  });

  it("honors custom thresholds", () => {
    expect(computeNicheBreakoutSignal(5_000, 4_000, { minSubs: 100, maxSubs: 5_000, vsrThreshold: 1 })).toEqual({
      isBreakout: true,
      vsr: 1.25,
    });
  });

  it("is inclusive at the exact niche subscriber bounds", () => {
    expect(computeNicheBreakoutSignal(3_000, 1_000).isBreakout).toBe(true);
    expect(computeNicheBreakoutSignal(150_000, 50_000).isBreakout).toBe(true);
  });
});
