// Type definitions for Finance Tracker

export interface User {
  username: string;
  is_admin?: boolean;
  mfa_enabled?: boolean;
  mfa_required?: boolean;
}

export interface AuthToken {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  user: User;
}

export interface Account {
  id: number;
  bank_id: number;
  bank_name: string;
  owner_id: number;
  owner_name: string;
  account_type: string;
  balance: number;
  currency: string;
}

export interface Bank {
  id: number;
  name: string;
}

export interface Owner {
  id: number;
  name: string;
}

export interface Transaction {
  id: number;
  account_id: number;
  account_name?: string;
  date: string;
  amount: number;
  type_id: number;
  type_name: string;
  subtype_id?: number;
  subtype_name?: string;
  description: string;
  transfer_account_id?: number;
  is_pending: boolean;
  created_at: string;
}

export interface TransactionType {
  id: number;
  name: string;
  color: string;
}

export interface TransactionSubtype {
  id: number;
  type_id: number;
  name: string;
}

export interface Envelope {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline?: string;
  progress_percentage: number;
}

export interface Debt {
  id: number;
  name: string;
  total_amount: number;
  remaining_amount: number;
  interest_rate: number;
  monthly_payment: number;
  start_date: string;
  end_date?: string;
}

export interface InvestmentHolding {
  id: number;
  account_id: number;
  symbol: string;
  name: string;
  quantity: number;
  purchase_price: number;
  purchase_date: string;
  current_price?: number;
  total_value?: number;
  profit_loss?: number;
}

export interface DashboardData {
  total_assets: number;
  total_debts: number;
  net_worth: number;
  monthly_income: number;
  monthly_expenses: number;
  monthly_net: number;
}
