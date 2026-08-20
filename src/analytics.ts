import { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { resolve } from "node:path";
import type { ReliabilityMetrics } from "./database.js";

export type AnalyticsArgs = {
        analyticsFilePath: string;
};

export type UserDailyMetrics = ReliabilityMetrics & {
        negativeBalanceDayCount: number;
        windowStartDate: string;
        windowEndDate: string;
        builtAt: string;
};

export type ScoreableDateRange = {
        scoreableFrom: string;
        scoreableTo: string;
};

let connectionPromise: Promise<DuckDBConnection> | undefined;
let singleAnalyticsFilePath: string | undefined;

/**
 * Opens the dbt-built mart read-only. The application never writes here:
 * `npm run analytics:build` is the only producer.
 */
function getConnection(analyticsFilePath: string): Promise<DuckDBConnection>
{
        const analyticsPath = resolve(analyticsFilePath);

        if (connectionPromise)
        {
                if (singleAnalyticsFilePath !== analyticsPath)
                {
                        throw new Error(`Analytics singleton already initialized for ${singleAnalyticsFilePath}`);
                }

                return connectionPromise;
        }

        connectionPromise = DuckDBInstance.create(analyticsPath, { access_mode: "READ_ONLY" })
                .then((instance) => instance.connect())
                .catch((error: unknown) =>
                {
                        throw new Error(`Could not open the analytics database at ${analyticsPath}. Run \`npm run analytics:build\` to create it. (${String(error)})`);
                });

        singleAnalyticsFilePath = analyticsPath;

        return connectionPromise;
}

/**
 * Dates are cast to VARCHAR in every query so DuckDB's own date and timestamp
 * wrappers never leak past this module, and counts to BIGINT columns are
 * narrowed to numbers here rather than at each call site.
 */
function toNumber(value: unknown): number
{
        return Number(value);
}

export function mkCloseAnalytics(args: AnalyticsArgs)
{
        return async () =>
        {
                if (!connectionPromise)
                {
                        return;
                }

                const connection = await connectionPromise;

                connection.closeSync();

                connectionPromise = undefined;
                singleAnalyticsFilePath = undefined;
        };
}

/**
 * Reads one precomputed row of the trailing-window metrics.
 *
 * Returns undefined when the mart holds no row for that pair, which means
 * either an unknown user or a date whose scoring window is not fully covered
 * by observed data. `dim_as_of_date` deliberately omits the latter rather than
 * emitting zero-filled metrics.
 */
export function mkGetUserDailyMetrics(args: AnalyticsArgs)
{
        return async (userId: string, asOfDate: string): Promise<UserDailyMetrics | undefined> =>
        {
                const connection = await getConnection(args.analyticsFilePath);

                const reader = await connection.runAndReadAll(
                        `
      SELECT
        income_month_count,
        total_income_cents,
        total_essential_expenses_cents,
        essential_category_month_count,
        essential_category_count,
        savings_month_count,
        late_fee_event_count,
        total_spending_debit_cents,
        total_high_risk_debit_cents,
        negative_balance_day_count,
        window_start_date::VARCHAR AS window_start_date,
        window_end_date::VARCHAR AS window_end_date,
        built_at::VARCHAR AS built_at
      FROM fct_user_daily_metrics
      WHERE user_id = ?
        AND as_of_date = ?::DATE
    `,
                        [userId, asOfDate],
                );

                const [row] = reader.getRowObjects();

                if (!row)
                {
                        return undefined;
                }

                return {
                        incomeMonthCount: toNumber(row.income_month_count),
                        totalIncomeCents: toNumber(row.total_income_cents),
                        totalEssentialExpensesCents: toNumber(row.total_essential_expenses_cents),
                        essentialCategoryMonthCount: toNumber(row.essential_category_month_count),
                        essentialCategoryCount: toNumber(row.essential_category_count),
                        savingsMonthCount: toNumber(row.savings_month_count),
                        lateFeeEventCount: toNumber(row.late_fee_event_count),
                        totalSpendingDebitCents: toNumber(row.total_spending_debit_cents),
                        totalHighRiskDebitCents: toNumber(row.total_high_risk_debit_cents),
                        negativeBalanceDayCount: toNumber(row.negative_balance_day_count),
                        windowStartDate: String(row.window_start_date),
                        windowEndDate: String(row.window_end_date),
                        builtAt: String(row.built_at),
                };
        };
}

/**
 * The span of dates the mart can answer for, used to explain a 404.
 */
export function mkGetScoreableDateRange(args: AnalyticsArgs)
{
        return async (): Promise<ScoreableDateRange | undefined> =>
        {
                const connection = await getConnection(args.analyticsFilePath);

                const reader = await connection.runAndReadAll(`
      SELECT
        min(as_of_date)::VARCHAR AS scoreable_from,
        max(as_of_date)::VARCHAR AS scoreable_to
      FROM fct_user_daily_metrics
    `);

                const [row] = reader.getRowObjects();

                if (!row?.scoreable_from || !row?.scoreable_to)
                {
                        return undefined;
                }

                return {
                        scoreableFrom: String(row.scoreable_from),
                        scoreableTo: String(row.scoreable_to),
                };
        };
}
