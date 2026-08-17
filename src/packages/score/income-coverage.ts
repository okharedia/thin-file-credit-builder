import type { ReliabilityMetrics } from "../../database.js";

/**
 * Calculates the 0–25 income coverage points.
 *
 * income coverage ratio = total income / total essential expenses
 * points = round(clamp(income coverage ratio / 2, 0, 1) × 25)
 *
 * Two-times coverage earns all 25 points. Additional coverage is capped so
 * unusually high income does not keep increasing the score. A non-positive
 * essential-expense total earns zero because it cannot produce a meaningful
 * coverage ratio.
 */
export function calculateIncomeCoveragePoints({ totalIncomeCents, totalEssentialExpensesCents }: Pick<ReliabilityMetrics, "totalIncomeCents" | "totalEssentialExpensesCents">): number {
        if (totalIncomeCents <= 0 || totalEssentialExpensesCents <= 0) {
                return 0;
        }

        const incomeCoverageRatio = totalIncomeCents / totalEssentialExpensesCents;
        const cappedCoverageRatio = Math.min(incomeCoverageRatio, 2);

        return Math.round((cappedCoverageRatio / 2) * 25);
}
