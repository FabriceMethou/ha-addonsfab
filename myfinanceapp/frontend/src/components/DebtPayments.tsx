// Payment History of one loan: correcting or undoing a payment moves its ledger
// rows and the loan balance together.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./shadcn";
import { useToast } from "../contexts/ToastContext";
import { accountsAPI, debtsAPI } from "../services/api";
import { format, parseISO } from "date-fns";
import { formatCurrency as formatCurrencyUtil } from "../lib/utils";

interface Payment {
  id: number;
  amount: number;
  total_paid?: number;
  payment_date: string;
  payment_type: "regular" | "extra";
  interest_paid: number;
  account_id?: number;
  account_name?: string;
  notes?: string;
  description?: string;
}

interface Correction {
  amount: string;
  payment_date: string;
  payment_type: string;
  account_id: string;
}

export default function DebtPayments({
  debtId,
  currency = "EUR",
}: {
  debtId: number;
  currency?: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [correcting, setCorrecting] = useState<Payment | null>(null);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [undoing, setUndoing] = useState<Payment | null>(null);

  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ["debt-payments", debtId],
    queryFn: async () => {
      const response = await debtsAPI.getPayments(debtId);
      return response.data.payments as Payment[];
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => (await accountsAPI.getAll()).data.accounts,
    enabled: !!correcting,
  });

  const formatCurrency = (amount: number) =>
    formatCurrencyUtil(amount, currency);

  // A payment moves cash, the loan and every total built on them.
  const refresh = () => queryClient.invalidateQueries();

  const failed = (what: string) => (error: any) => {
    const message =
      error.response?.data?.detail || error.message || "Unknown error";
    toast.error(`Failed to ${what}: ${message}`);
  };

  const correctMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      debtsAPI.updatePayment(id, data),
    onSuccess: () => {
      refresh();
      setCorrecting(null);
      toast.success("Payment corrected");
    },
    onError: failed("correct the payment"),
  });

  const undoMutation = useMutation({
    mutationFn: (id: number) => debtsAPI.deletePayment(id),
    onSuccess: () => {
      refresh();
      setUndoing(null);
      toast.success("Payment deleted. The loan has its balance back");
    },
    onError: failed("delete the payment"),
  });

  const startCorrecting = (payment: Payment) => {
    setCorrecting(payment);
    setCorrection({
      amount: String(payment.total_paid ?? payment.amount),
      payment_date: payment.payment_date,
      payment_type: payment.payment_type,
      account_id: payment.account_id ? String(payment.account_id) : "",
    });
  };

  const submitCorrection = () => {
    if (!correcting || !correction) return;
    correctMutation.mutate({
      id: correcting.id,
      data: {
        amount: parseFloat(correction.amount),
        payment_date: correction.payment_date,
        payment_type: correction.payment_type,
        ...(correction.account_id
          ? { account_id: parseInt(correction.account_id) }
          : {}),
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Spinner size="sm" />
      </div>
    );
  }

  if (!paymentsData || paymentsData.length === 0) {
    return (
      <p className="text-sm text-foreground-muted text-center py-4">
        No payments yet
      </p>
    );
  }

  const payingAccounts = (accounts || []).filter(
    (a: any) => a.currency === currency && a.account_type !== "investment",
  );

  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paymentsData.map((payment) => (
            <TableRow key={payment.id}>
              <TableCell className="text-sm">
                {format(parseISO(payment.payment_date), "MMM dd, yyyy")}
              </TableCell>
              <TableCell className="font-semibold text-success">
                {formatCurrency(payment.total_paid ?? payment.amount)}
                {payment.interest_paid > 0 && (
                  <span className="block text-xs font-normal text-foreground-muted">
                    {formatCurrency(payment.interest_paid)} interest
                  </span>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {payment.account_name || "-"}
              </TableCell>
              <TableCell className="text-sm">
                {payment.notes || payment.description || "-"}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Correct this payment"
                  onClick={() => startCorrecting(payment)}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Delete this payment"
                  className="text-error"
                  onClick={() => setUndoing(payment)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={!!correcting}
        onOpenChange={(open) => !open && setCorrecting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct payment</DialogTitle>
            <DialogDescription>
              The cash and the loan balance change together. Interest is worked
              out again for this payment; other payments are not touched.
            </DialogDescription>
          </DialogHeader>
          {correction && (
            <div className="grid gap-4 py-2">
              <FormField label="Amount" htmlFor="payment-amount" required>
                <Input
                  id="payment-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={correction.amount}
                  onChange={(e) =>
                    setCorrection({ ...correction, amount: e.target.value })
                  }
                />
              </FormField>
              <FormField label="Date" htmlFor="payment-date" required>
                <Input
                  id="payment-date"
                  type="date"
                  value={correction.payment_date}
                  onChange={(e) =>
                    setCorrection({
                      ...correction,
                      payment_date: e.target.value,
                    })
                  }
                />
              </FormField>
              <FormField label="Type">
                <Select
                  value={correction.payment_type}
                  onValueChange={(payment_type) =>
                    setCorrection({ ...correction, payment_type })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">Monthly payment</SelectItem>
                    <SelectItem value="extra">Extra payment</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Paid from">
                <Select
                  value={correction.account_id}
                  onValueChange={(account_id) =>
                    setCorrection({ ...correction, account_id })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {payingAccounts.map((a: any) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrecting(null)}>
              Cancel
            </Button>
            <Button
              onClick={submitCorrection}
              loading={correctMutation.isPending}
              disabled={!correction?.amount || !correction?.payment_date}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!undoing}
        onOpenChange={(open) => !open && setUndoing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this payment?</DialogTitle>
            <DialogDescription>
              {undoing &&
                `The ${formatCurrency(undoing.total_paid ?? undoing.amount)} goes back to the account and to what the loan still owes.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUndoing(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={undoMutation.isPending}
              onClick={() => undoing && undoMutation.mutate(undoing.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
