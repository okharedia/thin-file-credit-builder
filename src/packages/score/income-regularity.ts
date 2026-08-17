import type { ReliabilityMetrics } from "../../database.js";
import { requirePositiveScoringWindowMonthCount } from "./require-positive-scoring-window-month-count.js";

/**
 * Calculates the 0–25 income regularity points.
 *
 * income regularity = income month count / scoring window month count
 * points = round(income regularity × 25)
 */
export function calculateIncomeRegularityPoints({
  incomeMonthCount,
  scoringWindowMonthCount,
}: Pick<ReliabilityMetrics, "incomeMonthCount"> & {
  scoringWindowMonthCount: number;
}): number {
  requirePositiveScoringWindowMonthCount(scoringWindowMonthCount);

  if (
    !Number.isSafeInteger(incomeMonthCount)
    || incomeMonthCount < 0
    || incomeMonthCount > scoringWindowMonthCount
  ) {
    throw new RangeError(
      "incomeMonthCount must be between zero and scoringWindowMonthCount",
    );
  }

  const incomeRegularity = incomeMonthCount / scoringWindowMonthCount;

  return Math.round(incomeRegularity * 25);
}
