// Refunds and reimbursements: money paid back on an expense.
//
// A refund is recorded against the expense it pays back. It takes that
// expense's category, so it lowers that category's spending in the month it
// arrives, on whatever account it arrives. Several partial refunds may cover
// one expense, never more than its amount (the server enforces it).
//
// In a transaction form it is not a category of its own: "Refund /
// Reimbursement" (and "Loan payment") are form-only entries at the bottom of
// the category list, which switch the form into that mode.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { X } from "lucide-react";
import {
  Autocomplete,
  Label,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
} from "./shadcn";
import { transactionsAPI } from "../services/api";
import { formatCurrency } from "../lib/utils";

/** An expense as /transactions/refundable returns it. */
export interface RefundableExpense {
  id: number;
  transaction_date: string;
  amount: number;
  destinataire: string;
  description?: string;
  type_id: number;
  subtype_id?: number | null;
  type_name?: string;
  subtype_name?: string | null;
  account_name?: string;
  currency: string;
  refunded_amount?: number;
  remaining?: number;
}

const shortDate = (date: string) =>
  format(new Date(`${date.slice(0, 10)}T00:00:00`), "d MMM yyyy");

/** One line describing an expense: recipient, amount, date and account. */
export function expenseLabel(e: {
  destinataire?: string;
  description?: string;
  amount: number;
  currency: string;
  transaction_date: string;
  account_name?: string;
}) {
  return (
    `${e.destinataire || e.description || "Expense"} · ` +
    `${formatCurrency(Math.abs(e.amount), e.currency)} · ${shortDate(e.transaction_date)}` +
    (e.account_name ? ` · ${e.account_name}` : "")
  );
}

/** Form-only category values: they switch the form into a mode. */
export const REFUND_CATEGORY = "refund";
export const LOAN_CATEGORY = "loan";

/** The entries at the bottom of a category list. */
export function SpecialCategoryItems({ loan = false }: { loan?: boolean }) {
  return (
    <>
      <SelectSeparator />
      <SelectGroup>
        <SelectLabel>Special</SelectLabel>
        <SelectItem value={REFUND_CATEGORY}>Refund / Reimbursement</SelectItem>
        {loan && <SelectItem value={LOAN_CATEGORY}>Loan payment</SelectItem>}
      </SelectGroup>
    </>
  );
}

/** "Max €20.00": the most that can still be refunded on an expense. */
export const refundMaxLabel = (remaining: number, currency: string) =>
  `Max ${formatCurrency(remaining, currency)}`;

/**
 * Checks a refund amount against what is left on the expense. Only possible
 * here when the refund arrives in the expense's currency; otherwise the
 * server converts and checks.
 */
export function refundAmountError(
  amount: number,
  remaining: number | undefined,
  currency: string,
  accountCurrency?: string,
): string | null {
  if (!(amount > 0)) return null;
  if (remaining == null || (accountCurrency && accountCurrency !== currency)) return null;
  return amount > remaining + 0.005
    ? `At most ${formatCurrency(remaining, currency)} is left to refund on this expense`
    : null;
}

/**
 * Choosing the expense being paid back: first who it was paid to, then that
 * recipient's expenses that can still take a refund. A shop refunding a purchase
 * and an insurer reimbursing a doctor are recorded the same way, against the
 * expense. An existing refund being edited only shows what it pays back.
 */
export function RefundExpensePicker({
  value,
  onChange,
  editing = false,
}: {
  value: RefundableExpense | null;
  onChange: (expense: RefundableExpense | null) => void;
  editing?: boolean;
}) {
  const [paidTo, setPaidTo] = useState(value?.destinataire || "");

  const { data: recipients = [] } = useQuery({
    queryKey: ["refundable", "recipients"],
    queryFn: async () =>
      (await transactionsAPI.getRefundRecipients()).data.recipients as string[],
    enabled: !editing,
  });

  const { data: expenses = [], isFetching } = useQuery({
    queryKey: ["refundable", "expenses", paidTo],
    queryFn: async () =>
      (await transactionsAPI.getRefundable(paidTo)).data
        .expenses as RefundableExpense[],
    enabled: !editing && !!paidTo && !value,
  });

  if (editing) {
    return value ? (
      <div className="sm:col-span-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
        <span className="text-foreground-muted">Paying back: </span>
        <span className="text-foreground">{expenseLabel(value)}</span>
        <p className="text-xs text-foreground-muted mt-0.5">
          Counted in its category, {value.type_name || "the expense's"}.
        </p>
      </div>
    ) : null;
  }

  const label = "Expense paid to";

  return (
    <div className="sm:col-span-2 space-y-2">
      <Label htmlFor="refund-paid-to">{label}</Label>
      {value ? (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="text-foreground truncate">{expenseLabel(value)}</p>
            <p className="text-xs text-foreground-muted">
              Counted in {value.type_name}
              {value.subtype_name ? ` › ${value.subtype_name}` : ""}
              {value.remaining != null &&
                ` · ${formatCurrency(value.remaining, value.currency)} left to refund`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-foreground-muted hover:text-foreground"
            aria-label="Choose another expense"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <Autocomplete
            id="refund-paid-to"
            options={recipients}
            value={paidTo}
            onChange={setPaidTo}
            placeholder="Who you paid: the shop, the doctor…"
            helperText="Only recipients with an expense from the last 12 months that can still be refunded"
          />
          {paidTo && (
            <ul
              className="max-h-56 overflow-y-auto divide-y divide-border rounded-md border border-border"
              aria-label={`Expenses paid to ${paidTo}`}
            >
              {expenses.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onChange(e)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surface-hover"
                  >
                    <span className="text-foreground">{expenseLabel(e)}</span>
                    <span className="block text-xs text-foreground-muted">
                      {e.type_name}
                      {e.subtype_name ? ` › ${e.subtype_name}` : ""}
                      {e.description ? ` · ${e.description}` : ""}
                      {e.refunded_amount
                        ? ` · ${formatCurrency(e.remaining ?? 0, e.currency)} left`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
              {!isFetching && expenses.length === 0 && (
                <li className="px-3 py-2 text-xs text-foreground-muted">
                  No expense paid to {paidTo} in the last 12 months can still be
                  refunded.
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
