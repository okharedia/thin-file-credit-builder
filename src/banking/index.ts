export { mkListAccounts, type Account } from "./account.js";
export { mkGetDataRange, type DataRange } from "./data-range.js";
export {
  codesInGroup,
  mkListMerchantCategories,
  type MerchantCategory,
  type MerchantCategoryGroup,
} from "./merchant-category.js";
export {
  mkGetTransactionPage,
  type Transaction,
  type TransactionPage,
} from "./transaction.js";

export type BankingArgs = {
  bankingApiBaseUrl: string;
};
