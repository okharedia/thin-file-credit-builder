import * as z from "zod";
import { bankingApiGet } from "./client.js";
import type { BankingArgs } from "./index.js";

const accountSchema = z.object({
        id: z.string(),
        user_id: z.string(),
        type: z.enum(["checking", "savings"]),
        currency: z.literal("EUR"),
        balance: z.number(),
        name: z.string(),
});

export type Account = z.infer<typeof accountSchema>;

const listAccountsResponseSchema = z.object({
        accounts: z.array(accountSchema),
});

export function mkListAccounts(args: BankingArgs) {
        return async (userId: string) => {
                const url = new URL(`/users/${encodeURIComponent(userId)}/accounts`, args.bankingApiBaseUrl);
                const body = await bankingApiGet(url, listAccountsResponseSchema);

                return body.accounts;
        };
}
