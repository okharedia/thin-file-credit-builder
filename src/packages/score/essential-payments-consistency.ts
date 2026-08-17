import type { ReliabilityMetrics } from "../../database.js";
import { requirePositiveScoringWindowMonthCount } from "./require-positive-scoring-window-month-count.js";

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
export function calculateEssentialPaymentsConsistencyPoints({
    essentialCategoryMonthCount,
    essentialCategoryCount,
    scoringWindowMonthCount,
}: Pick<ReliabilityMetrics, "essentialCategoryMonthCount" | "essentialCategoryCount"> & {
    scoringWindowMonthCount: number;
}): number {
    requirePositiveScoringWindowMonthCount(scoringWindowMonthCount);

    if (!Number.isSafeInteger(essentialCategoryCount) || essentialCategoryCount < 0) {
        throw new RangeError("essentialCategoryCount must be a non-negative integer");
    }

    const possibleCategoryMonthCount = scoringWindowMonthCount * essentialCategoryCount;

    if (!Number.isSafeInteger(essentialCategoryMonthCount) || essentialCategoryMonthCount < 0 || essentialCategoryMonthCount > possibleCategoryMonthCount) {
        throw new RangeError("essentialCategoryMonthCount must be between zero and the possible category-month count");
    }

    if (possibleCategoryMonthCount === 0) {
        return 0;
    }

    const essentialPaymentsConsistency = essentialCategoryMonthCount / possibleCategoryMonthCount;

    return Math.round(essentialPaymentsConsistency * 25);
}
