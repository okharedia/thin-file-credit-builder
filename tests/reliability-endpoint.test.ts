import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { createTempAnalytics, type UserDailyMetricsRow } from "./create-temp-analytics.js";
import { createTempDatabase } from "./create-temp-database.js";

// The same window the pre-mart version of this test built out of individual
// transactions: five months of income, six months of rent, four months of
// savings, one late fee and one high-risk debit.
const metrics: UserDailyMetricsRow = {
        userId: "user-1",
        asOfDate: "2026-02-20",
        windowStartDate: "2025-09-01",
        windowEndDate: "2026-02-20",
        incomeMonthCount: 5,
        totalIncomeCents: 50_000,
        totalEssentialExpensesCents: 30_000,
        essentialCategoryMonthCount: 6,
        essentialCategoryCount: 1,
        savingsMonthCount: 4,
        lateFeeEventCount: 1,
        totalSpendingDebitCents: 35_500,
        totalHighRiskDebitCents: 5_000,
        negativeBalanceDayCount: 0,
};

test("returns the reliability score response", async (t) =>
{
        const { testDirectory, databaseFilePath } = await createTempDatabase();
        const { testDirectory: analyticsDirectory, analyticsFilePath } = await createTempAnalytics([metrics]);
        // /sync is never called in this test, so this base URL is unused.
        const args = { bankingApiBaseUrl: "http://127.0.0.1:0", databaseFilePath, analyticsFilePath };
        const app = buildApp(args);

        t.after(async () =>
        {
                await app.close();
                rmSync(testDirectory, { recursive: true, force: true });
                rmSync(analyticsDirectory, { recursive: true, force: true });
        });

        const response = await app.inject({
                method: "GET",
                url: "/api/users/user-1/reliability?from=2026-02-20",
        });

        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.json(), {
                user_id: "user-1",
                from: "2026-02-20",
                currency: "EUR",
                reliability_index: 82,
                score_band: "HIGH",
                metrics: {
                        income_regularity: 0.83,
                        income_coverage_ratio: 1.67,
                        essential_payments_consistency: 1,
                        good_months: 4,
                        negative_balance_days: 0,
                        late_fee_events: 1,
                },
                drivers: ["Income present in 5/6 months", "Income covers essential expenses (1.67x)", "Savings activity in 4/6 months", "1 late fee event(s)", "High-risk spending was 14% of spending"],
        });

        const invalidResponse = await app.inject({
                method: "GET",
                url: "/api/users/user-1/reliability",
        });

        assert.equal(invalidResponse.statusCode, 400);
        assert.deepEqual(invalidResponse.json(), {
                error: "from must be a valid date in YYYY-MM-DD format",
        });
});

test("returns 404 with the scoreable range for a date the mart cannot answer", async (t) =>
{
        const { testDirectory, databaseFilePath } = await createTempDatabase();
        const { testDirectory: analyticsDirectory, analyticsFilePath } = await createTempAnalytics([metrics]);
        const app = buildApp({ bankingApiBaseUrl: "http://127.0.0.1:0", databaseFilePath, analyticsFilePath });

        t.after(async () =>
        {
                await app.close();
                rmSync(testDirectory, { recursive: true, force: true });
                rmSync(analyticsDirectory, { recursive: true, force: true });
        });

        // Before any fully-observed window exists. The pre-mart implementation
        // answered this with a zero-filled score.
        const tooEarly = await app.inject({
                method: "GET",
                url: "/api/users/user-1/reliability?from=2025-10-15",
        });

        assert.equal(tooEarly.statusCode, 404);
        assert.deepEqual(tooEarly.json(), {
                error: "No reliability score is available for that date. Its 6-month scoring window is not fully covered by synced banking data.",
                scoreable_from: "2026-02-20",
                scoreable_to: "2026-02-20",
        });

        const tooLate = await app.inject({
                method: "GET",
                url: "/api/users/user-1/reliability?from=2099-01-01",
        });

        assert.equal(tooLate.statusCode, 404);
        assert.equal(tooLate.json().scoreable_to, "2026-02-20");
});

test("returns 404 for a user with no synced data", async (t) =>
{
        const { testDirectory, databaseFilePath } = await createTempDatabase();
        const { testDirectory: analyticsDirectory, analyticsFilePath } = await createTempAnalytics([metrics]);
        const app = buildApp({ bankingApiBaseUrl: "http://127.0.0.1:0", databaseFilePath, analyticsFilePath });

        t.after(async () =>
        {
                await app.close();
                rmSync(testDirectory, { recursive: true, force: true });
                rmSync(analyticsDirectory, { recursive: true, force: true });
        });

        const response = await app.inject({
                method: "GET",
                url: "/api/users/unknown-user/reliability?from=2026-02-20",
        });

        assert.equal(response.statusCode, 404);
        assert.match(response.json().error, /No synced data for user unknown-user/);
});
