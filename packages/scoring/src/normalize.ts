/**
 * PRD §8.2 normalization. Metrics have heavily skewed distributions, so the
 * Viral Score composes percentile ranks within a comparison cohort rather
 * than raw values.
 */

/** PRD §8.2 example: `log(1 + value)`, used before ranking view-count-derived metrics that can't go negative in a meaningful way. */
export function logTransform(value: number): number {
  return Math.log(1 + Math.max(value, 0));
}

/**
 * Fraction of `cohortValues` that `value` outranks, 0–1, with ties split
 * evenly (the standard "mean rank" percentile). `cohortValues` is expected
 * to include `value` itself (self-inclusive ranking) — an empty cohort
 * returns 0 rather than throwing, since that can only happen if the caller
 * passes an empty array by mistake.
 */
export function percentileRank(value: number, cohortValues: number[]): number {
  const n = cohortValues.length;
  if (n === 0) {
    return 0;
  }
  let countBelow = 0;
  let countEqual = 0;
  for (const v of cohortValues) {
    if (v < value) countBelow += 1;
    else if (v === value) countEqual += 1;
  }
  return (countBelow + 0.5 * countEqual) / n;
}

/**
 * Value at the given percentile (nearest-rank method) within an already
 * ascending-sorted array — used for PRD §8.4's "VPH > market/topic p90"
 * threshold.
 */
export function percentileValue(sortedAscendingValues: number[], p: number): number {
  const n = sortedAscendingValues.length;
  if (n === 0) {
    throw new Error("percentileValue() requires at least one value");
  }
  const index = Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1));
  return sortedAscendingValues[index];
}

/** PRD §8.4's age cutoff and §8.2's "age bucket" grouping dimension, in one fixed table (see plan Decisions re: no market/topic cohort yet). */
export function ageBucketLabel(ageDays: number): string {
  if (ageDays < 1) return "<1d";
  if (ageDays < 3) return "1-3d";
  if (ageDays < 7) return "3-7d";
  if (ageDays < 14) return "7-14d";
  return "14d+";
}
