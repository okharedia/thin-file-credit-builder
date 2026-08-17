export function requirePositiveScoringWindowMonthCount(scoringWindowMonthCount: number): void {
    if (!Number.isSafeInteger(scoringWindowMonthCount) || scoringWindowMonthCount < 1) {
        throw new RangeError("scoringWindowMonthCount must be a positive integer");
    }
}
