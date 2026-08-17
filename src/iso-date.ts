import { formatISO, parseISO } from "date-fns";
import * as z from "zod";

export const isoDateSchema = z.iso.date().transform((value) => parseISO(value));

export function formatIsoDate(date: Date): string {
        return formatISO(date, { representation: "date" });
}
