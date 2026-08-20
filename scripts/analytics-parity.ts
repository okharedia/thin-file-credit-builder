// Proves fct_user_daily_metrics agrees with the application queries it is
// meant to replace.
//
// The nine transaction-derived metrics must match exactly; any difference
// fails the run. negative_balance_day_count is reported separately because
// the mart deliberately does not reproduce the window-truncated balance
// reconstruction in mkListAccountDailyBalances -- see analytics/README.md.
//
//   npm run analytics:parity

import { DuckDBInstance } from "@duckdb/node-api";
import { codesInGroup } from "../src/banking/index.js";
import { mkGetCheckingAccountNegativeBalanceDayCount, mkGetReliabilityMetrics, mkListMerchantCategories } from "../src/database.js";
import { getScoringWindow } from "../src/utils/scoring-window.js";
import type { ReliabilityMetrics } from "../src/database.js";

const SCORING_WINDOW_MONTH_COUNT = 6;
const NEGATIVE_BALANCE_DAY_CAP = 10;

const analyticsPath = process.env.ANALYTICS_DUCKDB_PATH ?? "./data/analytics.duckdb";
const databaseFilePath = process.env.DATABASE_PATH ?? "./data/thin-file-credit-builder.sqlite";
const sampleSize = Number(process.env.PARITY_SAMPLE_SIZE ?? 200);

const COMPARED_METRICS: (keyof ReliabilityMetrics)[] = [
        "incomeMonthCount",
        "totalIncomeCents",
        "totalEssentialExpensesCents",
        "essentialCategoryMonthCount",
        "essentialCategoryCount",
        "savingsMonthCount",
        "lateFeeEventCount",
        "totalSpendingDebitCents",
        "totalHighRiskDebitCents",
];

const MART_COLUMN: Record<keyof ReliabilityMetrics, string> = {
        incomeMonthCount: "income_month_count",
        totalIncomeCents: "total_income_cents",
        totalEssentialExpensesCents: "total_essential_expenses_cents",
        essentialCategoryMonthCount: "essential_category_month_count",
        essentialCategoryCount: "essential_category_count",
        savingsMonthCount: "savings_month_count",
        lateFeeEventCount: "late_fee_event_count",
        totalSpendingDebitCents: "total_spending_debit_cents",
        totalHighRiskDebitCents: "total_high_risk_debit_cents",
};

const databaseArgs = { databaseFilePath };
const getReliabilityMetrics = mkGetReliabilityMetrics(databaseArgs);
const getCheckingAccountNegativeBalanceDayCount = mkGetCheckingAccountNegativeBalanceDayCount(databaseArgs);
const categories = mkListMerchantCategories(databaseArgs)();

const categoryCodes = {
        incomeCategoryCodes: codesInGroup(categories, "income"),
        essentialCategoryCodes: codesInGroup(categories, "essential"),
        savingsCategoryCodes: codesInGroup(categories, "savings"),
        feeCategoryCodes: codesInGroup(categories, "fees"),
        highRiskCategoryCodes: codesInGroup(categories, "high_risk"),
};

const instance = await DuckDBInstance.create(analyticsPath, { access_mode: "READ_ONLY" });
const connection = await instance.connect();

// An even stride over the ordered mart, rather than random sampling: the same
// build always compares the same rows, and every user and every part of the
// date range is represented.
const reader = await connection.runAndReadAll(`
  WITH ordered AS (
    SELECT
      *,
      row_number() OVER (ORDER BY user_id, as_of_date) AS row_number,
      count(*) OVER () AS total_rows
    FROM fct_user_daily_metrics
  )
  SELECT *
  FROM ordered
  WHERE row_number % greatest(1, (total_rows / ${sampleSize})::BIGINT) = 0
  ORDER BY user_id, as_of_date
  LIMIT ${sampleSize}
`);

const martRows = reader.getRowObjects();

if (martRows.length === 0)
{
        console.error("No rows in fct_user_daily_metrics. Run `npm run analytics:build` first.");
        process.exit(1);
}

const mismatchesByMetric = new Map<string, number>();
const firstExample = new Map<string, string>();

let negativeBalanceDivergence = 0;
let scoreAffectingDivergence = 0;
let largestPointSwing = 0;

for (const martRow of martRows)
{
        const userId = String(martRow.user_id);
        const asOfDate = String(martRow.as_of_date);
        const { startDate, endDate } = getScoringWindow(new Date(`${asOfDate}T00:00:00`), SCORING_WINDOW_MONTH_COUNT);

        const applicationMetrics = getReliabilityMetrics({ userId, startDate, endDate, ...categoryCodes });

        for (const metric of COMPARED_METRICS)
        {
                const martValue = Number(martRow[MART_COLUMN[metric]]);
                const applicationValue = Number(applicationMetrics[metric]);

                if (martValue !== applicationValue)
                {
                        mismatchesByMetric.set(metric, (mismatchesByMetric.get(metric) ?? 0) + 1);

                        if (!firstExample.has(metric))
                        {
                                firstExample.set(metric, `${userId} @ ${asOfDate}: dbt=${martValue} app=${applicationValue}`);
                        }
                }
        }

        const martNegativeDays = Number(martRow.negative_balance_day_count);
        const applicationNegativeDays = getCheckingAccountNegativeBalanceDayCount({ userId, startDate, endDate });

        if (martNegativeDays !== applicationNegativeDays)
        {
                negativeBalanceDivergence += 1;

                const pointSwing = Math.abs(Math.min(martNegativeDays, NEGATIVE_BALANCE_DAY_CAP) - Math.min(applicationNegativeDays, NEGATIVE_BALANCE_DAY_CAP));

                if (pointSwing > 0)
                {
                        scoreAffectingDivergence += 1;
                        largestPointSwing = Math.max(largestPointSwing, pointSwing);
                }
        }
}

console.log(`Compared ${martRows.length} (user, as_of_date) pairs against the application queries.\n`);

for (const metric of COMPARED_METRICS)
{
        const count = mismatchesByMetric.get(metric) ?? 0;
        const example = count > 0 ? `   e.g. ${firstExample.get(metric)}` : "";

        console.log(`  [${count === 0 ? "OK  " : "FAIL"}] ${metric.padEnd(30)} mismatches: ${count}${example}`);
}

console.log(`\n  [INFO] negativeBalanceDayCount        diverges on ${negativeBalanceDivergence}/${martRows.length} windows`);
console.log(`         of those, ${scoreAffectingDivergence} change resilience points (largest swing: ${largestPointSwing})`);
console.log("         Expected: the mart fixes the window-truncated reconstruction. See analytics/README.md.");

if (mismatchesByMetric.size > 0)
{
        console.error("\nParity FAILED: the mart disagrees with the application on a metric it must reproduce exactly.");
        process.exit(1);
}

console.log("\nParity OK: all transaction-derived metrics match exactly.");
