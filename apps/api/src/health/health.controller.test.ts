import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("reports ok status for the api service", () => {
    const result = new HealthController().check();
    expect(result.status).toBe("ok");
    expect(result.service).toBe("api");
  });
});
