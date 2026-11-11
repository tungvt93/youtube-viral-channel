import { describe, expect, it } from "vitest";
import LoginPage from "./page";

describe("LoginPage", () => {
  it("exports a page component", () => {
    expect(typeof LoginPage).toBe("function");
  });

  it("renders without throwing", () => {
    expect(() => LoginPage()).not.toThrow();
  });
});
