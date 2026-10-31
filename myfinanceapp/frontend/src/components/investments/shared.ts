// What the Investments page and its parts share.
import { format, parseISO } from "date-fns";

export const TAB_SECURITIES = "securities";
export const TAB_HOLDINGS = "holdings";
export const TAB_TRANSACTIONS = "trades";

export interface SecurityFormData {
  symbol: string;
  name: string;
  investment_type: string;
  isin: string;
  exchange: string;
  currency: string;
  sector: string;
  country: string;
  notes: string;
}

export interface HoldingFormData {
  security_id: string;
  account_id: string;
  quantity: string;
  purchase_price: string;
  purchase_date: string;
  notes: string;
}

export interface TransactionFormData {
  account_id: string;
  holding_id: string;
  transaction_type: string;
  quantity: string;
  price: string;
  transaction_date: string;
  fees: string;
  tax: string;
  notes: string;
}

// Helper function to safely format dates
export const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "Invalid Date";
  try {
    const date = parseISO(dateString);
    if (isNaN(date.getTime())) return "Invalid Date";
    return format(date, "MMM dd, yyyy");
  } catch {
    return "Invalid Date";
  }
};

const INVESTMENT_TYPE_LABELS: Record<string, string> = {
  stock: "Stock",
  etf: "ETF",
  mutual_fund: "Mutual fund",
  bond: "Bond",
  crypto: "Crypto",
  other: "Other",
};

/** "mutual_fund" reads "Mutual fund". */
export const investmentTypeLabel = (type?: string | null): string => {
  if (!type) return "Other";
  const known = INVESTMENT_TYPE_LABELS[type.toLowerCase()];
  if (known) return known;
  const spaced = type.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
