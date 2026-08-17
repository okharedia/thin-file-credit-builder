import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateEssentialPaymentsConsistencyPoints, calculateIncomeCoveragePoints, calculateIncomeRegularityPoints, calculateReliabilityScore, calculateResiliencePoints } from "../src/score/index.js";

test("calculates income regularity points", () =>
{
        const cases = [
                { incomeMonthCount: 0, expectedPoints: 0 },
                { incomeMonthCount: 1, expectedPoints: 4 },
                { incomeMonthCount: 3, expectedPoints: 13 },
                { incomeMonthCount: 5, expectedPoints: 21 },
                { incomeMonthCount: 6, expectedPoints: 25 },
        ];

        for (const { incomeMonthCount, expectedPoints } of cases)
        {
                assert.equal(
                        calculateIncomeRegularityPoints({
                                incomeMonthCount,
                                scoringWindowMonthCount: 6,
                        }),
                        expectedPoints,
                );
        }

        assert.equal(
                calculateIncomeRegularityPoints({
                        incomeMonthCount: 2,
                        scoringWindowMonthCount: 3,
                }),
                17,
        );
});

test("calculates income coverage points", () =>
{
        const cases = [
                { totalIncomeCents: 0, expectedPoints: 0 },
                { totalIncomeCents: 5_000, expectedPoints: 6 },
                { totalIncomeCents: 10_000, expectedPoints: 13 },
                { totalIncomeCents: 15_000, expectedPoints: 19 },
                { totalIncomeCents: 20_000, expectedPoints: 25 },
                { totalIncomeCents: 30_000, expectedPoints: 25 },
        ];

        for (const { totalIncomeCents, expectedPoints } of cases)
        {
                assert.equal(
                        calculateIncomeCoveragePoints({
                                totalIncomeCents,
                                totalEssentialExpensesCents: 10_000,
                        }),
                        expectedPoints,
                );
        }
});

test("returns zero income coverage points without a usable denominator", () =>
{
        assert.equal(
                calculateIncomeCoveragePoints({
                        totalIncomeCents: 10_000,
                        totalEssentialExpensesCents: 0,
                }),
                0,
        );

        assert.equal(
                calculateIncomeCoveragePoints({
                        totalIncomeCents: 10_000,
                        totalEssentialExpensesCents: -1_000,
                }),
                0,
        );
});

test("calculates essential payments consistency points", () =>
{
        const cases = [
                { essentialCategoryMonthCount: 0, expectedPoints: 0 },
                { essentialCategoryMonthCount: 1, expectedPoints: 2 },
                { essentialCategoryMonthCount: 4, expectedPoints: 8 },
                { essentialCategoryMonthCount: 6, expectedPoints: 13 },
                { essentialCategoryMonthCount: 10, expectedPoints: 21 },
                { essentialCategoryMonthCount: 12, expectedPoints: 25 },
        ];

        for (const { essentialCategoryMonthCount, expectedPoints } of cases)
        {
                assert.equal(
                        calculateEssentialPaymentsConsistencyPoints({
                                essentialCategoryMonthCount,
                                essentialCategoryCount: 2,
                                scoringWindowMonthCount: 6,
                        }),
                        expectedPoints,
                );
        }
});

test("returns zero consistency points without essential categories", () =>
{
        assert.equal(
                calculateEssentialPaymentsConsistencyPoints({
                        essentialCategoryMonthCount: 0,
                        essentialCategoryCount: 0,
                        scoringWindowMonthCount: 6,
                }),
                0,
        );
});

const emptyResilienceMetrics = {
        scoringWindowMonthCount: 6,
        savingsMonthCount: 0,
        lateFeeEventCount: 0,
        totalHighRiskDebitCents: 0,
        totalSpendingDebitCents: 0,
        negativeBalanceDayCount: 0,
};

