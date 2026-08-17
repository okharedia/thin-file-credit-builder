import type { ReliabilityMetrics } from "../../database.js";
import { calculateHighRiskSpendingPoints } from "./high-risk-spending.js";
import { calculateLateFeePoints } from "./late-fee.js";
import { calculateNegativeBalancePoints } from "./negative-balance.js";
import { calculateSavingsBehaviorPoints } from "./savings-behavior.js";

export type ResilienceMetrics = Pick<ReliabilityMetrics, "savingsMonthCount" | "lateFeeEventCount" | "totalHighRiskDebitCents" | "totalSpendingDebitCents"> & {
        scoringWindowMonthCount: number;
        negativeBalanceDayCount: number;
};

/**
 * Calculates the −20 to +25 resilience points.
 *
 * negative balance day count = sum of each checking account's negative days
 * resilience points = savings + negative balance + late fees + high risk
 */
export function calculateResiliencePoints(metrics: ResilienceMetrics): number {
        return calculateSavingsBehaviorPoints(metrics) + calculateNegativeBalancePoints(metrics) + calculateLateFeePoints(metrics) + calculateHighRiskSpendingPoints(metrics);
}
