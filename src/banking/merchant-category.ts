import * as z from "zod";
import { bankingApiGet } from "./client.js";
import type { BankingArgs } from "./index.js";

const merchantCategorySchema = z.object({
    code: z.string(),
    name: z.string(),
    group: z.enum(["essential", "discretionary", "high_risk", "savings", "cash", "income", "fees"]),
});

export type MerchantCategory = z.infer<typeof merchantCategorySchema>;
export type MerchantCategoryGroup = MerchantCategory["group"];

export function codesInGroup(categories: readonly MerchantCategory[], group: MerchantCategoryGroup): string[] {
    return categories.filter((category) => category.group === group).map((category) => category.code);
}

const listMerchantCategoriesResponseSchema = z.object({
    categories: z.array(merchantCategorySchema),
});

export function mkListMerchantCategories(args: BankingArgs) {
    return async (): Promise<MerchantCategory[]> => {
        const url = new URL("/dictionaries/merchant-categories", args.bankingApiBaseUrl);
        const body = await bankingApiGet(url, listMerchantCategoriesResponseSchema);

        return body.categories;
    };
}
