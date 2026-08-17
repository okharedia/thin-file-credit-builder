import type { ReliabilityMetrics } from "../../database.js";

/**
 * Calculates the 0–25 essential payments consistency points.
 *
 * essential_payments_consistency =
 *   (# essential category-months present) / (scoring window month count × # essential_categories)
 *
 * A "category-month" is present if at least one transaction with that
 * essential category exists in that month.
 */
export function calculateEssentialPaymentsConsistencyPoints(
        {
                essentialCategoryMonthCount,
                essentialCategoryCount,
                scoringWindowMonthCount,
        }: Pick<ReliabilityMetrics, "essentialCategoryMonthCount" | "essentialCategoryCount"> & { scoringWindowMonthCount: number },
)
{
        if (essentialCategoryCount === 0)
        {
                return 0;
        }

        return Math.round((essentialCategoryMonthCount / (scoringWindowMonthCount * essentialCategoryCount)) * 25);
}
