import type { ReliabilityMetrics } from "../../database.js";
import { requirePositiveScoringWindowMonthCount } from "./require-positive-scoring-window-month-count.js";

/**
 * Calculates the 0–25 savings behavior points.
 *
 * savings behavior = savings month count / scoring window month count
 * points = round(savings behavior × 25)
 *
 * A month counts once when it contains at least one positive savings
 * transaction, regardless of the number or value of those transactions.
 */
export function calculateSavingsBehaviorPoints({
  savingsMonthCount,
  scoringWindowMonthCount,
}: Pick<ReliabilityMetrics, "savingsMonthCount"> & {
  scoringWindowMonthCount: number;
}): number {
  requirePositiveScoringWindowMonthCount(scoringWindowMonthCount);

  if (
    !Number.isSafeInteger(savingsMonthCount)
    || savingsMonthCount < 0
    || savingsMonthCount > scoringWindowMonthCount
  ) {
    throw new RangeError(
      "savingsMonthCount must be between zero and scoringWindowMonthCount",
    );
  }

  const savingsBehavior = savingsMonthCount / scoringWindowMonthCount;

  return Math.round(savingsBehavior * 25);
}
