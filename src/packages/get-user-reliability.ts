import { codesInGroup, mkListMerchantCategories, type BankingArgs } from "../banking/index.js";
import { mkGetCheckingAccountNegativeBalanceDayCount, mkGetReliabilityMetrics, type DatabaseArgs } from "../database.js";
import { buildDrivers } from "./drivers.js";
import { ratio } from "./ratio.js";
import { roundToTwoDecimalPlaces } from "./round-to-two-decimal-places.js";
import { calculateReliabilityScore, scoreBand } from "./score/index.js";
import { getScoringWindow } from "./scoring-window.js";

const SCORING_WINDOW_MONTH_COUNT = 6;

export function mkGetUserReliability(args: BankingArgs & DatabaseArgs) {
    const getReliabilityMetrics = mkGetReliabilityMetrics(args);
    const getCheckingAccountNegativeBalanceDayCount = mkGetCheckingAccountNegativeBalanceDayCount(args);
    const listMerchantCategories = mkListMerchantCategories(args);

    return async (userId: string, from: string) => {
        const { startDate, endDate } = getScoringWindow(from, SCORING_WINDOW_MONTH_COUNT);
        const categories = await listMerchantCategories();
        const metrics = getReliabilityMetrics({
            userId,
            startDate,
            endDate,
            incomeCategoryCodes: codesInGroup(categories, "income"),
            essentialCategoryCodes: codesInGroup(categories, "essential"),
            savingsCategoryCodes: codesInGroup(categories, "savings"),
            feeCategoryCodes: codesInGroup(categories, "fees"),
            highRiskCategoryCodes: codesInGroup(categories, "high_risk"),
        });
        const negativeBalanceDayCount = getCheckingAccountNegativeBalanceDayCount({
            userId,
            startDate,
            endDate,
        });
        const reliabilityIndex = calculateReliabilityScore({
            ...metrics,
            scoringWindowMonthCount: SCORING_WINDOW_MONTH_COUNT,
            negativeBalanceDayCount,
        });
        const incomeRegularity = ratio(metrics.incomeMonthCount, SCORING_WINDOW_MONTH_COUNT);
        const incomeCoverageRatio = ratio(metrics.totalIncomeCents, metrics.totalEssentialExpensesCents);
        const possibleEssentialCategoryMonthCount = SCORING_WINDOW_MONTH_COUNT * metrics.essentialCategoryCount;
        const essentialPaymentsConsistency = ratio(metrics.essentialCategoryMonthCount, possibleEssentialCategoryMonthCount);

        return {
            user_id: userId,
            from,
            currency: "EUR" as const,
            reliability_index: reliabilityIndex,
            score_band: scoreBand(reliabilityIndex),
            metrics: {
                income_regularity: roundToTwoDecimalPlaces(incomeRegularity),
                income_coverage_ratio: roundToTwoDecimalPlaces(incomeCoverageRatio),
                essential_payments_consistency: roundToTwoDecimalPlaces(essentialPaymentsConsistency),
                good_months: metrics.savingsMonthCount,
                negative_balance_days: negativeBalanceDayCount,
                late_fee_events: metrics.lateFeeEventCount,
            },
            drivers: buildDrivers(metrics, incomeCoverageRatio, negativeBalanceDayCount, SCORING_WINDOW_MONTH_COUNT),
        };
    };
}
