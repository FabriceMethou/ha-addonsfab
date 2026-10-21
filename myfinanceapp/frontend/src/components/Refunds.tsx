// Refunds and reimbursements: money paid back on an expense.
//
// A refund is recorded against the expense it pays back. It takes that
// expense's category, so it lowers that category's spending in the month it
// arrives, on whatever account it arrives. Several partial refunds may cover
// one expense, never more than its amount (the server enforces it).
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { HelpCircle, RotateCcw, Search, X } from "lucide-react";
import {
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
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
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
 * "This is a refund of…" for a transaction form: a toggle, then a search over
 * the expenses that can still take a refund. Picking one hands it to
 * `onChange`, which fills the category (taken from the expense) and defaults.
 * An existing refund being edited only shows what it refunds.
 */
export function RefundOfField({
  value,
  onChange,
  editing = false,
}: {
  value: RefundableExpense | null;
  onChange: (expense: RefundableExpense | null) => void;
  editing?: boolean;
}) {
  const [enabled, setEnabled] = useState(!!value);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (value) setEnabled(true);
  }, [value]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["refundable", debounced],
    queryFn: async () =>
      (await transactionsAPI.getRefundable(debounced)).data
        .expenses as RefundableExpense[],
    enabled: enabled && !value,
  });

  if (editing) {
    return value ? (
      <div className="sm:col-span-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
        <span className="text-foreground-muted">Refund of: </span>
        <span className="text-foreground">{expenseLabel(value)}</span>
        <p className="text-xs text-foreground-muted mt-0.5">
          Its category follows the expense.
        </p>
      </div>
    ) : null;
  }

  return (
    <div className="sm:col-span-2 space-y-2 rounded-lg border border-border px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="refund-toggle" className="text-sm text-foreground">
          This is a refund or reimbursement
        </label>
        <Switch
          id="refund-toggle"
          checked={enabled}
          onChange={(checked) => {
            setEnabled(checked);
            if (!checked) onChange(null);
          }}
        />
      </div>
      {enabled && (
        <>
          {value ? (
            <div className="flex items-start justify-between gap-2 rounded-md bg-surface px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="text-foreground truncate">{expenseLabel(value)}</p>
                <p className="text-xs text-foreground-muted">
                  {value.type_name}
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
            <div className="space-y-1.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find the expense: recipient, description or amount"
                  className="pl-9"
                  aria-label="Find the expense being refunded"
                />
              </div>
              <ul className="max-h-48 overflow-y-auto divide-y divide-border rounded-md border border-border">
                {results.map((e) => (
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
                        {e.refunded_amount
                          ? ` · ${formatCurrency(e.remaining ?? 0, e.currency)} left`
                          : ""}
                      </span>
                    </button>
                  </li>
                ))}
                {!isFetching && results.length === 0 && (
                  <li className="px-3 py-2 text-xs text-foreground-muted">
                    No expense from the last 12 months matches.
                  </li>
                )}
              </ul>
            </div>
          )}
          <RefundExplainer />
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
        amount: remaining.toFixed(2),
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

  const amount = parseFloat(form.amount);
  const valid = amount > 0 && !!form.account_id && !!form.date;

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
              />
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
