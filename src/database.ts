import Database from "better-sqlite3";
import { resolve } from "node:path";
import type { Account, Transaction } from "./banking/index.js";

export type DatabaseArgs = {
  databaseFilePath: string;
};

export type AccountDailyBalancesArgs = {
  accountId: string;
  startDate: string;
  endDate: string;
  closingBalanceCents: number;
};

export type AccountDailyBalance = {
  day: string;
  endOfDayBalanceCents: number;
};

export type ReliabilityMetricsArgs = {
  userId: string;
  from: string;
  monthCount: number;
  incomeCategoryCodes: readonly string[];
  essentialCategoryCodes: readonly string[];
};

export type ReliabilityMetrics = {
  windowStart: string;
  windowEnd: string;
  monthsWithIncome: number;
  incomeRegularity: number;
  incomeCoverageRatio: number | null;
  essentialPaymentsConsistency: number | null;
  incomeRegularityPoints: number;
};

let database: Database.Database | undefined;
let singleDatabaseFilePath: string | undefined;

function getDatabase(databaseFilePath: string): Database.Database {
  const databasePath = resolve(databaseFilePath);

  if (database) {
    if (singleDatabaseFilePath !== databasePath) {
      throw new Error(
        `Database singleton already initialized for ${singleDatabaseFilePath}`,
      );
    }

    return database;
  }

  database = new Database(databasePath, { fileMustExist: true });
  database.pragma("foreign_keys = ON");
  singleDatabaseFilePath = databasePath;

  return database;
}

export function mkCloseDatabase(args: DatabaseArgs) {
  const databaseConnection = getDatabase(args.databaseFilePath);

  return () => {
    if (databaseConnection.open) {
      databaseConnection.close();
    }

    if (database === databaseConnection) {
      database = undefined;
      singleDatabaseFilePath = undefined;
    }
  };
}

export function mkSaveAccounts(args: DatabaseArgs) {
  const database = getDatabase(args.databaseFilePath);

  return (accounts: Account[]) => {
    if (accounts.length === 0) {
      return;
    }

    const placeholders = accounts.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
    const values = accounts.flatMap((account) => [
      account.id,
      account.user_id,
      account.type,
      account.currency,
      Math.round(account.balance * 100),
      account.name,
    ]);

    database
      .prepare(
        `
        INSERT INTO accounts (
          id,
          user_id,
          type,
          currency,
          balance_cents,
          name
        )
        VALUES ${placeholders}
        ON CONFLICT(id) DO UPDATE SET
          user_id = excluded.user_id,
          type = excluded.type,
          currency = excluded.currency,
          balance_cents = excluded.balance_cents,
          name = excluded.name
      `,
      )
      .run(...values);
  };
}

export function mkListAccountIds(args: DatabaseArgs) {
  const database = getDatabase(args.databaseFilePath);

  return (userId: string): string[] => {
    return database
      .prepare("SELECT id FROM accounts WHERE user_id = ?")
      .pluck()
      .all(userId) as string[];
  };
}

export function mkSaveTransactions(args: DatabaseArgs) {
  const database = getDatabase(args.databaseFilePath);

  return (transactions: Transaction[]): number => {
    if (transactions.length === 0) {
      return 0;
    }

    const placeholders = transactions
      .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .join(", ");
    const values = transactions.flatMap((transaction) => [
      transaction.id,
      transaction.account_id,
      Math.round(transaction.amount * 100),
      transaction.currency,
      transaction.date,
      transaction.description,
      transaction.merchant_category_code,
      transaction.merchant_name,
      transaction.type,
    ]);

    const inserted = database
      .prepare(
        `
        INSERT INTO transactions (
          id,
          account_id,
          amount_cents,
          currency,
          transaction_date,
          description,
          merchant_category_code,
          merchant_name,
          type
        )
        VALUES ${placeholders}
        ON CONFLICT(id) DO NOTHING
        RETURNING id
      `,
      )
      .all(...values);

    return inserted.length;
  };
}

export function mkListAccountDailyBalances(args: DatabaseArgs) {
  const database = getDatabase(args.databaseFilePath);
  const statement = database.prepare(`
    WITH RECURSIVE
    configuration AS (
      SELECT
        date(@startDate) AS start_date,
        date(@endDate) AS end_date
    ),
    days(day) AS (
      SELECT start_date
      FROM configuration
      WHERE start_date <= end_date

      UNION ALL

      SELECT date(day, '+1 day')
      FROM days
      CROSS JOIN configuration
      WHERE day < end_date
    ),
    daily_transactions AS (
      SELECT
        t.transaction_date AS day,
        SUM(t.amount_cents) AS daily_net_cents
      FROM transactions AS t
      CROSS JOIN configuration
      WHERE t.account_id = @accountId
        AND t.transaction_date BETWEEN start_date AND end_date
      GROUP BY t.transaction_date
    ),
    daily AS (
      SELECT
        days.day,
        COALESCE(daily_transactions.daily_net_cents, 0)
          AS daily_net_cents
      FROM days
      LEFT JOIN daily_transactions
        ON daily_transactions.day = days.day
    ),
    balances AS (
      SELECT
        daily.day,
        @closingBalanceCents
          - COALESCE(
              SUM(daily.daily_net_cents) OVER (
                ORDER BY daily.day DESC
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ),
              0
            ) AS end_of_day_balance_cents
      FROM daily
    )
    SELECT
      day,
      end_of_day_balance_cents AS "endOfDayBalanceCents"
    FROM balances
    ORDER BY day
  `);

  return ({
    accountId,
    startDate,
    endDate,
    closingBalanceCents,
  }: AccountDailyBalancesArgs): AccountDailyBalance[] => {
    return statement.all({
      accountId,
      startDate,
      endDate,
      closingBalanceCents,
    }) as AccountDailyBalance[];
  };
}

