import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { test } from "node:test";
import Database from "better-sqlite3";
import { mkCloseDatabase } from "../src/database.js";
import { mkSyncUser } from "../src/packages/sync-user.js";
import { createTempDatabase } from "./create-temp-database.js";

test("reports duplicate transactions when syncing a user twice", async (t) => {
        const { testDirectory, databaseFilePath } = await createTempDatabase();
        const args = {
                bankingApiBaseUrl: "https://btq03nn21b.execute-api.eu-central-1.amazonaws.com/",
                databaseFilePath,
        };
        const syncUser = mkSyncUser(args);
        const closeDatabase = mkCloseDatabase(args);

        t.after(() => {
                closeDatabase();
                rmSync(testDirectory, { recursive: true, force: true });
        });

        const firstResult = await syncUser("user_1001");

        assert.deepEqual(firstResult, {
                user_id: "user_1001",
                synced_accounts: 2,
                new_transactions: 631,
                duplicate_transactions: 0,
                synced_from: "2025-09-01",
        });

        const secondResult = await syncUser("user_1001");

        assert.deepEqual(secondResult, {
                user_id: "user_1001",
                synced_accounts: 2,
                new_transactions: 0,
                duplicate_transactions: 631,
                synced_from: "2025-09-01",
        });

        const database = new Database(databaseFilePath, { readonly: true });

        try {
                assert.equal(database.prepare("SELECT COUNT(*) FROM accounts WHERE user_id = ?").pluck().get("user_1001"), 2);
                assert.equal(database.prepare("SELECT COUNT(*) FROM transactions").pluck().get(), 631);
        } finally {
                database.close();
        }
});
