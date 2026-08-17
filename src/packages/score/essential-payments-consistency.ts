import type { ReliabilityMetrics } from "../../database.js";

/**
 * Calculates the 0–25 essential payments consistency points.
 *
 * possible category-months = scoring window month count × essential category count
 * consistency = essential category-month count / possible category-months
 * points = round(consistency × 25)
 *
 * An essential category-month is present when at least one transaction for
 * that category exists in that month. No configured essential categories
 * earns zero points because there is no consistency evidence to score.
 */
export function calculateEssentialPaymentsConsistencyPoints(
        {
                essentialCategoryMonthCount,
                essentialCategoryCount,
                scoringWindowMonthCount,
        }: Pick<ReliabilityMetrics, "essentialCategoryMonthCount" | "essentialCategoryCount"> & {
                scoringWindowMonthCount: number;
        },
): number
{
        if (scoringWindowMonthCount === 0 || essentialCategoryCount === 0)
        {
                return 0;
        }

        return Math.round((essentialCategoryMonthCount / (scoringWindowMonthCount * essentialCategoryCount)) * 25);
}
