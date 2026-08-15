import Database from "better-sqlite3";
import { resolve } from "node:path";
import type { Account, Transaction } from "./banking/index.js";

export type DatabaseArgs = {
  databaseFilePath: string;
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
