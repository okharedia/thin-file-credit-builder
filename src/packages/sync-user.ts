import {
  mkGetDataRange,
  mkGetTransactionPage,
  mkListAccounts,
  type BankingArgs,
} from "../banking/index.js";
import {
  mkListAccountIds,
  mkSaveAccounts,
  mkSaveTransactions,
  type DatabaseArgs,
} from "../database.js";

export function mkSyncUser(args: BankingArgs & DatabaseArgs) {
  const getDataRange = mkGetDataRange(args);
  const getTransactionPage = mkGetTransactionPage(args);
  const listAccounts = mkListAccounts(args);
  const listAccountIds = mkListAccountIds(args);
  const saveAccounts = mkSaveAccounts(args);
  const saveTransactions = mkSaveTransactions(args);

  return async (userId: string) => {
    const accounts = await listAccounts(userId);
    saveAccounts(accounts);

    let newTransactions = 0;
    let duplicateTransactions = 0;

    const dataRange = await getDataRange();
    for (const accountId of listAccountIds(userId)) {
      let cursor: string | undefined;

      do {
        const page = await getTransactionPage(
          accountId,
          dataRange.from,
          dataRange.to,
          cursor,
        );
        const inserted = saveTransactions(page.transactions);

        newTransactions += inserted;
        duplicateTransactions += page.transactions.length - inserted;
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
    }

    return {
      user_id: userId,
      synced_accounts: accounts.length,
      new_transactions: newTransactions,
      duplicate_transactions: duplicateTransactions,
      synced_from: dataRange.from,
    };
  };
}
