import type { ReliabilityMetrics } from "../../database.js";
import { calculateEssentialPaymentsConsistencyPoints } from "./essential-payments-consistency.js";
import { calculateIncomeCoveragePoints } from "./income-coverage.js";
import { calculateIncomeRegularityPoints } from "./income-regularity.js";
import { calculateResiliencePoints, type ResilienceMetrics } from "./resilience.js";

/**
 * Calculates the final 0–100 reliability score.
 *
 * score = income regularity + income coverage
 *   + essential payments consistency + resilience
 * final score = clamp(score, 0, 100)
 */
export function calculateReliabilityScore(metrics: Pick<ReliabilityMetrics, "incomeMonthCount" | "totalIncomeCents" | "totalEssentialExpensesCents" | "essentialCategoryMonthCount" | "essentialCategoryCount"> & ResilienceMetrics): number {
    const score = calculateIncomeRegularityPoints(metrics) + calculateIncomeCoveragePoints(metrics) + calculateEssentialPaymentsConsistencyPoints(metrics) + calculateResiliencePoints(metrics);

    return Math.min(Math.max(score, 0), 100);
}
