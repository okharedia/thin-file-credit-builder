import { mkGetScoreableDateRange, mkGetUserDailyMetrics, type AnalyticsArgs, type ScoreableDateRange } from "../analytics.js";
import { buildDrivers } from "../score/drivers.js";
import { calculateReliabilityScore } from "../score/index.js";
import { formatIsoDate } from "../utils/iso-date.js";
import { ratio } from "../utils/ratio.js";
import { roundTo } from "../utils/round.js";

const SCORING_WINDOW_MONTH_COUNT = 6;

export type ReliabilityResult =
        | { outcome: "ok"; response: ReliabilityResponse }
        | { outcome: "date_not_scoreable"; scoreableDateRange: ScoreableDateRange | undefined }
        | { outcome: "user_not_found" };

type ReliabilityResponse = {
        user_id: string;
        from: string;
        currency: "EUR";
        reliability_index: number;
        score_band: string;
        metrics: Record<string, number>;
        drivers: string[];
};

export function mkGetUserReliability(args: AnalyticsArgs)
{
        const getUserDailyMetrics = mkGetUserDailyMetrics(args);
        const getScoreableDateRange = mkGetScoreableDateRange(args);

        return async (userId: string, from: Date): Promise<ReliabilityResult> =>
        {
                const asOfDate = formatIsoDate(from);

                // Metrics are precomputed per (user, date) by the dbt mart; scoring
                // itself still happens here so there is one implementation of the
                // formula. See analytics/README.md.
                const metrics = await getUserDailyMetrics(userId, asOfDate);

                if (!metrics)
                {
                        const scoreableDateRange = await getScoreableDateRange();

                        // A date outside the mart's range has no fully-observed scoring
                        // window, so no score exists for it. Inside the range, the user
                        // itself is unknown.
                        if (!scoreableDateRange || asOfDate < scoreableDateRange.scoreableFrom || asOfDate > scoreableDateRange.scoreableTo)
                        {
                                return { outcome: "date_not_scoreable", scoreableDateRange };
                        }

                        return { outcome: "user_not_found" };
                }

                const reliabilityIndex = calculateReliabilityScore({
                        ...metrics,
                        scoringWindowMonthCount: SCORING_WINDOW_MONTH_COUNT,
                });

                return {
                        outcome: "ok",
                        response: {
                                user_id: userId,
                                from: asOfDate,
                                currency: "EUR" as const,
                                reliability_index: reliabilityIndex,
                                score_band: reliabilityIndex < 50 ? "LOW" : reliabilityIndex < 75 ? "MEDIUM" : "HIGH",
                                metrics: {
                                        income_regularity: roundTo(ratio(metrics.incomeMonthCount, SCORING_WINDOW_MONTH_COUNT)),
                                        income_coverage_ratio: roundTo(ratio(metrics.totalIncomeCents, metrics.totalEssentialExpensesCents)),
                                        essential_payments_consistency: roundTo(ratio(metrics.essentialCategoryMonthCount, SCORING_WINDOW_MONTH_COUNT * metrics.essentialCategoryCount)),
                                        good_months: metrics.savingsMonthCount,
                                        negative_balance_days: metrics.negativeBalanceDayCount,
                                        late_fee_events: metrics.lateFeeEventCount,
                                },
                                drivers: buildDrivers(metrics, metrics.negativeBalanceDayCount, SCORING_WINDOW_MONTH_COUNT),
                        },
                };
        };
}