test("calculates savings behavior points", () =>
{
        const cases = [
                { savingsMonthCount: 0, expectedPoints: 0 },
                { savingsMonthCount: 1, expectedPoints: 4 },
                { savingsMonthCount: 3, expectedPoints: 13 },
                { savingsMonthCount: 5, expectedPoints: 21 },
                { savingsMonthCount: 6, expectedPoints: 25 },
        ];

        for (const { savingsMonthCount, expectedPoints } of cases)
        {
                assert.equal(calculateResiliencePoints({ ...emptyResilienceMetrics, savingsMonthCount }), expectedPoints);
        }
});

test("calculates negative balance points", () =>
{
        const cases = [
                { negativeBalanceDayCount: 0, expectedPoints: 0 },
                { negativeBalanceDayCount: 1, expectedPoints: -1 },
                { negativeBalanceDayCount: 5, expectedPoints: -5 },
                { negativeBalanceDayCount: 10, expectedPoints: -10 },
                { negativeBalanceDayCount: 54, expectedPoints: -10 },
        ];

        for (const { negativeBalanceDayCount, expectedPoints } of cases)
        {
                assert.equal(calculateResiliencePoints({ ...emptyResilienceMetrics, negativeBalanceDayCount }), expectedPoints);
        }
});

test("calculates late fee points", () =>
{
        const cases = [
                { lateFeeEventCount: 0, expectedPoints: 0 },
                { lateFeeEventCount: 1, expectedPoints: -1 },
                { lateFeeEventCount: 3, expectedPoints: -3 },
                { lateFeeEventCount: 5, expectedPoints: -5 },
                { lateFeeEventCount: 8, expectedPoints: -5 },
        ];

        for (const { lateFeeEventCount, expectedPoints } of cases)
        {
                assert.equal(calculateResiliencePoints({ ...emptyResilienceMetrics, lateFeeEventCount }), expectedPoints);
        }
});

test("calculates high-risk spending points", () =>
{
        const cases = [
                { totalHighRiskDebitCents: 0, expectedPoints: 0 },
                { totalHighRiskDebitCents: 2_000, expectedPoints: -1 },
                { totalHighRiskDebitCents: 5_000, expectedPoints: -3 },
                { totalHighRiskDebitCents: 8_000, expectedPoints: -4 },
                { totalHighRiskDebitCents: 10_000, expectedPoints: -5 },
        ];

        for (const { totalHighRiskDebitCents, expectedPoints } of cases)
        {
                assert.equal(
                        calculateResiliencePoints({
                                ...emptyResilienceMetrics,
                                totalHighRiskDebitCents,
                                totalSpendingDebitCents: 10_000,
                        }),
                        expectedPoints,
                );
        }
});

test("returns zero high-risk points without spending", () =>
{
        assert.equal(calculateResiliencePoints(emptyResilienceMetrics), 0);
});

const reliabilityScoreMetrics = {
        scoringWindowMonthCount: 6,
        incomeMonthCount: 5,
        totalIncomeCents: 14_000,
        totalEssentialExpensesCents: 10_000,
        essentialCategoryMonthCount: 10,
        essentialCategoryCount: 2,
        savingsMonthCount: 4,
        lateFeeEventCount: 1,
        totalHighRiskDebitCents: 2_000,
        totalSpendingDebitCents: 10_000,
        negativeBalanceDayCount: 7,
};

test("combines resilience points", () =>
{
        // Savings 17 - negative balances 7 - late fees 1 - high risk 1 = 8.
        assert.equal(calculateResiliencePoints(reliabilityScoreMetrics), 8);
});

test("calculates the final reliability score", () =>
{
        // Income regularity 21 + coverage 18 + consistency 21 + resilience 8 = 68.
        assert.equal(calculateReliabilityScore(reliabilityScoreMetrics), 68);
});

test("clamps the final reliability score to zero", () =>
{
        assert.equal(
                calculateReliabilityScore({
                        ...reliabilityScoreMetrics,
                        incomeMonthCount: 0,
                        totalIncomeCents: 0,
                        essentialCategoryMonthCount: 0,
                        savingsMonthCount: 0,
                        lateFeeEventCount: 5,
                        totalHighRiskDebitCents: 10_000,
                        negativeBalanceDayCount: 10,
                }),
                0,
        );
});
