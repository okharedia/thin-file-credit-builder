import * as z from "zod";
import { bankingApiGet } from "./client.js";
import type { BankingArgs } from "./index.js";

const dataRangeSchema = z.object({
    from: z.iso.date(),
    to: z.iso.date(),
});

export type DataRange = z.infer<typeof dataRangeSchema>;

const discoveryResponseSchema = z.object({
    data_range: dataRangeSchema,
});

export function mkGetDataRange(args: BankingArgs) {
    return async () => {
        const url = new URL("/", args.bankingApiBaseUrl);
        const body = await bankingApiGet(url, discoveryResponseSchema);

        return body.data_range;
    };
}
