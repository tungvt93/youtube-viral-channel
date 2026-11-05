import { describe, expect, it } from "vitest";
import { classifyFormat } from "./shorts-detection";

const base = { title: "A normal video", description: "nothing special" };

describe("classifyFormat", () => {
  it("classifies duration over 3 minutes as long, regardless of other signals", () => {
    const result = classifyFormat({ ...base, durationSeconds: 181, embedWidth: 100, embedHeight: 200 });
    expect(result).toMatchObject({ classification: "long", reason: "duration_over_3_min" });
  });

  it("classifies a portrait embed under 3 minutes as a short candidate", () => {
    const result = classifyFormat({ ...base, durationSeconds: 90, embedWidth: 100, embedHeight: 178 });
    expect(result).toMatchObject({ classification: "short_candidate", reason: "player_aspect_portrait" });
  });

  it("classifies a landscape embed under 3 minutes as long", () => {
    const result = classifyFormat({ ...base, durationSeconds: 90, embedWidth: 320, embedHeight: 180 });
    expect(result).toMatchObject({ classification: "long", reason: "player_aspect_landscape" });
  });

  it("falls back to the #shorts tag when the embed shape is unavailable", () => {
    const result = classifyFormat({
      title: "Watch this #shorts",
      description: "",
      durationSeconds: 90,
      embedWidth: null,
      embedHeight: null,
    });
    expect(result).toMatchObject({ classification: "short_candidate", reason: "shorts_tag" });
  });

  it("falls back to the legacy ≤60s rule when no embed shape or tag is available", () => {
    const result = classifyFormat({ ...base, durationSeconds: 45, embedWidth: null, embedHeight: null });
    expect(result).toMatchObject({ classification: "short_candidate", reason: "legacy_duration_le_60s" });
  });

  it("returns unknown when duration is between 60s and 3min with no embed or tag signal", () => {
    const result = classifyFormat({ ...base, durationSeconds: 120, embedWidth: null, embedHeight: null });
    expect(result).toMatchObject({ classification: "unknown", reason: "no_signal_available" });
  });

  it("falls back to the #shorts tag when duration is entirely missing", () => {
    const result = classifyFormat({ title: "clip #shorts", description: "", durationSeconds: null });
    expect(result).toMatchObject({ classification: "short_candidate", reason: "shorts_tag" });
  });

  it("returns unknown when duration and all other signals are missing", () => {
    const result = classifyFormat({ ...base, durationSeconds: null });
    expect(result).toMatchObject({ classification: "unknown", reason: "no_signal_available" });
  });

  it("treats a zero-area embed as unavailable and falls through", () => {
    const result = classifyFormat({ ...base, durationSeconds: 45, embedWidth: 0, embedHeight: 0 });
    expect(result).toMatchObject({ classification: "short_candidate", reason: "legacy_duration_le_60s" });
  });
});
