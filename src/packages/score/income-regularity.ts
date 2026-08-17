import type { ReliabilityMetrics } from "../../database.js";

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
        const incomeRegularity = incomeMonthCount / scoringWindowMonthCount;

        return Math.round(incomeRegularity * 25);
}
