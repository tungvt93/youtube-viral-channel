import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("exports a page component", () => {
    expect(typeof HomePage).toBe("function");
  });
});
