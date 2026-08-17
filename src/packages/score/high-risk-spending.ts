import type { ReliabilityMetrics } from "../../database.js";

/**
 * Calculates the 0 to −5 high-risk spending adjustment.
 *
 * high-risk spending ratio = high-risk debit total / spending debit total
 * points = −round(high-risk spending ratio × 5)
 *
 * With no spending, there is no high-risk proportion and the adjustment is
 * zero. The high-risk total must be a subset of the spending total.
 */
export function calculateHighRiskSpendingPoints({
  totalHighRiskDebitCents,
  totalSpendingDebitCents,
}: Pick<
  ReliabilityMetrics,
  "totalHighRiskDebitCents" | "totalSpendingDebitCents"
>): number {
  if (
    !Number.isSafeInteger(totalHighRiskDebitCents)
    || totalHighRiskDebitCents < 0
    || !Number.isSafeInteger(totalSpendingDebitCents)
    || totalSpendingDebitCents < 0
  ) {
    throw new RangeError(
      "high-risk and spending totals must be non-negative integers",
    );
  }

  if (totalHighRiskDebitCents > totalSpendingDebitCents) {
    throw new RangeError(
      "totalHighRiskDebitCents cannot exceed totalSpendingDebitCents",
    );
  }

  if (totalSpendingDebitCents === 0) {
    return 0;
  }

  const highRiskSpendingRatio =
    totalHighRiskDebitCents / totalSpendingDebitCents;
  const penalty = Math.round(highRiskSpendingRatio * 5);

  return penalty === 0 ? 0 : -penalty;
}
