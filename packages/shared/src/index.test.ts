import { describe, expect, it } from "vitest";
import { packageMarker } from "./index";

describe("packageMarker", () => {
  it("identifies the package", () => {
    expect(packageMarker()).toBe("@yvi/shared");
  });
});
