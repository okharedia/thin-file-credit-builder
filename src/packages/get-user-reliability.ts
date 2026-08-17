import {
  mkListMerchantCategories,
  type BankingArgs,
  type MerchantCategory,
  type MerchantCategoryGroup,
} from "../banking/index.js";
import {
  mkGetReliabilityMetrics,
  mkListCheckingAccountNegativeBalanceDayCounts,
  type DatabaseArgs,
  type ReliabilityMetrics,
} from "../database.js";
import {
  calculateReliabilityScore,
  sumNegativeBalanceDayCounts,
} from "./calculate-reliability-score.js";
import { getScoringWindow } from "./scoring-window.js";

const SCORING_WINDOW_MONTH_COUNT = 6;

function codesInGroup(
  categories: readonly MerchantCategory[],
  group: MerchantCategoryGroup,
): string[] {
  return categories
    .filter((category) => category.group === group)
    .map((category) => category.code);
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function roundToTwoDecimalPlaces(value: number): number {
  return Math.round(value * 100) / 100;
}

function scoreBand(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score < 50) {
    return "LOW";
  }

  return score < 75 ? "MEDIUM" : "HIGH";
}

function buildDrivers(
  metrics: ReliabilityMetrics,
  incomeCoverageRatio: number,
  negativeBalanceDayCount: number,
): string[] {
  const highRiskSpendingRatio = ratio(
    metrics.totalHighRiskDebitCents,
    metrics.totalSpendingDebitCents,
  );
  const drivers = [
    `Income present in ${metrics.incomeMonthCount}/${SCORING_WINDOW_MONTH_COUNT} months`,
    `Income covers essential expenses (${incomeCoverageRatio.toFixed(2)}x)`,
    `Savings activity in ${metrics.savingsMonthCount}/${SCORING_WINDOW_MONTH_COUNT} months`,
  ];

  if (negativeBalanceDayCount > 0) {
    drivers.push(
      `${negativeBalanceDayCount} negative balance account-days`,
    );
  }

  if (metrics.lateFeeEventCount > 0) {
    const event = metrics.lateFeeEventCount === 1 ? "event" : "events";
    drivers.push(`${metrics.lateFeeEventCount} late fee ${event}`);
  }

  if (metrics.totalHighRiskDebitCents > 0) {
    drivers.push(
      `High-risk spending was ${Math.round(highRiskSpendingRatio * 100)}% of spending`,
    );
  }

  return drivers;
}

export function mkGetUserReliability(args: BankingArgs & DatabaseArgs) {
  const getReliabilityMetrics = mkGetReliabilityMetrics(args);
  const listCheckingAccountNegativeBalanceDayCounts =
    mkListCheckingAccountNegativeBalanceDayCounts(args);
  const listMerchantCategories = mkListMerchantCategories(args);

  return async (userId: string, from: string) => {
    const { startDate, endDate } = getScoringWindow(
      from,
      SCORING_WINDOW_MONTH_COUNT,
    );
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
    const checkingAccountNegativeBalanceDayCounts =
      listCheckingAccountNegativeBalanceDayCounts({
        userId,
        startDate,
        endDate,
      });
    const negativeBalanceDayCount = sumNegativeBalanceDayCounts(
      checkingAccountNegativeBalanceDayCounts,
    );
    const reliabilityIndex = calculateReliabilityScore({
      ...metrics,
      scoringWindowMonthCount: SCORING_WINDOW_MONTH_COUNT,
      negativeBalanceDayCount,
    });
    const incomeRegularity = ratio(
      metrics.incomeMonthCount,
      SCORING_WINDOW_MONTH_COUNT,
    );
    const incomeCoverageRatio = ratio(
      metrics.totalIncomeCents,
      metrics.totalEssentialExpensesCents,
    );
    const possibleEssentialCategoryMonthCount =
      SCORING_WINDOW_MONTH_COUNT * metrics.essentialCategoryCount;
    const essentialPaymentsConsistency = ratio(
      metrics.essentialCategoryMonthCount,
      possibleEssentialCategoryMonthCount,
    );

    return {
      user_id: userId,
      from,
      currency: "EUR" as const,
      reliability_index: reliabilityIndex,
      score_band: scoreBand(reliabilityIndex),
      metrics: {
        income_regularity: roundToTwoDecimalPlaces(incomeRegularity),
        income_coverage_ratio: roundToTwoDecimalPlaces(incomeCoverageRatio),
        essential_payments_consistency: roundToTwoDecimalPlaces(
          essentialPaymentsConsistency,
        ),
        good_months: metrics.savingsMonthCount,
        negative_balance_days: negativeBalanceDayCount,
        late_fee_events: metrics.lateFeeEventCount,
      },
      drivers: buildDrivers(
        metrics,
        incomeCoverageRatio,
        negativeBalanceDayCount,
      ),
    };
  };
}
