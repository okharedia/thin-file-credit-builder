/**
 * Calculates the 0 to −10 negative-balance adjustment.
 *
 * points = −min(negative balance day count, 10)
 *
 * Each negative account-day deducts one point. The deduction is capped at
 * ten points so this signal cannot outweigh the positive scoring components.
 */
export function calculateNegativeBalancePoints({ negativeBalanceDayCount }: { negativeBalanceDayCount: number }): number {
        return negativeBalanceDayCount === 0 ? 0 : -Math.min(negativeBalanceDayCount, 10);
}
