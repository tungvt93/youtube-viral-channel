import { beforeEach, describe, expect, it, vi } from "vitest";
import { notFound } from "next/navigation";
import { ApiError, fetchApi } from "./api";
import { fetchApiOr404 } from "./fetch-or-404";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("./api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  fetchApi: vi.fn(),
}));

describe("fetchApiOr404", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the result on success", async () => {
    vi.mocked(fetchApi).mockResolvedValue({ id: "c1" });

    const result = await fetchApiOr404("/channels/c1");

    expect(result).toEqual({ id: "c1" });
  });

  it("calls notFound() on a 404 ApiError", async () => {
    vi.mocked(fetchApi).mockRejectedValue(new ApiError(404, "not found"));

    await expect(fetchApiOr404("/channels/missing")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
  });

  it("rethrows a non-404 ApiError instead of calling notFound()", async () => {
    vi.mocked(fetchApi).mockRejectedValue(new ApiError(500, "server error"));

    await expect(fetchApiOr404("/channels/c1")).rejects.toThrow("server error");

    expect(notFound).not.toHaveBeenCalled();
  });
});
