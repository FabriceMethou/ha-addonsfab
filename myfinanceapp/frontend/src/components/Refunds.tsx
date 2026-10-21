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
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { HelpCircle, RotateCcw, X } from "lucide-react";
import {
  Autocomplete,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./shadcn";
import { transactionsAPI } from "../services/api";
import { formatCurrency } from "../lib/utils";
import { useToast } from "../contexts/ToastContext";

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
export type RefundKind = "refund" | "reimbursement";

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

/** The two "subcategories" of Refund / Reimbursement. */
export function RefundKindItems() {
  return (
    <>
      <SelectItem value="refund">Refund</SelectItem>
      <SelectItem value="reimbursement">Reimbursement</SelectItem>
    </>
  );
}

/** A saved refund: a reimbursement when someone else than the expense's
 * recipient paid it back. */
export function refundKindOf(transaction: {
  destinataire?: string;
  refund_of?: { destinataire?: string };
}): RefundKind {
  const norm = (s?: string) => (s || "").trim().toLowerCase();
  return norm(transaction.destinataire) === norm(transaction.refund_of?.destinataire)
    ? "refund"
    : "reimbursement";
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

/** "Refund or reimbursement?" — the difference, shown only when asked for. */
export function RefundExplainer() {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-primary hover:underline"
        aria-expanded={open}
      >
        <HelpCircle className="w-3.5 h-3.5" />
        Refund or reimbursement?
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-border bg-surface p-3 text-foreground-muted">
          <p>
            <span className="font-medium text-foreground">Refund</span>: money
            back from the <em>same</em> place you paid, because the purchase is
            undone or reduced: a returned item, a cancelled order, an
            overcharge corrected.
          </p>
          <p>
            <span className="font-medium text-foreground">Reimbursement</span>:
            money from <em>someone else</em> who covers an expense you made:
            the health insurer paying back the doctor, your employer paying
            back a work trip, a friend paying their share.
          </p>
          <p>
            Both are recorded the same way: against the expense, which then
            cost you less. Set the recipient to who paid you back (the shop,
            the insurer, the employer).
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Choosing the expense a refund pays back: first who the expense was paid to,
 * then that recipient's expenses that can still take a refund. For a refund
 * that recipient is also who pays back; a reimbursement asks for the payer
 * separately. An existing refund being edited only shows what it refunds.
 */
export function RefundExpensePicker({
  kind,
  value,
  onChange,
  editing = false,
}: {
  kind: RefundKind;
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
        <span className="text-foreground-muted">
          {kind === "refund" ? "Refund of: " : "Reimbursement of: "}
        </span>
        <span className="text-foreground">{expenseLabel(value)}</span>
        <p className="text-xs text-foreground-muted mt-0.5">
          Counted in its category, {value.type_name || "the expense's"}.
        </p>
      </div>
    ) : null;
  }

  const label = kind === "refund" ? "Refunded by" : "Expense paid to";

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
            placeholder={
              kind === "refund"
                ? "The shop or company that pays you back"
                : "Who you paid: the doctor, the shop…"
            }
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

/**
 * "Record refund" from an expense: everything filled in, the amount being
 * what is left to refund.
 */
export function RefundDialog({
  expense,
  accounts,
  onClose,
  onRecorded,
}: {
  expense: any | null;
  accounts: any[];
  onClose: () => void;
  onRecorded: () => void;
}) {
  const toast = useToast();
  const remaining = expense
    ? Math.max(0, Math.abs(expense.amount) - (expense.refunded_amount || 0))
    : 0;
  const [form, setForm] = useState({
    amount: "",
    date: format(new Date(), "yyyy-MM-dd"),
    account_id: "",
    destinataire: "",
    description: "",
  });

  useEffect(() => {
    if (expense) {
      setForm({
        amount: "",
        date: format(new Date(), "yyyy-MM-dd"),
        account_id: String(expense.account_id),
        destinataire: expense.destinataire || "",
        description: "",
      });
    }
    // Only when another expense is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expense?.id]);

  const mutation = useMutation({
    mutationFn: () =>
      transactionsAPI.createRefund(expense.id, {
        account_id: parseInt(form.account_id),
        date: form.date,
        amount: parseFloat(form.amount),
        destinataire: form.destinataire || null,
        description: form.description || null,
      }),
    onSuccess: () => {
      toast.success("Refund recorded");
      onRecorded();
      onClose();
    },
    onError: (error: any) =>
      toast.error(
        `Failed to record refund: ${error.response?.data?.detail || error.message}`,
      ),
  });

  const expenseCurrency = expense?.account_currency || "EUR";
  const amount = parseFloat(form.amount);
  const amountError = refundAmountError(
    amount,
    remaining,
    expenseCurrency,
    accounts.find((a: any) => String(a.id) === form.account_id)?.currency,
  );
  const valid = amount > 0 && !amountError && !!form.account_id && !!form.date;

  return (
    <Dialog open={!!expense} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Record refund</DialogTitle>
          <DialogDescription>
            {expense && expenseLabel({ ...expense, currency: expense.account_currency || "EUR" })}
            {expense?.refunded_amount
              ? ` · ${formatCurrency(remaining, expense.account_currency || "EUR")} left to refund`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">Amount received</Label>
              <Input
                id="refund-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder={refundMaxLabel(remaining, expenseCurrency)}
                aria-invalid={!!amountError}
              />
              {amountError && (
                <p className="text-xs text-error">{amountError}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-date">Received on</Label>
              <Input
                id="refund-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-account">Received on account</Label>
              <Select
                value={form.account_id}
                onValueChange={(value) => setForm({ ...form, account_id: value })}
              >
                <SelectTrigger id="refund-account">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((a: any) => a.account_type !== "investment")
                    .map((a: any) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name} ({a.currency})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-recipient">Paid back by</Label>
              <Input
                id="refund-recipient"
                value={form.destinataire}
                onChange={(e) => setForm({ ...form, destinataire: e.target.value })}
                placeholder="Shop, insurer, employer…"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-note">Note (optional)</Label>
            <Input
              id="refund-note"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <p className="text-xs text-foreground-muted">
            Counted in {expense?.type_name || "the expense's category"}, in the
            month it is received.
          </p>
          <RefundExplainer />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!valid}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Record refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
