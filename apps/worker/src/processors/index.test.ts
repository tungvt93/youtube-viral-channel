import { describe, expect, it } from "vitest";
import { packageMarker } from "./index";

describe("processors scaffold", () => {
  it("identifies the module", () => {
    expect(packageMarker()).toBe("@yvi/worker/processors");
  });
});
