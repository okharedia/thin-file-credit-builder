import Database from "better-sqlite3";
import { resolve } from "node:path";
import type { Account, Transaction } from "./banking/index.js";
import { formatIsoDate } from "./iso-date.js";

export type DatabaseArgs = {
        databaseFilePath: string;
};

export type InclusiveDateRange = {
        startDate: Date;
        endDate: Date;
};

export type AccountDailyBalancesArgs = InclusiveDateRange & {
        accountId: string;
        closingBalanceCents: number;
};

export type AccountDailyBalance = {
        day: string;
        endOfDayBalanceCents: number;
};

export type StoredUserAccount = {
        id: string;
        type: Account["type"];
        balanceCents: number;
};

export type CheckingAccountNegativeBalanceDayCountsArgs = InclusiveDateRange & {
        userId: string;
};

export type AccountNegativeBalanceDayCount = {
        accountId: string;
        negativeBalanceDayCount: number;
};

export type ReliabilityMetricsArgs = InclusiveDateRange & {
        userId: string;
        incomeCategoryCodes: readonly string[];
        essentialCategoryCodes: readonly string[];
        savingsCategoryCodes: readonly string[];
        feeCategoryCodes: readonly string[];
        highRiskCategoryCodes: readonly string[];
};

export type ReliabilityMetrics = {
        incomeMonthCount: number;
        totalIncomeCents: number;
        totalEssentialExpensesCents: number;
        essentialCategoryMonthCount: number;
        essentialCategoryCount: number;
        savingsMonthCount: number;
        lateFeeEventCount: number;
        totalSpendingDebitCents: number;
        totalHighRiskDebitCents: number;
};

let database: Database.Database | undefined;
let singleDatabaseFilePath: string | undefined;

function getDatabase(databaseFilePath: string): Database.Database {
        const databasePath = resolve(databaseFilePath);

        if (database) {
                if (singleDatabaseFilePath !== databasePath) {
                        throw new Error(`Database singleton already initialized for ${singleDatabaseFilePath}`);
                }

                return database;
        }

        database = new Database(databasePath, { fileMustExist: true });
        database.pragma("foreign_keys = ON");
        singleDatabaseFilePath = databasePath;

        return database;
}

function toCents(amount: number): number {
        return Math.round(amount * 100);
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
                const values = accounts.flatMap((account) => [account.id, account.user_id, account.type, account.currency, toCents(account.balance), account.name]);

                database.prepare(
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
                ).run(...values);
        };
}

export function mkListAccountIds(args: DatabaseArgs) {
        const database = getDatabase(args.databaseFilePath);

        return (userId: string): string[] => {
                return database.prepare("SELECT id FROM accounts WHERE user_id = ?").pluck().all(userId) as string[];
        };
}

export function mkListUserAccounts(args: DatabaseArgs) {
        const database = getDatabase(args.databaseFilePath);
        const statement = database.prepare(`
    SELECT
      id,
      type,
      balance_cents AS "balanceCents"
    FROM accounts
    WHERE user_id = ?
    ORDER BY id
  `);

        return (userId: string): StoredUserAccount[] => {
                return statement.all(userId) as StoredUserAccount[];
        };
}

