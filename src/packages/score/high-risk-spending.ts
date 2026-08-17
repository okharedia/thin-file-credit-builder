import type { ReliabilityMetrics } from "../../database.js";

/**
 * Calculates the 0 to −5 high-risk spending adjustment.
 *
 * high-risk spending ratio = high-risk debit total / spending debit total
 * points = −round(high-risk spending ratio × 5)
 *
 * With no spending, there is no high-risk proportion and the adjustment is
 * zero. The high-risk total is a subset of the spending total.
 */
export function calculateHighRiskSpendingPoints({ totalHighRiskDebitCents, totalSpendingDebitCents }: Pick<ReliabilityMetrics, "totalHighRiskDebitCents" | "totalSpendingDebitCents">): number {
        if (totalSpendingDebitCents === 0) {
                return 0;
        }

        const highRiskSpendingRatio = totalHighRiskDebitCents / totalSpendingDebitCents;
        const penalty = Math.round(highRiskSpendingRatio * 5);

        return penalty === 0 ? 0 : -penalty;
}
