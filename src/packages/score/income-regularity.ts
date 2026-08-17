import type { ReliabilityMetrics } from "../../database.js";

/**
 * Calculates the 0–25 income regularity points.
 */
export function calculateIncomeRegularityPoints(
        {
                incomeMonthCount,
                scoringWindowMonthCount,
        }: Pick<ReliabilityMetrics, "incomeMonthCount"> & { scoringWindowMonthCount: number },
)
{
        return Math.round((incomeMonthCount / scoringWindowMonthCount) * 25);
}
