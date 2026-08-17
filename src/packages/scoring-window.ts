import { formatISO, parseISO, startOfMonth, subMonths } from "date-fns";

type ScoringWindow = {
    startDate: string;
    endDate: string;
};

/**
 * Returns the inclusive scoring window of `monthCount` calendar months
 * ending on `from`.
 *
 * `from=2026-02-20` and `monthCount=6` → `2025-09-01` to `2026-02-20`.
 */
export function getScoringWindow(from: string, monthCount: number): ScoringWindow {
    if (!Number.isSafeInteger(monthCount) || monthCount < 1) {
        throw new RangeError("monthCount must be a positive integer");
    }

    const start = startOfMonth(subMonths(parseISO(from), monthCount - 1));

    return {
        startDate: formatISO(start, { representation: "date" }),
        endDate: from,
    };
}
