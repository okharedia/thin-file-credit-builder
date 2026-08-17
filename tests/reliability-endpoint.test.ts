import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { parseISO } from "date-fns";
import { buildApp } from "../src/app.js";
import type { Account, Transaction } from "../src/banking/index.js";
import { mkSaveAccounts, mkSaveTransactions } from "../src/database.js";
import { createTempDatabase } from "./create-temp-database.js";

const account: Account = {
        id: "checking-1",
        user_id: "user-1",
        type: "checking",
        currency: "EUR",
        balance: 1_000,
        name: "Checking",
};

function transaction(id: string, date: string, amount: number, merchantCategoryCode: string): Transaction
{
        return {
                id,
                account_id: account.id,
                amount,
                currency: "EUR",
                date: parseISO(date),
                description: "Test transaction",
                merchant_category_code: merchantCategoryCode,
                merchant_name: "Test merchant",
                type: amount > 0 ? "credit" : "debit",
        };
}

test("returns the reliability score response", async (t) =>
{
        const categoryServer = createServer((request, response) =>
        {
                if (request.url !== "/dictionaries/merchant-categories")
                {
                        response.writeHead(404).end();

                        return;
                }

                response.writeHead(200, { "content-type": "application/json" });
                response.end(
                        JSON.stringify({
                                categories: [
                                        { code: "6513", name: "Rent", group: "essential" },
                                        { code: "9001", name: "Salary", group: "income" },
                                        { code: "6540", name: "Savings", group: "savings" },
                                        { code: "6012", name: "Late fees", group: "fees" },
                                        { code: "7995", name: "Gambling", group: "high_risk" },
                                ],
                        }),
                );
        });

        await new Promise<void>((resolve) =>
        {
                categoryServer.listen(0, "127.0.0.1", resolve);
        });
        const address = categoryServer.address();

        assert(address && typeof address !== "string");

        const { testDirectory, databaseFilePath } = await createTempDatabase();
        const args = {
                bankingApiBaseUrl: `http://127.0.0.1:${address.port}`,
                databaseFilePath,
        };
        const saveAccounts = mkSaveAccounts(args);
        const saveTransactions = mkSaveTransactions(args);

        saveAccounts([account]);
        saveTransactions([
                transaction("september-income", "2025-09-02", 100, "9001"),
                transaction("october-income", "2025-10-02", 100, "9001"),
                transaction("november-income", "2025-11-02", 100, "9001"),
                transaction("december-income", "2025-12-02", 100, "9001"),
                transaction("january-income", "2026-01-02", 100, "9001"),
                transaction("september-savings", "2025-09-03", 10, "6540"),
                transaction("october-savings", "2025-10-03", 10, "6540"),
                transaction("november-savings", "2025-11-03", 10, "6540"),
                transaction("december-savings", "2025-12-03", 10, "6540"),
                transaction("september-rent", "2025-09-05", -50, "6513"),
                transaction("october-rent", "2025-10-05", -50, "6513"),
                transaction("november-rent", "2025-11-05", -50, "6513"),
                transaction("december-rent", "2025-12-05", -50, "6513"),
                transaction("january-rent", "2026-01-05", -50, "6513"),
                transaction("february-rent", "2026-02-05", -50, "6513"),
                transaction("late-fee", "2026-01-10", -5, "6012"),
                transaction("high-risk", "2026-02-10", -50, "7995"),
        ]);

        const app = buildApp(args);

        t.after(async () =>
        {
                await app.close();
                await new Promise<void>((resolve, reject) =>
                {
                        categoryServer.close((error) => (error ? reject(error) : resolve()));
                });
                rmSync(testDirectory, { recursive: true, force: true });
        });

        const response = await app.inject({
                method: "GET",
                url: "/api/users/user-1/reliability?from=2026-02-20",
        });

        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.json(), {
                user_id: "user-1",
                from: "2026-02-20",
                currency: "EUR",
                reliability_index: 82,
                score_band: "HIGH",
                metrics: {
                        income_regularity: 5 / 6,
                        income_coverage_ratio: 5 / 3,
                        essential_payments_consistency: 1,
                        good_months: 4,
                        negative_balance_days: 0,
                        late_fee_events: 1,
                },
                drivers: ["Income present in 5/6 months", "Income covers essential expenses (1.67x)", "Savings activity in 4/6 months", "1 late fee event(s)", "High-risk spending was 14% of spending"],
        });

        const invalidResponse = await app.inject({
                method: "GET",
                url: "/api/users/user-1/reliability",
        });

        assert.equal(invalidResponse.statusCode, 400);
        assert.deepEqual(invalidResponse.json(), {
                error: "from must be a valid date in YYYY-MM-DD format",
        });
});
