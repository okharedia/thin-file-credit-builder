import type { ReliabilityMetrics } from "../../database.js";

/**
 * Calculates the 0 to −5 late-fee adjustment.
 *
 * points = −min(late fee event count, 5)
 *
 * Each late-fee transaction deducts one point, capped at five points.
 */
export function calculateLateFeePoints({ lateFeeEventCount }: Pick<ReliabilityMetrics, "lateFeeEventCount">): number {
    if (!Number.isSafeInteger(lateFeeEventCount) || lateFeeEventCount < 0) {
        throw new RangeError("lateFeeEventCount must be a non-negative integer");
    }

    if (lateFeeEventCount === 0) {
        return 0;
    }

    return -Math.min(lateFeeEventCount, 5);
}
