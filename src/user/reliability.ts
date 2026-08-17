import { mkGetCheckingAccountNegativeBalanceDayCount, mkGetReliabilityMetrics, type DatabaseArgs } from "../database.js";
import { codesInGroup, mkListMerchantCategories, type BankingArgs } from "../banking/index.js";
import { buildDrivers } from "../score/drivers.js";
import { calculateReliabilityScore } from "../score/index.js";
import { formatIsoDate } from "../utils/iso-date.js";
import { ratio } from "../utils/ratio.js";
import { getScoringWindow } from "../utils/scoring-window.js";

const SCORING_WINDOW_MONTH_COUNT = 6;

export function mkGetUserReliability(args: BankingArgs & DatabaseArgs)
{
        const getReliabilityMetrics = mkGetReliabilityMetrics(args);
        const getCheckingAccountNegativeBalanceDayCount = mkGetCheckingAccountNegativeBalanceDayCount(args);
        const listMerchantCategories = mkListMerchantCategories(args);

        return async (userId: string, from: Date) =>
        {
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

                return {
                        user_id: userId,
                        from: formatIsoDate(from),
                        currency: "EUR" as const,
                        reliability_index: reliabilityIndex,
                        score_band: reliabilityIndex < 50 ? "LOW" : reliabilityIndex < 75 ? "MEDIUM" : "HIGH",
                        metrics: {
                                income_regularity: ratio(metrics.incomeMonthCount, SCORING_WINDOW_MONTH_COUNT),
                                income_coverage_ratio: ratio(metrics.totalIncomeCents, metrics.totalEssentialExpensesCents),
                                essential_payments_consistency: ratio(metrics.essentialCategoryMonthCount, SCORING_WINDOW_MONTH_COUNT * metrics.essentialCategoryCount),
                                good_months: metrics.savingsMonthCount,
                                negative_balance_days: negativeBalanceDayCount,
                                late_fee_events: metrics.lateFeeEventCount,
                        },
                        drivers: buildDrivers(metrics, negativeBalanceDayCount, SCORING_WINDOW_MONTH_COUNT),
                };
        };
}
