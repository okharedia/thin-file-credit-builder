import type { ReliabilityMetrics } from "../../database.js";

export type ResilienceMetrics = Pick<ReliabilityMetrics, "savingsMonthCount" | "lateFeeEventCount" | "totalHighRiskDebitCents" | "totalSpendingDebitCents"> & {
        scoringWindowMonthCount: number;
        negativeBalanceDayCount: number;
};

/**
 * Calculates the −20 to +25 resilience points.
 *
 * savings points = round((savings month count / scoring window month count) × 25)
 * negative balance points = −min(negative balance day count, 10)
 * late fee points = −min(late fee event count, 5)
 * high-risk points = −round((high-risk debit total / spending debit total) × 5)
 *
 * A month counts once when it contains at least one positive savings
 * transaction, regardless of the number or value of those transactions.
 * negative balance day count = sum of each checking account's negative days
 * With no spending, there is no high-risk proportion and the adjustment is zero.
 */
export function calculateResiliencePoints(
        {
                savingsMonthCount,
                scoringWindowMonthCount,
                negativeBalanceDayCount,
                lateFeeEventCount,
                totalHighRiskDebitCents,
                totalSpendingDebitCents,
        }: ResilienceMetrics,
): number
{
        const savingsBehaviorPoints = Math.round((savingsMonthCount / scoringWindowMonthCount) * 25);
        const negativeBalancePoints = negativeBalanceDayCount === 0 ? 0 : -Math.min(negativeBalanceDayCount, 10);
        const lateFeePoints = lateFeeEventCount === 0 ? 0 : -Math.min(lateFeeEventCount, 5);
        const highRiskPenalty = totalSpendingDebitCents === 0 ? 0 : Math.round((totalHighRiskDebitCents / totalSpendingDebitCents) * 5);
        const highRiskSpendingPoints = highRiskPenalty === 0 ? 0 : -highRiskPenalty;

        return savingsBehaviorPoints + negativeBalancePoints + lateFeePoints + highRiskSpendingPoints;
}
