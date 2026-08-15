import * as z from "zod";

const bankingApiKey = process.env.BANKING_API_KEY ?? "development";

export async function bankingApiGet<S extends z.ZodType>(
  url: URL,
  schema: S,
): Promise<z.infer<S>> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${bankingApiKey}` },
  });

  if (!response.ok) {
    throw new Error(`Banking API returned ${response.status}`);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(
      `Banking API returned an invalid response from ${url.pathname}: ${z.prettifyError(parsed.error)}`,
    );
  }

  return parsed.data;
}
