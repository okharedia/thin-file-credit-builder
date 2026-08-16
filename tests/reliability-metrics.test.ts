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
  mkGetReliabilityMetrics,
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
  merchantCategoryCode = "0000",
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

test("calculates reliability metrics from stored transactions", async (t) => {
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
  const getReliabilityMetrics = mkGetReliabilityMetrics(databaseArgs);

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
    transaction("october-savings", "2025-10-25", 50, "6540"),
    transaction("october-savings-transfer", "2025-10-26", -20, "6540"),
    transaction("november-debit", "2025-11-10", -100, "5812"),
    transaction("november-high-risk", "2025-11-15", -50, "7995"),
    transaction("december-debit", "2025-12-10", -100, "5812"),
    transaction("december-late-fee", "2025-12-15", -10, "6012"),
    transaction("january-debit", "2026-01-10", -100, "5812"),
    transaction("small-essential", "2026-01-15", -100, "4900"),
    transaction("february-savings", "2026-02-10", 50, "6540"),
    transaction("window-end", "2026-02-20", 100),
    transaction("after-window", "2026-02-21", 100),
  ]);

  const baseArgs = {
    userId: account.user_id,
    startDate: "2025-09-01",
    endDate: "2026-02-20",
    incomeCategoryCodes: ["9001", "9002"],
    savingsCategoryCodes: ["6540"],
    feeCategoryCodes: ["6012"],
    highRiskCategoryCodes: ["7995", "6051"],
  } as const;
  const cases = [
    {
      name: "calculates six-month metrics",
      args: { essentialCategoryCodes: ["5812"] },
      expected: {
        incomeMonthCount: 3,
        totalIncomeCents: 20_000,
        totalEssentialExpensesCents: 30_000,
        essentialCategoryMonthCount: 3,
        essentialCategoryCount: 1,
        savingsMonthCount: 2,
        lateFeeEventCount: 1,
        totalSpendingDebitCents: 56_000,
        totalHighRiskDebitCents: 5_000,
      },
    },
    {
      name: "supports a shorter scoring window",
      args: {
        startDate: "2025-12-01",
        essentialCategoryCodes: ["5812"],
      },
      expected: {
        incomeMonthCount: 1,
        totalIncomeCents: 10_000,
        totalEssentialExpensesCents: 20_000,
        essentialCategoryMonthCount: 2,
        essentialCategoryCount: 1,
        savingsMonthCount: 1,
        lateFeeEventCount: 1,
        totalSpendingDebitCents: 31_000,
        totalHighRiskDebitCents: 0,
      },
    },
    {
      name: "uses every essential category in the denominator",
      args: {
        essentialCategoryCodes: ["5812", "4900"],
      },
      expected: {
        incomeMonthCount: 3,
        totalIncomeCents: 20_000,
        totalEssentialExpensesCents: 40_000,
        essentialCategoryMonthCount: 4,
        essentialCategoryCount: 2,
        savingsMonthCount: 2,
        lateFeeEventCount: 1,
        totalSpendingDebitCents: 56_000,
        totalHighRiskDebitCents: 5_000,
      },
    },
    {
      name: "returns zero facts for unobserved essential categories",
      args: { essentialCategoryCodes: ["9999"] },
      expected: {
        incomeMonthCount: 3,
        totalIncomeCents: 20_000,
        totalEssentialExpensesCents: 0,
        essentialCategoryMonthCount: 0,
        essentialCategoryCount: 1,
        savingsMonthCount: 2,
        lateFeeEventCount: 1,
        totalSpendingDebitCents: 56_000,
        totalHighRiskDebitCents: 5_000,
      },
    },
    {
      name: "supports empty essential category configuration",
      args: { essentialCategoryCodes: [] },
      expected: {
        incomeMonthCount: 3,
        totalIncomeCents: 20_000,
        totalEssentialExpensesCents: 0,
        essentialCategoryMonthCount: 0,
        essentialCategoryCount: 0,
        savingsMonthCount: 2,
        lateFeeEventCount: 1,
        totalSpendingDebitCents: 56_000,
        totalHighRiskDebitCents: 5_000,
      },
    },
    {
      name: "returns zero debit facts without debit activity",
      args: {
        startDate: "2025-08-01",
        endDate: "2025-08-30",
        essentialCategoryCodes: ["5812"],
      },
      expected: {
        incomeMonthCount: 0,
        totalIncomeCents: 0,
        totalEssentialExpensesCents: 0,
        essentialCategoryMonthCount: 0,
        essentialCategoryCount: 1,
        savingsMonthCount: 0,
        lateFeeEventCount: 0,
        totalSpendingDebitCents: 0,
        totalHighRiskDebitCents: 0,
      },
    },
  ] as const;

  for (const testCase of cases) {
    await t.test(testCase.name, () => {
      assert.deepEqual(
        getReliabilityMetrics({ ...baseArgs, ...testCase.args }),
        testCase.expected,
      );
    });
  }

  await t.test("excludes savings transfers from high-risk spending", () => {
    const metrics = getReliabilityMetrics({
      ...baseArgs,
      essentialCategoryCodes: ["5812"],
      highRiskCategoryCodes: ["7995", "6540"],
    });

    assert.equal(metrics.totalHighRiskDebitCents, 5_000);
  });

  await t.test("counts essential category credits", () => {
    saveTransactions([
      transaction("october-essential-credit", "2025-10-16", 25, "5812"),
    ]);

    assert.deepEqual(
      getReliabilityMetrics({
        ...baseArgs,
        essentialCategoryCodes: ["5812"],
      }),
      {
        incomeMonthCount: 3,
        totalIncomeCents: 22_500,
        totalEssentialExpensesCents: 27_500,
        essentialCategoryMonthCount: 4,
        essentialCategoryCount: 1,
        savingsMonthCount: 2,
        lateFeeEventCount: 1,
        totalSpendingDebitCents: 56_000,
        totalHighRiskDebitCents: 5_000,
      },
    );
  });
});
