import { mkGetDataRange, mkGetTransactionPage, mkListAccounts, type BankingArgs } from "../banking/index.js";
import { mkListAccountIds, mkSaveAccounts, mkSaveTransactions, type DatabaseArgs } from "../../database.js";
import { formatIsoDate } from "../utils/iso-date.js";

export function mkSyncUser(args: BankingArgs & DatabaseArgs)
{
        const getDataRange = mkGetDataRange(args);
        const getTransactionPage = mkGetTransactionPage(args);
        const listAccounts = mkListAccounts(args);
        const listAccountIds = mkListAccountIds(args);
        const saveAccounts = mkSaveAccounts(args);
        const saveTransactions = mkSaveTransactions(args);

        return async (userId: string) =>
        {
                const [accounts, dataRange] = await Promise.all([listAccounts(userId), getDataRange()]);

                saveAccounts(accounts);

                const pageTotals = await Promise.all(
                        listAccountIds(userId).map(async (accountId) =>
                        {
                                let newTransactions = 0;

                                let duplicateTransactions = 0;

                                let cursor: string | undefined;

                                do
                                {
                                        const page = await getTransactionPage(accountId, dataRange, cursor);

                                        const inserted = saveTransactions(page.transactions);

                                        newTransactions += inserted;

                                        duplicateTransactions += page.transactions.length - inserted;

                                        cursor = page.next_cursor ?? undefined;
                                } while (cursor);

                                return { newTransactions, duplicateTransactions };
                        }),
                );

                const newTransactions = pageTotals.reduce((total, page) => total + page.newTransactions, 0);

                const duplicateTransactions = pageTotals.reduce((total, page) => total + page.duplicateTransactions, 0);

                return {
                        user_id: userId,
                        synced_accounts: accounts.length,
                        new_transactions: newTransactions,
                        duplicate_transactions: duplicateTransactions,
                        synced_from: formatIsoDate(dataRange.from),
                };
        };
}
