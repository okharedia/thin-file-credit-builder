import Database from "better-sqlite3";
import { resolve } from "node:path";
import type { Account, Transaction } from "./banking/index.js";

export type DatabaseArgs = {
  databaseFilePath: string;
};

export type IncomeRegularityArgs = {
  userId: string;
  from: string;
  monthCount: number;
  incomeCategoryCodes: readonly string[];
};

export type IncomeRegularity = {
  windowStart: string;
  windowEnd: string;
  monthsWithIncome: number;
  incomeRegularity: number;
  points: number;
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

export function mkGetIncomeRegularity(args: DatabaseArgs) {
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
        *,
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
    income_transactions AS (
      SELECT t.transaction_date
      FROM scoring_window
      JOIN accounts AS a
        ON a.user_id = scoring_window.user_id
      JOIN transactions AS t
        ON t.account_id = a.id
      WHERE t.transaction_date
        BETWEEN scoring_window.window_start AND scoring_window.window_end
        AND (
          t.type = 'credit'
          OR t.merchant_category_code IN (
            SELECT code FROM income_category_codes
          )
        )
    ),
    income_summary AS (
      SELECT
        COUNT(DISTINCT substr(transaction_date, 1, 7))
          AS months_with_income
      FROM income_transactions
    )
    SELECT
      scoring_window.window_start AS "windowStart",
      scoring_window.window_end AS "windowEnd",
      income_summary.months_with_income AS "monthsWithIncome",
      income_summary.months_with_income * 1.0
        / scoring_window.month_count AS "incomeRegularity",
      CAST(
        ROUND(
          income_summary.months_with_income * 25.0
            / scoring_window.month_count
        ) AS INTEGER
      ) AS points
    FROM scoring_window
    CROSS JOIN income_summary
  `);

  return ({
    userId,
    from,
    monthCount,
    incomeCategoryCodes,
  }: IncomeRegularityArgs): IncomeRegularity => {
    if (!Number.isSafeInteger(monthCount) || monthCount < 1) {
      throw new RangeError("monthCount must be a positive integer");
    }

    return statement.get({
      userId,
      from,
      monthCount,
      incomeCategoryCodesJson: JSON.stringify(incomeCategoryCodes),
    }) as IncomeRegularity;
  };
}
