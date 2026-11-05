import { describe, expect, it } from "vitest";
import { packageMarker } from "./index";

describe("packageMarker", () => {
  it("identifies this package", () => {
    expect(packageMarker()).toBe("@yvi/db");
  });
});
