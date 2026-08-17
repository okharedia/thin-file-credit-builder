import type {
  AccountNegativeBalanceDayCount,
  ReliabilityMetrics,
} from "../database.js";

type ScoringWindowMonthCount = {
  scoringWindowMonthCount: number;
};

type IncomeRegularityMetrics = Pick<ReliabilityMetrics, "incomeMonthCount">
  & ScoringWindowMonthCount;

type IncomeCoverageMetrics = Pick<
  ReliabilityMetrics,
  "totalIncomeCents" | "totalEssentialExpensesCents"
>;

type EssentialPaymentsConsistencyMetrics = Pick<
  ReliabilityMetrics,
  "essentialCategoryMonthCount" | "essentialCategoryCount"
> & ScoringWindowMonthCount;

type SavingsBehaviorMetrics = Pick<ReliabilityMetrics, "savingsMonthCount">
  & ScoringWindowMonthCount;

type NegativeBalanceMetrics = {
  negativeBalanceDayCount: number;
};

type LateFeeMetrics = Pick<ReliabilityMetrics, "lateFeeEventCount">;

type HighRiskSpendingMetrics = Pick<
  ReliabilityMetrics,
  "totalHighRiskDebitCents" | "totalSpendingDebitCents"
>;

type ResilienceMetrics = SavingsBehaviorMetrics
  & LateFeeMetrics
  & HighRiskSpendingMetrics
  & NegativeBalanceMetrics;

type ReliabilityScoreMetrics = IncomeRegularityMetrics
  & IncomeCoverageMetrics
  & EssentialPaymentsConsistencyMetrics
  & ResilienceMetrics;

function requirePositiveScoringWindowMonthCount(
  scoringWindowMonthCount: number,
): void {
  if (
    !Number.isSafeInteger(scoringWindowMonthCount)
    || scoringWindowMonthCount < 1
  ) {
    throw new RangeError("scoringWindowMonthCount must be a positive integer");
  }
}

/**
 * Calculates the 0–25 income regularity points.
 *
 * income regularity = income month count / scoring window month count
 * points = round(income regularity × 25)
 */
export function calculateIncomeRegularityPoints({
  incomeMonthCount,
  scoringWindowMonthCount,
}: IncomeRegularityMetrics): number {
  requirePositiveScoringWindowMonthCount(scoringWindowMonthCount);

  if (
    !Number.isSafeInteger(incomeMonthCount)
    || incomeMonthCount < 0
    || incomeMonthCount > scoringWindowMonthCount
  ) {
    throw new RangeError(
      "incomeMonthCount must be between zero and scoringWindowMonthCount",
    );
  }

  const incomeRegularity = incomeMonthCount / scoringWindowMonthCount;

  return Math.round(incomeRegularity * 25);
}

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
export function calculateIncomeCoveragePoints({
  totalIncomeCents,
  totalEssentialExpensesCents,
}: IncomeCoverageMetrics): number {
  if (
    !Number.isSafeInteger(totalIncomeCents)
    || !Number.isSafeInteger(totalEssentialExpensesCents)
  ) {
    throw new RangeError("income and essential expense totals must be integers");
  }

  if (totalIncomeCents <= 0 || totalEssentialExpensesCents <= 0) {
    return 0;
  }

  const incomeCoverageRatio =
    totalIncomeCents / totalEssentialExpensesCents;
  const cappedCoverageRatio = Math.min(incomeCoverageRatio, 2);

  return Math.round((cappedCoverageRatio / 2) * 25);
}

/**
 * Calculates the 0–25 essential payments consistency points.
 *
 * possible category-months = scoring window month count × essential category count
 * consistency = essential category-month count / possible category-months
 * points = round(consistency × 25)
 *
 * An essential category-month is present when at least one transaction for
 * that category exists in that month. No configured essential categories
 * earns zero points because there is no consistency evidence to score.
 */
export function calculateEssentialPaymentsConsistencyPoints({
  essentialCategoryMonthCount,
  essentialCategoryCount,
  scoringWindowMonthCount,
}: EssentialPaymentsConsistencyMetrics): number {
  requirePositiveScoringWindowMonthCount(scoringWindowMonthCount);

  if (
    !Number.isSafeInteger(essentialCategoryCount)
    || essentialCategoryCount < 0
  ) {
    throw new RangeError("essentialCategoryCount must be a non-negative integer");
  }

  const possibleCategoryMonthCount =
    scoringWindowMonthCount * essentialCategoryCount;

  if (
    !Number.isSafeInteger(essentialCategoryMonthCount)
    || essentialCategoryMonthCount < 0
    || essentialCategoryMonthCount > possibleCategoryMonthCount
  ) {
    throw new RangeError(
      "essentialCategoryMonthCount must be between zero and the possible category-month count",
    );
  }

  if (possibleCategoryMonthCount === 0) {
    return 0;
  }

  const essentialPaymentsConsistency =
    essentialCategoryMonthCount / possibleCategoryMonthCount;

  return Math.round(essentialPaymentsConsistency * 25);
}

