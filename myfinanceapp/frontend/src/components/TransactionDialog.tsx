// The one window for adding or editing a transaction, wherever it is opened
// from: the "Add" button in the top bar, the Transactions page and the
// Reconcile page. Its rules live here once: refunds and reimbursements, loan
// payments booked like the Debts page, transfers, and what is refreshed after
// a save.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Sparkles } from "lucide-react";
import {
  accountsAPI,
  categoriesAPI,
  debtsAPI,
  transactionsAPI,
} from "../services/api";
import { useToast } from "../contexts/ToastContext";
import {
  transactionSchema,
  type TransactionFormData,
} from "../lib/validations";
import { formatCurrency as formatCurrencyUtil } from "../lib/utils";
import {
  Autocomplete,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./shadcn";
import {
  LOAN_CATEGORY,
  REFUND_CATEGORY,
  RefundExpensePicker,
  RefundExplainer,
  RefundKindItems,
  SpecialCategoryItems,
  refundAmountError,
  refundKindOf,
  refundMaxLabel,
  type RefundKind,
  type RefundableExpense,
} from "./Refunds";

export interface AddTransactionOptions {
  /** Values to start from, such as a bank line on the Reconcile page. */
  preset?: Partial<TransactionFormData>;
  /** The account cannot be changed (the account being reconciled). */
  lockAccount?: boolean;
  /** Close after saving, instead of staying open for the next one. */
  closeOnSave?: boolean;
  /** Replaces "Enter the details for your new transaction." */
  description?: string;
  /** After a transaction or loan payment has been saved. */
  onSaved?: () => void;
}

interface TransactionDialogApi {
  openAdd: (options?: AddTransactionOptions) => void;
  openEdit: (transaction: any) => void;
}

const TransactionDialogContext = createContext<TransactionDialogApi | null>(
  null,
);

/** Opens the transaction window; available under the app's Layout. */
export function useTransactionDialog() {
  const api = useContext(TransactionDialogContext);
  if (!api)
    throw new Error("useTransactionDialog needs a TransactionDialogProvider");
  return api;
}

interface Session {
  open: boolean;
  /** Changes on every opening, so the form starts again from its values. */
  id: number;
  editing: any | null;
  options: AddTransactionOptions;
}

export function TransactionDialogProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session>({
    open: false,
    id: 0,
    editing: null,
    options: {},
  });
  const openAdd = useCallback(
    (options: AddTransactionOptions = {}) =>
      setSession((s) => ({ open: true, id: s.id + 1, editing: null, options })),
    [],
  );
  const openEdit = useCallback(
    (transaction: any) =>
      setSession((s) => ({
        open: true,
        id: s.id + 1,
        editing: transaction,
        options: {},
      })),
    [],
  );
  const api = useMemo(() => ({ openAdd, openEdit }), [openAdd, openEdit]);
  return (
    <TransactionDialogContext.Provider value={api}>
      {children}
      <TransactionDialog
        session={session}
        onClose={() => setSession((s) => ({ ...s, open: false }))}
      />
    </TransactionDialogContext.Provider>
  );
}

const emptyForm = (): TransactionFormData => ({
  account_id: "",
  date: format(new Date(), "yyyy-MM-dd"),
  due_date: "",
  amount: "",
  type_id: "",
  subtype_id: "",
  description: "",
  recipient: "",
  transfer_account_id: "",
  transfer_amount: "",
  tags: "",
  debt_id: "",
});

