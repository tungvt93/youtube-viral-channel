import { describe, expect, it, vi } from "vitest";

const { listEnabledDiscoveryQueriesWithMarket } = vi.hoisted(() => ({
  listEnabledDiscoveryQueriesWithMarket: vi.fn(),
}));
vi.mock("@yvi/db", () => ({ listEnabledDiscoveryQueriesWithMarket }));

import { packageMarker, registerDiscoverySchedulers } from "./index";

describe("schedulers scaffold", () => {
  it("identifies the module", () => {
    expect(packageMarker()).toBe("@yvi/worker/schedulers");
  });
});

describe("registerDiscoverySchedulers", () => {
  it("routes most_popular queries to discovery-regional and others to discovery-search, keyed by query id", async () => {
    listEnabledDiscoveryQueriesWithMarket.mockResolvedValue([
      { id: "dq-1", strategy: "most_popular", frequencyMinutes: 60 },
      { id: "dq-2", strategy: "recent_search", frequencyMinutes: 15 },
    ]);
    const discoveryRegional = { upsertJobScheduler: vi.fn().mockResolvedValue(undefined) };
    const discoverySearch = { upsertJobScheduler: vi.fn().mockResolvedValue(undefined) };
    const queues = { discoveryRegional, discoverySearch, videoEnrichment: {}, channelEnrichment: {} };

    const count = await registerDiscoverySchedulers({} as never, queues as never);

    expect(count).toBe(2);
    expect(discoveryRegional.upsertJobScheduler).toHaveBeenCalledWith(
      "dq-1",
      { every: 60 * 60 * 1000 },
      expect.objectContaining({ data: { discoveryQueryId: "dq-1" } }),
    );
    expect(discoverySearch.upsertJobScheduler).toHaveBeenCalledWith(
      "dq-2",
      { every: 15 * 60 * 1000 },
      expect.objectContaining({ data: { discoveryQueryId: "dq-2" } }),
    );
  });
});
