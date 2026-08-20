import { DuckDBInstance } from "@duckdb/node-api";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Builds a throwaway analytics database holding just the mart the API reads.
 *
 * The mart's own correctness is covered by the dbt data tests and by
 * `npm run analytics:parity`, which holds it against the application's
 * queries. These tests only need known inputs, so they write the rows
 * directly rather than depending on a dbt run.
 */
export type UserDailyMetricsRow = {
        userId: string;
        asOfDate: string;
        windowStartDate: string;
        windowEndDate: string;
        incomeMonthCount: number;
        totalIncomeCents: number;
        totalEssentialExpensesCents: number;
        essentialCategoryMonthCount: number;
        essentialCategoryCount: number;
        savingsMonthCount: number;
        lateFeeEventCount: number;
        totalSpendingDebitCents: number;
        totalHighRiskDebitCents: number;
        negativeBalanceDayCount: number;
};

export async function createTempAnalytics(rows: UserDailyMetricsRow[]): Promise<{
        testDirectory: string;
        analyticsFilePath: string;
}>
{
        const testDirectory = await mkdtemp(join(tmpdir(), "credit-builder-analytics-"));
        const analyticsFilePath = join(testDirectory, "test.duckdb");
        const instance = await DuckDBInstance.create(analyticsFilePath);
        const connection = await instance.connect();

        await connection.run(`
    CREATE TABLE fct_user_daily_metrics (
      user_id VARCHAR,
      as_of_date DATE,
      window_start_date DATE,
      window_end_date DATE,
      income_month_count BIGINT,
      total_income_cents BIGINT,
      total_essential_expenses_cents BIGINT,
      essential_category_month_count BIGINT,
      essential_category_count BIGINT,
      savings_month_count BIGINT,
      late_fee_event_count BIGINT,
      total_spending_debit_cents BIGINT,
      total_high_risk_debit_cents BIGINT,
      negative_balance_day_count BIGINT,
      built_at TIMESTAMPTZ
    )
  `);

        for (const row of rows)
        {
                await connection.run(
                        `
      INSERT INTO fct_user_daily_metrics VALUES (
        ?, ?::DATE, ?::DATE, ?::DATE, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now()
      )
    `,
                        [row.userId, row.asOfDate, row.windowStartDate, row.windowEndDate, row.incomeMonthCount, row.totalIncomeCents, row.totalEssentialExpensesCents, row.essentialCategoryMonthCount, row.essentialCategoryCount, row.savingsMonthCount, row.lateFeeEventCount, row.totalSpendingDebitCents, row.totalHighRiskDebitCents, row.negativeBalanceDayCount],
                );
        }

        connection.closeSync();
        instance.closeSync();

        return { testDirectory, analyticsFilePath };
}