/**
 * Calculates the 0–25 savings behavior points.
 *
 * savings behavior = savings month count / scoring window month count
 * points = round(savings behavior × 25)
 *
 * A month counts once when it contains at least one positive savings
 * transaction, regardless of the number or value of those transactions.
 */
export function calculateSavingsBehaviorPoints({
  savingsMonthCount,
  scoringWindowMonthCount,
}: SavingsBehaviorMetrics): number {
  requirePositiveScoringWindowMonthCount(scoringWindowMonthCount);

  if (
    !Number.isSafeInteger(savingsMonthCount)
    || savingsMonthCount < 0
    || savingsMonthCount > scoringWindowMonthCount
  ) {
    throw new RangeError(
      "savingsMonthCount must be between zero and scoringWindowMonthCount",
    );
  }

  const savingsBehavior = savingsMonthCount / scoringWindowMonthCount;

  return Math.round(savingsBehavior * 25);
}

/**
 * Calculates the 0 to −10 negative-balance adjustment.
 *
 * points = −min(negative balance day count, 10)
 *
 * Each negative account-day deducts one point. The deduction is capped at
 * ten points so this signal cannot outweigh the positive scoring components.
 */
export function calculateNegativeBalancePoints({
  negativeBalanceDayCount,
}: NegativeBalanceMetrics): number {
  if (
    !Number.isSafeInteger(negativeBalanceDayCount)
    || negativeBalanceDayCount < 0
  ) {
    throw new RangeError(
      "negativeBalanceDayCount must be a non-negative integer",
    );
  }

  if (negativeBalanceDayCount === 0) {
    return 0;
  }

  return -Math.min(negativeBalanceDayCount, 10);
}

/**
 * Calculates the 0 to −5 late-fee adjustment.
 *
 * points = −min(late fee event count, 5)
 *
 * Each late-fee transaction deducts one point, capped at five points.
 */
export function calculateLateFeePoints({
  lateFeeEventCount,
}: LateFeeMetrics): number {
  if (!Number.isSafeInteger(lateFeeEventCount) || lateFeeEventCount < 0) {
    throw new RangeError("lateFeeEventCount must be a non-negative integer");
  }

  if (lateFeeEventCount === 0) {
    return 0;
  }

  return -Math.min(lateFeeEventCount, 5);
}

/**
 * Calculates the 0 to −5 high-risk spending adjustment.
 *
 * high-risk spending ratio = high-risk debit total / spending debit total
 * points = −round(high-risk spending ratio × 5)
 *
 * With no spending, there is no high-risk proportion and the adjustment is
 * zero. The high-risk total must be a subset of the spending total.
 */
export function calculateHighRiskSpendingPoints({
  totalHighRiskDebitCents,
  totalSpendingDebitCents,
}: HighRiskSpendingMetrics): number {
  if (
    !Number.isSafeInteger(totalHighRiskDebitCents)
    || totalHighRiskDebitCents < 0
    || !Number.isSafeInteger(totalSpendingDebitCents)
    || totalSpendingDebitCents < 0
  ) {
    throw new RangeError(
      "high-risk and spending totals must be non-negative integers",
    );
  }

  if (totalHighRiskDebitCents > totalSpendingDebitCents) {
    throw new RangeError(
      "totalHighRiskDebitCents cannot exceed totalSpendingDebitCents",
    );
  }

  if (totalSpendingDebitCents === 0) {
    return 0;
  }

  const highRiskSpendingRatio =
    totalHighRiskDebitCents / totalSpendingDebitCents;
  const penalty = Math.round(highRiskSpendingRatio * 5);

  return penalty === 0 ? 0 : -penalty;
}

export function sumNegativeBalanceDayCounts(
  accountCounts: readonly AccountNegativeBalanceDayCount[],
): number {
  return accountCounts.reduce(
    (total, account) => total + account.negativeBalanceDayCount,
    0,
  );
}

/**
 * Calculates the −20 to +25 resilience points.
 *
 * negative balance day count = sum of each checking account's negative days
 * resilience points = savings + negative balance + late fees + high risk
 */
export function calculateResiliencePoints(
  metrics: ResilienceMetrics,
): number {
  return calculateSavingsBehaviorPoints(metrics)
    + calculateNegativeBalancePoints(metrics)
    + calculateLateFeePoints(metrics)
    + calculateHighRiskSpendingPoints(metrics);
}

/**
 * Calculates the final 0–100 reliability score.
 *
 * score = income regularity + income coverage
 *   + essential payments consistency + resilience
 * final score = clamp(score, 0, 100)
 */
export function calculateReliabilityScore(
  metrics: ReliabilityScoreMetrics,
): number {
  const score = calculateIncomeRegularityPoints(metrics)
    + calculateIncomeCoveragePoints(metrics)
    + calculateEssentialPaymentsConsistencyPoints(metrics)
    + calculateResiliencePoints(metrics);

  return Math.min(Math.max(score, 0), 100);
}
