import * as z from "zod";
import { bankingApiGet } from "./client.js";
import type { DataRange } from "./data-range.js";
import type { BankingArgs } from "./index.js";

const transactionSchema = z.object({
    id: z.string(),
    account_id: z.string(),
    amount: z.number(),
    currency: z.literal("EUR"),
    date: z.iso.date(),
    description: z.string(),
    merchant_category_code: z.string(),
    merchant_name: z.string(),
    type: z.enum(["debit", "credit"]),
});

export type Transaction = z.infer<typeof transactionSchema>;

const transactionPageSchema = z.object({
    transactions: z.array(transactionSchema),
    next_cursor: z.string().nullable(),
});

export type TransactionPage = z.infer<typeof transactionPageSchema>;

export function mkGetTransactionPage(args: BankingArgs) {
    return async (accountId: string, { from, to }: DataRange, cursor?: string) => {
        const url = new URL(`/accounts/${encodeURIComponent(accountId)}/transactions`, args.bankingApiBaseUrl);
        url.searchParams.set("from", from);
        url.searchParams.set("to", to);

        if (cursor) {
            url.searchParams.set("cursor", cursor);
        }

        return bankingApiGet(url, transactionPageSchema);
    };
}