export function mkSaveTransactions(args: DatabaseArgs) {
        const database = getDatabase(args.databaseFilePath);

        return (transactions: Transaction[]): number => {
                if (transactions.length === 0) {
                        return 0;
                }

                const placeholders = transactions.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
                const values = transactions.flatMap((transaction) => [transaction.id, transaction.account_id, toCents(transaction.amount), transaction.currency, formatIsoDate(transaction.date), transaction.description, transaction.merchant_category_code, transaction.merchant_name, transaction.type]);

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
      `,
                        )
                        .run(...values);

                return inserted.changes;
        };
}

export function mkListAccountDailyBalances(args: DatabaseArgs) {
        const database = getDatabase(args.databaseFilePath);
        const statement = database.prepare(`
    WITH RECURSIVE
    days(day) AS (
      SELECT @startDate
      WHERE @startDate <= @endDate

      UNION ALL

      SELECT date(day, '+1 day')
      FROM days
      WHERE day < @endDate
    ),
    daily_transactions AS (
      SELECT
        t.transaction_date AS day,
        SUM(t.amount_cents) AS daily_net_cents
      FROM transactions AS t
      WHERE t.account_id = @accountId
        AND t.transaction_date BETWEEN @startDate AND @endDate
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

        return ({ accountId, startDate, endDate, closingBalanceCents }: AccountDailyBalancesArgs): AccountDailyBalance[] => {
                return statement.all({
                        accountId,
                        startDate: formatIsoDate(startDate),
                        endDate: formatIsoDate(endDate),
                        closingBalanceCents,
                }) as AccountDailyBalance[];
        };
}

export function mkListCheckingAccountNegativeBalanceDayCounts(args: DatabaseArgs) {
        const listUserAccounts = mkListUserAccounts(args);
        const listAccountDailyBalances = mkListAccountDailyBalances(args);

        return ({ userId, startDate, endDate }: CheckingAccountNegativeBalanceDayCountsArgs): AccountNegativeBalanceDayCount[] => {
                return listUserAccounts(userId)
                        .filter((account) => account.type === "checking")
                        .map((account) => ({
                                accountId: account.id,
                                negativeBalanceDayCount: listAccountDailyBalances({
                                        accountId: account.id,
                                        startDate,
                                        endDate,
                                        closingBalanceCents: account.balanceCents,
                                }).filter(({ endOfDayBalanceCents }) => endOfDayBalanceCents < 0).length,
                        }));
        };
}

export function mkGetCheckingAccountNegativeBalanceDayCount(args: DatabaseArgs) {
        const listCheckingAccountNegativeBalanceDayCounts = mkListCheckingAccountNegativeBalanceDayCounts(args);

        return (query: CheckingAccountNegativeBalanceDayCountsArgs): number => {
                return listCheckingAccountNegativeBalanceDayCounts(query).reduce((total, account) => total + account.negativeBalanceDayCount, 0);
        };
}

export function mkGetReliabilityMetrics(args: DatabaseArgs) {
        const database = getDatabase(args.databaseFilePath);
        const statement = database.prepare(`
    WITH
    income_category_codes AS (
      SELECT CAST(value AS TEXT) AS code
      FROM json_each(@incomeCategoryCodesJson)
    ),
    essential_category_codes AS (
      SELECT CAST(value AS TEXT) AS code
      FROM json_each(@essentialCategoryCodesJson)
    ),
    savings_category_codes AS (
      SELECT CAST(value AS TEXT) AS code
      FROM json_each(@savingsCategoryCodesJson)
    ),
    fee_category_codes AS (
      SELECT CAST(value AS TEXT) AS code
      FROM json_each(@feeCategoryCodesJson)
    ),
    high_risk_category_codes AS (
      SELECT CAST(value AS TEXT) AS code
      FROM json_each(@highRiskCategoryCodesJson)
    ),
    flagged_transactions AS (
      SELECT
        t.transaction_date,
        t.amount_cents,
        t.merchant_category_code,
        (
          t.type = 'credit'
          OR t.merchant_category_code IN (
            SELECT code FROM income_category_codes
          )
        )
          AND t.merchant_category_code NOT IN (
            SELECT code FROM savings_category_codes
          ) AS is_income,
        t.type = 'debit'
          AND t.merchant_category_code NOT IN (
            SELECT code FROM savings_category_codes
          ) AS is_spending_debit,
        t.merchant_category_code IN (
          SELECT code FROM essential_category_codes
        ) AS is_essential_expense,
        t.merchant_category_code IN (
          SELECT code FROM savings_category_codes
        ) AS is_savings,
        t.merchant_category_code IN (
          SELECT code FROM fee_category_codes
        ) AS is_late_fee,
        t.merchant_category_code IN (
          SELECT code FROM high_risk_category_codes
        ) AS is_high_risk
      FROM accounts AS a
      JOIN transactions AS t
        ON t.account_id = a.id
      WHERE a.user_id = @userId
        AND t.transaction_date BETWEEN @startDate AND @endDate
    ),
    metrics AS (
      SELECT
        COUNT(DISTINCT substr(transaction_date, 1, 7))
          FILTER (WHERE is_income) AS months_with_income,
        COALESCE(
          SUM(amount_cents)
            FILTER (WHERE is_income),
          0
        ) AS total_income_cents,
        COALESCE(
          SUM(-amount_cents)
            FILTER (WHERE is_essential_expense),
          0
        ) AS total_essential_expenses_cents,
        COUNT(
          DISTINCT merchant_category_code || ':' || substr(transaction_date, 1, 7)
        ) FILTER (WHERE is_essential_expense) AS essential_category_months,
        COUNT(DISTINCT substr(transaction_date, 1, 7))
          FILTER (
            WHERE is_savings AND amount_cents > 0
          ) AS months_with_savings,
        COUNT(*)
          FILTER (WHERE is_late_fee) AS late_fee_events,
        COALESCE(
          SUM(-amount_cents)
            FILTER (WHERE is_spending_debit),
          0
        ) AS total_spending_debit_cents,
        COALESCE(
          SUM(-amount_cents)
            FILTER (WHERE is_spending_debit AND is_high_risk),
          0
        ) AS high_risk_debit_cents
      FROM flagged_transactions
    )
    SELECT
      metrics.months_with_income AS "incomeMonthCount",
      metrics.total_income_cents AS "totalIncomeCents",
      metrics.total_essential_expenses_cents
        AS "totalEssentialExpensesCents",
      metrics.essential_category_months
        AS "essentialCategoryMonthCount",
      (SELECT COUNT(DISTINCT code) FROM essential_category_codes)
        AS "essentialCategoryCount",
      metrics.months_with_savings AS "savingsMonthCount",
      metrics.late_fee_events AS "lateFeeEventCount",
      metrics.total_spending_debit_cents AS "totalSpendingDebitCents",
      metrics.high_risk_debit_cents AS "totalHighRiskDebitCents"
    FROM metrics
  `);

        return ({ userId, startDate, endDate, incomeCategoryCodes, essentialCategoryCodes, savingsCategoryCodes, feeCategoryCodes, highRiskCategoryCodes }: ReliabilityMetricsArgs): ReliabilityMetrics => {
                return statement.get({
                        userId,
                        startDate: formatIsoDate(startDate),
                        endDate: formatIsoDate(endDate),
                        incomeCategoryCodesJson: JSON.stringify(incomeCategoryCodes),
                        essentialCategoryCodesJson: JSON.stringify(essentialCategoryCodes),
                        savingsCategoryCodesJson: JSON.stringify(savingsCategoryCodes),
                        feeCategoryCodesJson: JSON.stringify(feeCategoryCodes),
                        highRiskCategoryCodesJson: JSON.stringify(highRiskCategoryCodes),
                }) as ReliabilityMetrics;
        };
}
