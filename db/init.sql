BEGIN;

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('checking', 'savings')),
  currency TEXT NOT NULL CHECK (currency = 'EUR'),
  balance_cents INTEGER NOT NULL,
  name TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'EUR'),
  transaction_date TEXT NOT NULL,
  description TEXT NOT NULL,
  merchant_category_code TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('debit', 'credit'))
) STRICT;

CREATE INDEX IF NOT EXISTS transactions_account_date_idx
  ON transactions(account_id, transaction_date);

CREATE TABLE IF NOT EXISTS merchant_categories (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "group" TEXT NOT NULL CHECK (
    "group" IN ('essential', 'discretionary', 'high_risk', 'savings', 'cash', 'income', 'fees')
  )
) STRICT;

COMMIT;
