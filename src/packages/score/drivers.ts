import type { ReliabilityMetrics } from "../../database.js";
import { ratio } from "../utils/ratio.js";

export function buildDrivers(metrics: ReliabilityMetrics, negativeBalanceDayCount: number, scoringWindowMonthCount: number): string[]
{
        const highRiskSpendingRatio = ratio(metrics.totalHighRiskDebitCents, metrics.totalSpendingDebitCents);

        const incomeCoverageRatio = ratio(metrics.totalIncomeCents, metrics.totalEssentialExpensesCents);

        const drivers = [`Income present in ${metrics.incomeMonthCount}/${scoringWindowMonthCount} months`, `Income covers essential expenses (${incomeCoverageRatio.toFixed(2)}x)`, `Savings activity in ${metrics.savingsMonthCount}/${scoringWindowMonthCount} months`];

        if (negativeBalanceDayCount > 0)
        {
                drivers.push(`${negativeBalanceDayCount} negative balance account-days`);
        }

        if (metrics.lateFeeEventCount > 0)
        {
                drivers.push(`${metrics.lateFeeEventCount} late fee event(s)`);
        }

        if (metrics.totalHighRiskDebitCents > 0)
        {
                drivers.push(`High-risk spending was ${Math.round(highRiskSpendingRatio * 100)}% of spending`);
        }

        return drivers;
}
