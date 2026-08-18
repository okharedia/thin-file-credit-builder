import * as z from "zod";
import { isoDateSchema } from "../utils/iso-date.js";
import { bankingApiGet } from "./client.js";
import type { BankingArgs } from "./index.js";

const dataRangeSchema = z.object({
        from: isoDateSchema,
        to: isoDateSchema,
});

export type DataRange = z.infer<typeof dataRangeSchema>;

const discoveryResponseSchema = z.object({
        data_range: dataRangeSchema,
});

export function mkGetDataRange(args: BankingArgs)
{
        return async () =>
        {
                const url = new URL("/", args.bankingApiBaseUrl);
                const body = await bankingApiGet(url, discoveryResponseSchema);

                return body.data_range;
        };
}