function TransactionDialog({
  session,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
  const { open, editing: editingTransaction, options } = session;
  const toast = useToast();
  const queryClient = useQueryClient();

  const [selectedFormOwner, setSelectedFormOwner] = useState<string>("");
  // The expense the transaction in the form pays back, when it is a refund.
  const [refundOf, setRefundOf] = useState<RefundableExpense | null>(null);
  // A loan payment from the form: monthly (interest + capital) or extra.
  const [loanPaymentType, setLoanPaymentType] = useState<"monthly" | "extra">(
    "monthly",
  );
  const [autoCategorizingDescription, setAutoCategorizingDescription] =
    useState(false);
  const [autoCategorizerConfidence, setAutoCategorizerConfidence] = useState<
    number | null
  >(null);

  const {
    control,
    register,
    handleSubmit: handleFormSubmit,
    formState: { errors, isValid },
    reset: resetForm,
    watch,
    setValue,
    setError,
    clearErrors,
    trigger,
  } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    mode: "onChange", // Validate on change for immediate feedback
    defaultValues: emptyForm(),
  });
  const formData = watch();

  // The lists the form offers; shared with the pages through the cache.
  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => (await accountsAPI.getAll()).data.accounts,
    staleTime: 30 * 60 * 1000,
    enabled: open,
  });
  const { data: ownersData } = useQuery({
    queryKey: ["owners"],
    queryFn: async () => (await accountsAPI.getOwners()).data.owners,
    staleTime: 30 * 60 * 1000,
    enabled: open,
  });
  const { data: categoriesData } = useQuery({
    queryKey: ["categories-hierarchy"],
    queryFn: async () => (await categoriesAPI.getHierarchy()).data.categories,
    staleTime: 30 * 60 * 1000,
    enabled: open,
  });
  const { data: tagsData } = useQuery({
    queryKey: ["tags"],
    queryFn: async () => (await transactionsAPI.getAllTags()).data.tags,
    staleTime: 30 * 60 * 1000,
    enabled: open,
  });
  const { data: recipientsData } = useQuery({
    queryKey: ["recipients"],
    queryFn: async () =>
      (await transactionsAPI.getAllRecipients()).data.recipients,
    staleTime: 30 * 60 * 1000,
    enabled: open,
  });
  const { data: activeDebtsData } = useQuery({
    queryKey: ["debts", false],
    queryFn: async () => (await debtsAPI.getAll(false)).data.debts,
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  // Each opening starts from its own values: the transaction being edited,
  // or an empty form with the opener's preset.
  useEffect(() => {
    if (!session.open) return;
    if (session.editing) loadForEdit(session.editing);
    else resetFormCompletely(session.options.preset);
    // Only when the window is opened again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  // A transaction touches balances, budgets, reports, debts and the
  // dashboard: every query on screen is refetched, the rest marked stale.
  const refreshAfterSave = () => queryClient.invalidateQueries();

  const afterCreate = () => {
    options.onSaved?.();
    if (options.closeOnSave) onClose();
    // Stays open for the next one: account, date and tags are kept.
    else resetFormPartial();
  };

  const errorDetail = (error: any) =>
    error.response?.data?.detail || error.message || "Unknown error";

  const createMutation = useMutation({
    mutationFn: (data: any) => transactionsAPI.create(data),
    onSuccess: () => {
      toast.success("Transaction created successfully!");
      afterCreate();
    },
    onError: (error: any) =>
      toast.error(`Failed to create transaction: ${errorDetail(error)}`),
    onSettled: refreshAfterSave,
  });

  // "Loan payment" in the form: booked as the Debts page books it, the
  // interest as an expense and the rest as capital repaid.
  const loanPaymentMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => debtsAPI.addPayment(data),
    onSuccess: (response: any) => {
      const { interest, principal } = response.data;
      const currency = sourceAccount?.currency || "EUR";
      toast.success(
        `Loan payment recorded: ${formatCurrencyUtil(interest, currency)} interest, ` +
          `${formatCurrencyUtil(principal, currency)} capital repaid`,
      );
      afterCreate();
    },
    onError: (error: any) =>
      toast.error(`Failed to record the loan payment: ${errorDetail(error)}`),
    onSettled: refreshAfterSave,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      transactionsAPI.update(id, data),
    onSuccess: () => {
      toast.success("Transaction updated successfully!");
      onClose();
    },
    onError: (error: any) =>
      toast.error(`Failed to update transaction: ${errorDetail(error)}`),
    onSettled: refreshAfterSave,
  });

  const resetFormPartial = () => {
    // Only reset amount, category, description, and recipient fields
    // Keep account, date, and tags for easier multiple transaction entry
    const currentValues = watch();
    resetForm({
      account_id: currentValues.account_id,
      date: currentValues.date,
      due_date: currentValues.due_date,
      amount: "",
      type_id: "",
      subtype_id: "",
      description: "",
      recipient: "",
      transfer_account_id: "",
      transfer_amount: "",
      tags: currentValues.tags,
      debt_id: "",
    });
    setAutoCategorizerConfidence(null);
    setRefundOf(null);
    setLoanPaymentType("monthly");
  };

  const resetFormCompletely = (preset: Partial<TransactionFormData> = {}) => {
    resetForm({ ...emptyForm(), ...preset });
    setSelectedFormOwner("");
    setAutoCategorizerConfidence(null);
    setRefundOf(null);
    setLoanPaymentType("monthly");
  };

  // Picking the expense a refund pays back. A refund comes from the
  // expense's recipient; a reimbursement asks who paid it.
  const handleRefundOf = (expense: RefundableExpense | null) => {
    setRefundOf(expense);
    clearErrors(["amount", "recipient"]);
    if (expense && refundKind === "refund")
      setValue("recipient", expense.destinataire || "");
  };

  const loadForEdit = (transaction: any) => {
    setRefundOf(
      transaction.refund_of
        ? {
            ...transaction.refund_of,
            type_id: transaction.type_id,
            type_name: transaction.type_name,
            subtype_name: transaction.subtype_name,
          }
        : null,
    );
    // Pre-select the owner: prefer explicit transaction owner_id, fall back to account's owner
    const effectiveOwnerId =
      transaction.owner_id ?? transaction.effective_owner_id;
    setSelectedFormOwner(effectiveOwnerId?.toString() || "");
    resetForm({
      account_id: transaction.account_id.toString(),
      date: transaction.date || format(new Date(), "yyyy-MM-dd"),
      due_date: transaction.due_date || "",
      amount: Math.abs(transaction.amount).toString(),
      // A refund shows as "Refund / Reimbursement"; it keeps its expense's category.
      type_id: transaction.refund_of
        ? REFUND_CATEGORY
        : transaction.type_id.toString(),
      subtype_id: transaction.refund_of
        ? refundKindOf(transaction)
        : transaction.subtype_id?.toString() || "",
      description: transaction.description || "",
      recipient: transaction.destinataire || "",
      transfer_account_id: transaction.transfer_account_id?.toString() || "",
      transfer_amount: transaction.transfer_amount?.toString() || "",
      tags: transaction.tags || "",
      debt_id: "",
    });
    setAutoCategorizerConfidence(null);
    // Trigger validation after reset to enable the Update button
    setTimeout(() => trigger(), 0);
  };

  const selectedType = categoriesData?.find(
    (c: any) => c.id === parseInt(formData.type_id || "0"),
  );
  const isTransfer = selectedType?.category === "transfer";

  // Form-only categories: a refund or reimbursement, or a loan payment.
  const mode =
    formData.type_id === REFUND_CATEGORY
      ? "refund"
      : formData.type_id === LOAN_CATEGORY
        ? "loan"
        : null;
  const refundKind: RefundKind | null =
    mode === "refund" &&
    (formData.subtype_id === "refund" || formData.subtype_id === "reimbursement")
      ? formData.subtype_id
      : null;
  const activeLoans = (activeDebtsData || []).filter(
    (d: any) => d.is_active === 1 || d.status === "active",
  );
  const loan =
    mode === "loan"
      ? activeLoans.find((d: any) => String(d.id) === formData.subtype_id)
      : undefined;

  const sourceAccount = accountsData?.find(
    (a: any) => a.id === parseInt(formData.account_id || "0"),
  );
  const destinationAccount = accountsData?.find(
    (a: any) => a.id === parseInt(formData.transfer_account_id || "0"),
  );
  const isDifferentCurrency =
    isTransfer &&
    sourceAccount &&
    destinationAccount &&
    sourceAccount.currency !== destinationAccount.currency;

  // A refund cannot exceed what is left on its expense: said as the
  // placeholder ("Max €20.00") and checked as soon as an amount is typed.
  const refundTooMuch =
    mode === "refund" && refundOf && !editingTransaction
      ? refundAmountError(
          Math.abs(parseFloat(formData.amount || "")),
          refundOf.remaining,
          refundOf.currency,
          sourceAccount?.currency,
        )
      : null;
  const amountField = (
    <FormField
      label={
        mode === "refund"
          ? "Amount received"
          : mode === "loan"
            ? "Payment amount"
            : "Amount"
      }
      required
      error={refundTooMuch || errors.amount?.message}
    >
      <Input
        type="number"
        step="0.01"
        {...register("amount")}
        className={refundTooMuch || errors.amount ? "border-error" : ""}
        placeholder={
          refundOf?.remaining != null && !editingTransaction
            ? refundMaxLabel(refundOf.remaining, refundOf.currency)
            : "0.00"
        }
      />
    </FormField>
  );

  const handleAutoCategorize = async () => {
    if (mode) return;
    const recipient = formData.recipient?.trim();
    const description = formData.description?.trim();

    // Recipient is required — the new approach looks up history by recipient
    if (!recipient) return;

    setAutoCategorizingDescription(true);
    setAutoCategorizerConfidence(null);
    try {
      const response = await transactionsAPI.autoCategorize(
        recipient,
        description,
      );
      const data = response.data;

      if (data.type_id) {
        setValue("type_id", data.type_id.toString());
        setValue(
          "subtype_id",
          data.subtype_id ? data.subtype_id.toString() : "",
        );
        trigger(["type_id", "subtype_id"]);
        // confidence is the percentage of past transactions that used this pair (0–1)
        setAutoCategorizerConfidence(data.confidence ?? null);
      }
    } catch (error: any) {
      // 404 = no history for this recipient — expected, not an error worth logging
      if (error?.response?.status !== 404) {
        console.error("Auto-categorization failed:", error);
      }
    } finally {
      setAutoCategorizingDescription(false);
    }
  };

  const onSubmit = (formValues: TransactionFormData) => {
    if (mode === "loan") return submitLoanPayment(formValues);
    if (mode === "refund") return submitRefund(formValues);
    const data = {
      account_id: parseInt(formValues.account_id),
      date: formValues.date,
      due_date: formValues.due_date || null,
      amount: parseFloat(formValues.amount),
      type_id: parseInt(formValues.type_id),
      subtype_id: formValues.subtype_id
        ? parseInt(formValues.subtype_id)
        : null,
      description: formValues.description || null,
      destinataire: formValues.recipient || null,
      transfer_account_id:
        isTransfer && formValues.transfer_account_id
          ? parseInt(formValues.transfer_account_id)
          : null,
      transfer_amount:
        isDifferentCurrency && formValues.transfer_amount
          ? parseFloat(formValues.transfer_amount)
          : null,
      is_pending: false,
      tags: formValues.tags || null,
      owner_id: selectedFormOwner ? parseInt(selectedFormOwner) : null,
    };

    if (editingTransaction) {
      updateMutation.mutate({ id: editingTransaction.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const submitRefund = (formValues: TransactionFormData) => {
    if (!refundKind) {
      setError("subtype_id", { message: "Choose refund or reimbursement" });
      return;
    }
    if (!refundOf) {
      toast.error("Choose the expense being paid back");
      return;
    }
    const amount = Math.abs(parseFloat(formValues.amount));
    const tooMuch =
      !editingTransaction &&
      refundAmountError(
        amount,
        refundOf.remaining,
        refundOf.currency,
        sourceAccount?.currency,
      );
    if (tooMuch) {
      setError("amount", { message: tooMuch });
      return;
    }
    if (refundKind === "reimbursement" && !formValues.recipient?.trim()) {
      setError("recipient", { message: "Who reimbursed you?" });
      return;
    }
    const data = {
      account_id: parseInt(formValues.account_id),
      date: formValues.date,
      due_date: null,
      amount,
      // The expense's category; the server enforces it anyway.
      type_id: refundOf.type_id,
      subtype_id: refundOf.subtype_id ?? null,
      description: formValues.description || null,
      destinataire:
        refundKind === "refund"
          ? refundOf.destinataire || formValues.recipient || null
          : formValues.recipient || null,
      transfer_account_id: null,
      transfer_amount: null,
      is_pending: false,
      tags: formValues.tags || null,
      owner_id: selectedFormOwner ? parseInt(selectedFormOwner) : null,
      refund_of_id: editingTransaction ? undefined : refundOf.id,
    };
    if (editingTransaction) {
      updateMutation.mutate({ id: editingTransaction.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const submitLoanPayment = (formValues: TransactionFormData) => {
    if (!loan) {
      setError("subtype_id", { message: "Choose the loan" });
      return;
    }
    loanPaymentMutation.mutate({
      debt_id: loan.id,
      account_id: parseInt(formValues.account_id),
      amount: Math.abs(parseFloat(formValues.amount)),
      payment_date: formValues.date,
      payment_type: loanPaymentType,
      notes: formValues.description || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent size="2xl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingTransaction ? "Edit Transaction" : "Add Transaction"}
          </DialogTitle>
          <DialogDescription>
            {editingTransaction
              ? "Update the transaction details below."
              : options.description || "Enter the details for your new transaction."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleFormSubmit(onSubmit)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            {/* Owner Field (a loan payment follows its account) */}
            {mode !== "loan" && (
              <FormField label="Owner" className="sm:col-span-1">
                <Select
                  value={selectedFormOwner}
                  onValueChange={setSelectedFormOwner}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None (account's owner)</SelectItem>
                    {ownersData?.map((owner: any) => (
                      <SelectItem key={owner.id} value={owner.id.toString()}>
                        {owner.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}

            {/* Account Field */}
            <FormField
              label="Account"
              required
              error={errors.account_id?.message}
              className="sm:col-span-1"
            >
              <Controller
                name="account_id"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={options.lockAccount}
                  >
                    <SelectTrigger
                      className={errors.account_id ? "border-error" : ""}
                    >
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accountsData?.map((account: any) => (
                        <SelectItem
                          key={account.id}
                          value={account.id.toString()}
                        >
                          {account.name} - {account.bank_name} (
                          {account.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            {/* Date Field */}
            <FormField label="Date" required error={errors.date?.message}>
              <Input
                type="date"
                {...register("date")}
                className={errors.date ? "border-error" : ""}
              />
            </FormField>

            {/* Due Date Field */}
            {!mode && (
              <FormField label="Due Date (Optional)">
                <Input type="date" {...register("due_date")} />
              </FormField>
            )}

            {/* Amount: after the expense or loan it is for, in those modes */}
            {!mode && amountField}

            {/* Category Field */}
            <FormField
              label="Category"
              required
              error={errors.type_id?.message}
            >
              <Controller
                name="type_id"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    // A refund keeps its expense's category: not changed here.
                    disabled={!!editingTransaction?.refund_of}
                    onValueChange={(value) => {
                      field.onChange(value);
                      setValue("subtype_id", ""); // Reset subcategory when category changes
                      setRefundOf(null);
                      clearErrors("subtype_id");
                    }}
                  >
                    <SelectTrigger
                      className={errors.type_id ? "border-error" : ""}
                    >
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriesData?.map((category: any) => (
                        <SelectItem
                          key={category.id}
                          value={category.id.toString()}
                        >
                          {category.name}
                        </SelectItem>
                      ))}
                      {(!editingTransaction || editingTransaction.refund_of) && (
                        <SpecialCategoryItems
                          loan={!editingTransaction && activeLoans.length > 0}
                        />
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            {/* Refund or reimbursement: which one, then the expense */}
            {mode === "refund" && (
              <FormField
                label="Refund or reimbursement"
                required
                error={errors.subtype_id?.message}
              >
                <Controller
                  name="subtype_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || ""}
                      disabled={!!editingTransaction}
                      onValueChange={(value) => {
                        field.onChange(value);
                        setRefundOf(null);
                        clearErrors("subtype_id");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose one" />
                      </SelectTrigger>
                      <SelectContent>
                        <RefundKindItems />
                      </SelectContent>
                    </Select>
                  )}
                />
                <div className="mt-1.5">
                  <RefundExplainer />
                </div>
              </FormField>
            )}
            {refundKind && (
              <RefundExpensePicker
                key={refundKind}
                kind={refundKind}
                value={refundOf}
                onChange={handleRefundOf}
                editing={!!editingTransaction}
              />
            )}
            {refundKind && (refundOf || editingTransaction) && amountField}

            {/* Loan payment: which loan, then booked like the Debts page */}
            {mode === "loan" && (
              <FormField
                label="Loan"
                required
                error={errors.subtype_id?.message}
              >
                <Controller
                  name="subtype_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || ""}
                      onValueChange={(value) => {
                        field.onChange(value);
                        clearErrors("subtype_id");
                        // Paid from the loan's account unless changed.
                        const picked = activeLoans.find(
                          (d: any) => String(d.id) === value,
                        );
                        if (picked?.linked_account_id && !options.lockAccount)
                          setValue(
                            "account_id",
                            String(picked.linked_account_id),
                            { shouldValidate: true },
                          );
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose the loan" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeLoans.map((debt: any) => (
                          <SelectItem key={debt.id} value={String(debt.id)}>
                            {debt.creditor} —{" "}
                            {formatCurrencyUtil(
                              debt.current_balance,
                              debt.currency,
                            )}{" "}
                            remaining
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            )}
            {loan && amountField}
            {loan && (
              <FormField label="Payment type">
                <Select
                  value={loanPaymentType}
                  onValueChange={(value) =>
                    setLoanPaymentType(value as "monthly" | "extra")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly payment</SelectItem>
                    <SelectItem value="extra">Extra payment</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            )}
            {loan && (
              <p className="sm:col-span-2 text-xs text-foreground-muted">
                {loanPaymentType === "monthly"
                  ? "Booked as on the Debts page: this month's interest as an expense (Debt Interest), the rest as capital repaid (Debt Principal)."
                  : "An extra payment is all capital repaid (Debt Principal): it lowers the loan and is not an expense."}
              </p>
            )}

            {/* Subcategory Field */}
            {formData.type_id && !mode && (
              <FormField label="Subcategory (Optional)">
                <Controller
                  name="subtype_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || ""}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select subcategory" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoriesData
                          ?.find(
                            (c: any) => c.id === parseInt(formData.type_id),
                          )
                          ?.subtypes?.map((subtype: any) => (
                            <SelectItem
                              key={subtype.id}
                              value={subtype.id.toString()}
                            >
                              {subtype.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            )}

            {/* Auto-categorizer confidence feedback */}
            {autoCategorizerConfidence !== null && (
              <div className="sm:col-span-2 flex items-center gap-2 text-xs">
                <span className="text-foreground-muted">
                  Based on history:
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full font-medium ${
                    autoCategorizerConfidence >= 0.7
                      ? "bg-success/15 text-success"
                      : autoCategorizerConfidence >= 0.4
                        ? "bg-warning/15 text-warning"
                        : "bg-error/15 text-error"
                  }`}
                >
                  {Math.round(autoCategorizerConfidence * 100)}% of past
                  transactions
                  {autoCategorizerConfidence < 0.4 && " — verify manually"}
                </span>
              </div>
            )}

            {/* Transfer Destination Account */}
            {isTransfer && (
              <FormField
                label="Destination Account"
                className="sm:col-span-2"
              >
                <Controller
                  name="transfer_account_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || ""}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select destination account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accountsData
                          ?.filter(
                            (account: any) =>
                              account.id !== parseInt(formData.account_id),
                          )
                          ?.map((account: any) => (
                            <SelectItem
                              key={account.id}
                              value={account.id.toString()}
                            >
                              {account.name} - {account.bank_name} (
                              {account.currency})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            )}

            {/* Cross-currency Transfer Amount */}
            {isDifferentCurrency && (
              <FormField
                label={`Amount in ${destinationAccount?.currency || "destination currency"}`}
                className="sm:col-span-2"
                helperText={`Source: ${formData.amount} ${sourceAccount?.currency || ""} → Destination: ${destinationAccount?.currency || ""}`}
              >
                <Input
                  type="number"
                  step="0.01"
                  {...register("transfer_amount")}
                  placeholder={`Amount in ${destinationAccount?.currency || ""}`}
                />
              </FormField>
            )}

            {/* Recipient Field (non-transfer). A refund comes from the
                expense's recipient; a reimbursement from whoever paid it. */}
            {!isTransfer &&
              (!mode ||
                (refundKind === "reimbursement" &&
                  (refundOf || editingTransaction))) && (
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="transaction-recipient">
                  {mode ? "Reimbursed by" : "Recipient"}
                </Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Controller
                      name="recipient"
                      control={control}
                      render={({ field }) => (
                        <Autocomplete
                          id="transaction-recipient"
                          options={recipientsData || []}
                          value={field.value || ""}
                          onChange={field.onChange}
                          placeholder={
                            mode
                              ? "The insurer, employer… who paid you back"
                              : "Select or enter recipient"
                          }
                          freeSolo
                          helperText="Select from previous recipients or enter a new one"
                        />
                      )}
                    />
                    {errors.recipient && (
                      <p className="text-xs text-error mt-1">
                        {errors.recipient.message}
                      </p>
                    )}
                  </div>
                  {!mode && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAutoCategorize}
                      disabled={
                        !formData.recipient?.trim() ||
                        autoCategorizingDescription
                      }
                      className="shrink-0"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      {autoCategorizingDescription
                        ? "Analyzing..."
                        : "Auto-Categorize"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Description Field */}
            <FormField
              label={mode === "loan" ? "Notes (Optional)" : "Description (Optional)"}
              htmlFor="transaction-description"
              className="sm:col-span-2"
            >
              <Input
                id="transaction-description"
                {...register("description")}
                placeholder="Additional notes or description"
              />
            </FormField>

            {/* Tags Field (a loan payment is tagged as the Debts page does) */}
            {mode !== "loan" && (
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="transaction-tags">Tags (Optional)</Label>
                <Controller
                  name="tags"
                  control={control}
                  render={({ field }) => (
                    <Autocomplete
                      id="transaction-tags"
                      options={tagsData || []}
                      value={field.value || ""}
                      onChange={field.onChange}
                      placeholder="Select or type tags (comma-separated)"
                      freeSolo
                      helperText="E.g., grocery, monthly, vacation"
                    />
                  )}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isValid || !!refundTooMuch}
              loading={
                createMutation.isPending ||
                updateMutation.isPending ||
                loanPaymentMutation.isPending
              }
            >
              {editingTransaction
                ? updateMutation.isPending
                  ? "Updating..."
                  : "Update Transaction"
                : createMutation.isPending
                  ? "Adding..."
                  : "Add Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
