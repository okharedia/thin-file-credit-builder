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
export function getScoringWindow(
  from: string,
  monthCount: number,
): ScoringWindow {
  if (!Number.isSafeInteger(monthCount) || monthCount < 1) {
    throw new RangeError("monthCount must be a positive integer");
  }

  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7));
  const startMonthIndex = year * 12 + (month - 1) - (monthCount - 1);
  const startYear = Math.floor(startMonthIndex / 12);
  const startMonth = ((startMonthIndex % 12) + 12) % 12 + 1;

  return {
    startDate: `${String(startYear).padStart(4, "0")}-${String(startMonth).padStart(2, "0")}-01`,
    endDate: from,
  };
}
