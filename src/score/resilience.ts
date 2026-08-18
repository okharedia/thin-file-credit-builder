import type { ReliabilityMetrics } from "../database.js";

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
 * Negative-balance days and late-fee events are capped so a long overdraft
 * streak or a burst of fees cannot dominate this component. With no spending,
 * there is no high-risk proportion and the adjustment is zero.
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
)
{
        const savingsBehaviorPoints = Math.round((savingsMonthCount / scoringWindowMonthCount) * 25);

        const negativeBalancePoints = -Math.min(negativeBalanceDayCount, 10);

        const lateFeePoints = -Math.min(lateFeeEventCount, 5);

        const highRiskSpendingPoints = totalSpendingDebitCents > 0 ? -Math.round((totalHighRiskDebitCents / totalSpendingDebitCents) * 5) : 0;

        //
        // final score
        return savingsBehaviorPoints + negativeBalancePoints + lateFeePoints + highRiskSpendingPoints;
}
