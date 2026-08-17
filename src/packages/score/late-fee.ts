import type { ReliabilityMetrics } from "../../database.js";

/**
 * Calculates the 0 to −5 late-fee adjustment.
 *
 * points = −min(late fee event count, 5)
 *
 * Each late-fee transaction deducts one point, capped at five points.
 */
export function calculateLateFeePoints({ lateFeeEventCount }: Pick<ReliabilityMetrics, "lateFeeEventCount">): number {
        return lateFeeEventCount === 0 ? 0 : -Math.min(lateFeeEventCount, 5);
}
