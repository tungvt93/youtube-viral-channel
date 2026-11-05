export function packageMarker(): string {
  return "@yvi/worker/processors";
}

export type { ProcessorDeps } from "./deps";
export { checkQuotaGuard } from "./quota";
export { createDiscoveryRegionalProcessor } from "./discovery-regional";
export { createDiscoverySearchProcessor } from "./discovery-search";
export { createVideoEnrichmentProcessor } from "./video-enrichment";
export { createChannelEnrichmentProcessor } from "./channel-enrichment";
export { createVideoMonitoringProcessor } from "./video-monitoring";
export { createVideoScoringProcessor } from "./video-scoring";