export function mkGetReliabilityMetrics(args: DatabaseArgs) {
  const database = getDatabase(args.databaseFilePath);
  const statement = database.prepare(`
    WITH
    configuration AS (
      SELECT
        @userId AS user_id,
        @from AS window_end,
        @monthCount AS month_count
    ),
    scoring_window AS (
      SELECT
        user_id,
        window_end,
        month_count,
        date(
          window_end,
          'start of month',
          printf('-%d months', month_count - 1)
        ) AS window_start
      FROM configuration
    ),
    income_category_codes AS (
      SELECT CAST(value AS TEXT) AS code
      FROM json_each(@incomeCategoryCodesJson)
    ),
    essential_category_codes AS (
      SELECT CAST(value AS TEXT) AS code
      FROM json_each(@essentialCategoryCodesJson)
    ),
    scoring_transactions AS (
      SELECT
        t.transaction_date,
        t.amount_cents,
        t.merchant_category_code,
        t.type = 'credit'
          OR t.merchant_category_code IN (
            SELECT code FROM income_category_codes
          ) AS is_income,
        t.type = 'debit'
          AND t.merchant_category_code IN (
            SELECT code FROM essential_category_codes
          ) AS is_essential_expense
      FROM scoring_window
      JOIN accounts AS a
        ON a.user_id = scoring_window.user_id
      JOIN transactions AS t
        ON t.account_id = a.id
      WHERE t.transaction_date
        BETWEEN scoring_window.window_start AND scoring_window.window_end
    ),
    metric_totals AS (
      SELECT
        COUNT(DISTINCT substr(transaction_date, 1, 7))
          FILTER (WHERE is_income) AS months_with_income,
        COALESCE(
          SUM(amount_cents)
            FILTER (WHERE amount_cents > 0 AND is_income),
          0
        ) AS total_income_cents,
        COALESCE(
          SUM(-amount_cents)
            FILTER (WHERE is_essential_expense),
          0
        ) AS total_essential_expenses_cents,
        COUNT(
          DISTINCT merchant_category_code || ':' || substr(transaction_date, 1, 7)
        ) FILTER (WHERE is_essential_expense) AS essential_category_months
      FROM scoring_transactions
    ),
    essential_category_summary AS (
      SELECT COUNT(DISTINCT code) AS essential_category_count
      FROM essential_category_codes
    ),
    metrics AS (
      SELECT
        metric_totals.months_with_income,
        metric_totals.essential_category_months,
        essential_category_summary.essential_category_count,
        metric_totals.total_income_cents * 1.0
          / NULLIF(metric_totals.total_essential_expenses_cents, 0)
          AS income_coverage_ratio
      FROM metric_totals
      CROSS JOIN essential_category_summary
    )
    SELECT
      scoring_window.window_start AS "windowStart",
      scoring_window.window_end AS "windowEnd",
      metrics.months_with_income AS "monthsWithIncome",
      metrics.months_with_income * 1.0
        / scoring_window.month_count AS "incomeRegularity",
      metrics.income_coverage_ratio AS "incomeCoverageRatio",
      metrics.essential_category_months * 1.0
        / NULLIF(
          scoring_window.month_count * metrics.essential_category_count,
          0
        ) AS "essentialPaymentsConsistency",
      CAST(
        ROUND(
          metrics.months_with_income * 25.0
            / scoring_window.month_count
        ) AS INTEGER
      ) AS "incomeRegularityPoints"
    FROM scoring_window
    CROSS JOIN metrics
  `);

  return ({
    userId,
    from,
    monthCount,
    incomeCategoryCodes,
    essentialCategoryCodes,
  }: ReliabilityMetricsArgs): ReliabilityMetrics => {
    if (!Number.isSafeInteger(monthCount) || monthCount < 1) {
      throw new RangeError("monthCount must be a positive integer");
    }

    return statement.get({
      userId,
      from,
      monthCount,
      incomeCategoryCodesJson: JSON.stringify(incomeCategoryCodes),
      essentialCategoryCodesJson: JSON.stringify(essentialCategoryCodes),
    }) as ReliabilityMetrics;
  };
}
