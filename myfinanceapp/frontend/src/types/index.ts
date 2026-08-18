// Type definitions for Finance Tracker
//
// These describe what the API *actually returns*, captured from live responses
// rather than written from memory. The previous version had drifted badly —
// Transaction declared `date` and `is_pending` where the API sends
// `transaction_date` and `confirmed`, and Debt named fields the API does not
// use at all — which is why almost nothing imported this file and 400 `any`
// grew in its place.
//
// Only 5 of 159 endpoints declare a response_model, so generating this from
// /openapi.json would yield `unknown` almost everywhere. Until the routers
// describe their responses, this file is the contract; keep it in step with
// them.

/** SQLite has no boolean type: these arrive as 0 or 1. */
export type SqliteBool = 0 | 1;

// ── auth ─────────────────────────────────────────────────────────────────────

export interface User {
  username: string;
  is_admin?: boolean;
  mfa_enabled?: boolean;
  mfa_required?: boolean;
  /** Set after a first login or an admin reset; the app forces /security. */
  requires_password_change?: boolean;
}

export interface AuthToken {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  user: User;
}

export interface LoginHistoryEntry {
  id: number;
  user_id: number | null;
  username: string;
  success: SqliteBool;
  ip_address: string | null;
  user_agent: string | null;
  failure_reason: string | null;
  timestamp: string;
}

// ── reference data ───────────────────────────────────────────────────────────

export interface Bank {
  id: number;
  name: string;
}

export interface Owner {
  id: number;
  name: string;
}

export interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string | null;
  exchange_rate_to_eur: number;
  is_active: SqliteBool;
}

export interface ExchangeRateHistoryEntry {
  id: number;
  code: string;
  rate_to_eur: number;
  effective_date: string;
  created_at: string;
}

export type AccountType = "cash" | "investment" | "savings" | "checking";

export interface Account {
  id: number;
  name: string;
  account_type: AccountType;
  currency: string;
  balance: number;
  opening_balance: number | null;
  opening_date: string | null;
  bank_id: number | null;
  owner_id: number;
  linked_account_id: number | null;
  created_at: string;
  /** Joined in by the API, not stored on the row. */
  bank_name: string | null;
  owner_name: string;
}

// ── categories ───────────────────────────────────────────────────────────────

export type CategoryKind = "income" | "expense" | "transfer";

export interface TransactionType {
  id: number;
  name: string;
  category: CategoryKind;
  icon: string | null;
  color: string | null;
  created_at: string;
}

export interface TransactionSubtype {
  id: number;
  type_id: number;
  name: string;
  created_at: string;
}

// ── transactions ─────────────────────────────────────────────────────────────

export interface Transaction {
  id: number;
  account_id: number;
  transaction_date: string;
  /** Alias of transaction_date, added by the API for older callers. */
  date: string;
  due_date: string | null;
  /** Signed: negative for expenses, positive for income. */
  amount: number;
  currency: string;
  description: string;
  /** Payee or payer. */
  destinataire: string;
  type_id: number;
  subtype_id: number;
  tags: string;
  confirmed: SqliteBool;
  /** Dated before the account opened, so excluded from its balance. */
  is_historical: SqliteBool;
  is_duplicate_flag: SqliteBool;
  owner_id: number | null;

  // transfers
  is_transfer: SqliteBool;
  transfer_account_id: number | null;
  transfer_amount: number | null;
  /** The other side of a double-entry transfer. */
  linked_transfer_id: number | null;

  created_at: string;

  // joined by the API
  type_name: string;
  category: CategoryKind;
  icon: string | null;
  color: string | null;
  subtype_name: string | null;
  account_name: string;
  account_type: AccountType;
  account_currency: string;
  bank_name: string | null;
  /** Transaction owner, falling back to the account's owner. */
  effective_owner_id: number;
  owner_name: string;
  transfer_account_name: string | null;
  transfer_account_type: AccountType | null;
  transfer_bank_name: string | null;
}

export interface TransactionListResponse {
  transactions: Transaction[];
  /** Rows in this page. */
  count: number;
  /** Rows matching the filters, ignoring pagination. */
  total: number;
}

// ── envelopes, debts, budgets ────────────────────────────────────────────────

export interface Envelope {
  id: number;
  name: string;
  description: string | null;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  color: string | null;
  tags: string | null;
  is_active: SqliteBool;
  created_at: string;
}

/** The debts router renames columns on the way out — these are the API names. */
export interface Debt {
  id: number;
  creditor: string;
  original_amount: number;
  current_balance: number;
  interest_rate: number;
  monthly_payment: number;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  payment_day: number | null;
  is_active: SqliteBool;
}

export interface Budget {
  id: number;
  type_id: number;
  subtype_id: number | null;
  amount: number;
  period: string;
  currency: string;
  owner_id: number | null;
  is_active: SqliteBool;
}

// ── investments ──────────────────────────────────────────────────────────────

export interface Security {
  id: number;
  symbol: string;
  name: string;
  isin: string | null;
  investment_type: string;
  currency: string;
  exchange: string | null;
  sector: string | null;
  country: string | null;
}

export interface InvestmentHolding {
  id: number;
  account_id: number;
  security_id: number;
  quantity: number;
  average_cost: number;
  current_price: number;
  last_price_update: string | null;
  notes: string | null;
  // joined
  symbol: string;
  name: string;
  investment_type: string;
  currency: string;
  isin: string | null;
}

export type InvestmentTransactionKind = "buy" | "sell" | "dividend";

export interface InvestmentTransaction {
  id: number;
  holding_id: number;
  transaction_type: InvestmentTransactionKind;
  transaction_date: string;
  shares: number | null;
  price_per_share: number | null;
  total_amount: number;
  fees: number;
  tax: number;
  currency: string;
  /** The cash-movement row this created in the linked account. */
  linked_transaction_id: number | null;
}

// ── background jobs ──────────────────────────────────────────────────────────

export interface PriceUpdateStatus {
  status: "idle" | "started" | "running" | "finished" | "error" | "already_running";
  running: boolean;
  started_at: string | null;
  finished_at: string | null;
  total: number;
  processed: number;
  updated_count: number;
  failed: { symbol: string; error: string }[];
  skipped: { symbol: string; type: string; reason: string }[];
  error: string | null;
}
