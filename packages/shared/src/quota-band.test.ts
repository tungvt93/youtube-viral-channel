import { describe, expect, it } from "vitest";
import { quotaBand } from "./quota-band";

describe("quotaBand", () => {
  it.each([
    [0, "ok"],
    [69, "ok"],
    [70, "warn"],
    [84, "warn"],
    [85, "high"],
    [94, "high"],
    [95, "critical"],
    [100, "critical"],
  ])("bands %i%% usage as %s", (percent, band) => {
    expect(quotaBand(percent)).toBe(band);
  });
});
