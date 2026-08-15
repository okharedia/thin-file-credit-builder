export { mkListAccounts, type Account } from "./account.js";
export { mkGetDataRange, type DataRange } from "./data-range.js";
export {
  mkGetTransactionPage,
  type Transaction,
  type TransactionPage,
} from "./transaction.js";

export type BankingArgs = {
  bankingApiBaseUrl: string;
};