import Database from "better-sqlite3";
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Account, Transaction } from "../src/banking/index.js";
import {
  mkCloseDatabase,
  mkGetIncomeRegularity,
  mkSaveAccounts,
  mkSaveTransactions,
} from "../src/database.js";

const account: Account = {
  id: "account-1",
  user_id: "user-1",
  type: "checking",
  currency: "EUR",
  balance: 1_000,
  name: "Checking",
};

function transaction(
  id: string,
  date: string,
  amount = 100,
  merchantCategoryCode = "5812",
): Transaction {
  return {
    id,
    account_id: account.id,
    amount,
    currency: "EUR",
    date,
    description: "Test transaction",
    merchant_category_code: merchantCategoryCode,
    merchant_name: "Test merchant",
    type: amount > 0 ? "credit" : "debit",
  };
}

test("calculates income regularity from stored transactions", async (t) => {
  const testDirectory = await mkdtemp(join(tmpdir(), "credit-builder-test-"));
  const databaseFilePath = join(testDirectory, "test.sqlite");
  const schema = readFileSync(
    new URL("../db/init.sql", import.meta.url),
    "utf8",
  );
  const setupDatabase = new Database(databaseFilePath);
  setupDatabase.exec(schema);
  setupDatabase.close();

  const databaseArgs = { databaseFilePath };
  const closeDatabase = mkCloseDatabase(databaseArgs);
  const saveAccounts = mkSaveAccounts(databaseArgs);
  const saveTransactions = mkSaveTransactions(databaseArgs);
  const getIncomeRegularity = mkGetIncomeRegularity(databaseArgs);

  t.after(() => {
    closeDatabase();
    rmSync(testDirectory, { recursive: true, force: true });
  });

  saveAccounts([account]);
  saveTransactions([
    transaction("before-window", "2025-08-31", 100),
    transaction("september-income", "2025-09-01", -100, "9001"),
    transaction("october-credit", "2025-10-15", 100),
    transaction("october-second-credit", "2025-10-20", 100),
    transaction("november-debit", "2025-11-10", -100),
    transaction("december-debit", "2025-12-10", -100),
    transaction("january-debit", "2026-01-10", -100),
    transaction("window-end", "2026-02-20", 100),
    transaction("after-window", "2026-02-21", 100),
  ]);

  assert.deepEqual(
    getIncomeRegularity({
      userId: account.user_id,
      from: "2026-02-20",
      monthCount: 6,
      incomeCategoryCodes: ["9001", "9002"],
    }),
    {
      windowStart: "2025-09-01",
      windowEnd: "2026-02-20",
      monthsWithIncome: 3,
      incomeRegularity: 0.5,
      points: 13,
    },
  );

  assert.deepEqual(
    getIncomeRegularity({
      userId: account.user_id,
      from: "2026-02-20",
      monthCount: 3,
      incomeCategoryCodes: ["9001", "9002"],
    }),
    {
      windowStart: "2025-12-01",
      windowEnd: "2026-02-20",
      monthsWithIncome: 1,
      incomeRegularity: 1 / 3,
      points: 8,
    },
  );

  assert.throws(
    () =>
      getIncomeRegularity({
        userId: account.user_id,
        from: "2026-02-20",
        monthCount: 0,
        incomeCategoryCodes: [],
      }),
    new RangeError("monthCount must be a positive integer"),
  );
});
