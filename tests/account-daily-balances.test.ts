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
  mkListAccountDailyBalances,
  mkSaveAccounts,
  mkSaveTransactions,
} from "../src/database.js";

const account: Account = {
  id: "account-1",
  user_id: "user-1",
  type: "checking",
  currency: "EUR",
  balance: 100,
  name: "Checking",
};

function transaction(
  id: string,
  date: string,
  amountCents: number,
): Transaction {
  return {
    id,
    account_id: account.id,
    amount: amountCents / 100,
    currency: "EUR",
    date,
    description: "Test transaction",
    merchant_category_code: "5812",
    merchant_name: "Test merchant",
    type: amountCents > 0 ? "credit" : "debit",
  };
}

test("reconstructs daily account balances from the closing balance", async (t) => {
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
  const listAccountDailyBalances =
    mkListAccountDailyBalances(databaseArgs);

  t.after(() => {
    closeDatabase();
    rmSync(testDirectory, { recursive: true, force: true });
  });

  saveAccounts([account]);
  saveTransactions([
    transaction("before-window", "2025-12-31", -100),
    transaction("january-1", "2026-01-01", -100),
    transaction("january-2-debit", "2026-01-02", -100),
    transaction("january-2-credit", "2026-01-02", +50),
    transaction("january-4", "2026-01-04", +200),
    transaction("window-end", "2026-01-05", +100),
    transaction("after-window", "2026-01-06", -100),
  ]);

  const sortByDateDesc = (
    a: { day: string },
    b: { day: string },
  ) => b.day.localeCompare(a.day);

  // All amounts below are cents. We know the closing balance on January 5
  // is 200 and reconstruct each earlier end-of-day balance by removing the
  // following day's net transaction activity:
  //
  //   Jan 5:  200                         closing-balance anchor
  //   Jan 4:  200 - (+100 on Jan 5) = 100
  //   Jan 3:  100 - (+200 on Jan 4) = -100
  //   Jan 2: -100 - (   0 on Jan 3) = -100
  //   Jan 1: -100 - ( -50 on Jan 2) =  -50
  //
  // January 2's net is -50 because the -100 debit and +50 credit are
  // aggregated before balances are reconstructed. January 1's own -100
  // activity would be used to derive December 31's balance, which is outside
  // the requested range. The before-window and after-window transactions are
  // ignored entirely.
  assert.deepEqual(
    listAccountDailyBalances({
      accountId: account.id,
      startDate: "2026-01-01",
      endDate: "2026-01-05",
      closingBalanceCents: 200,
    }).sort(sortByDateDesc),
    [
      {
        day: "2026-01-05",
        endOfDayBalanceCents: 200,
      },
      {
        day: "2026-01-04",
        endOfDayBalanceCents: 100,
      },
      {
        day: "2026-01-03",
        endOfDayBalanceCents: -100,
      },
      {
        day: "2026-01-02",
        endOfDayBalanceCents: -100,
      },
      {
        day: "2026-01-01",
        endOfDayBalanceCents: -50,
      },
    ],
  );
});
