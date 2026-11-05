import { describe, expect, it } from "vitest";
import { packageMarker } from "./index";

describe("schedulers scaffold", () => {
  it("identifies the module", () => {
    expect(packageMarker()).toBe("@yvi/worker/schedulers");
  });
});
