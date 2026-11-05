import { describe, expect, it } from "vitest";
import { parseIso8601DurationToSeconds } from "./duration";

describe("parseIso8601DurationToSeconds", () => {
  it("parses hours, minutes, and seconds", () => {
    expect(parseIso8601DurationToSeconds("PT1H2M3S")).toBe(3723);
  });

  it("parses minutes only", () => {
    expect(parseIso8601DurationToSeconds("PT1M3S")).toBe(63);
  });

  it("parses seconds only", () => {
    expect(parseIso8601DurationToSeconds("PT45S")).toBe(45);
  });

  it("parses hours only", () => {
    expect(parseIso8601DurationToSeconds("PT2H")).toBe(7200);
  });

  it("returns null for an empty duration (PT with no components)", () => {
    expect(parseIso8601DurationToSeconds("PT")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(parseIso8601DurationToSeconds("not-a-duration")).toBeNull();
  });
});
