import { startOfMonth, subMonths } from "date-fns";

type ScoringWindow = {
        startDate: Date;
        endDate: Date;
};

/**
 * Returns the inclusive scoring window of `monthCount` calendar months
 * ending on `from`.
 *
 * `from=2026-02-20` and `monthCount=6` → `2025-09-01` to `2026-02-20`.
 */
export function getScoringWindow(from: Date, monthCount: number): ScoringWindow
{
        return {
                startDate: startOfMonth(subMonths(from, monthCount - 1)),
                endDate: from,
        };
}
