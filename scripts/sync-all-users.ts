import { mkGetDataRange } from "../src/banking/index.js";
import { mkSyncUser } from "../src/user/sync.js";

const bankingApiBaseUrl = process.env.BANKING_API_BASE_URL ?? "https://btq03nn21b.execute-api.eu-central-1.amazonaws.com/";
const databaseFilePath = process.env.DATABASE_PATH ?? "./data/thin-file-credit-builder.sqlite";

const getDataRange = mkGetDataRange({ bankingApiBaseUrl });
const syncUser = mkSyncUser({ bankingApiBaseUrl, databaseFilePath });

const discovery = await fetch(new URL("/", bankingApiBaseUrl), {
        headers: { Authorization: `Bearer ${process.env.BANKING_API_KEY ?? "development"}` },
});

const { available_users: availableUsers } = (await discovery.json()) as { available_users: string[] };

const dataRange = await getDataRange();

console.log(`data range ${dataRange.from.toISOString().slice(0, 10)} to ${dataRange.to.toISOString().slice(0, 10)}`);

for (const userId of availableUsers)
{
        const result = await syncUser(userId);

        console.log(`${result.user_id}: ${result.synced_accounts} accounts, ${result.new_transactions} new transactions`);
}
