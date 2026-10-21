import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  transactionsAPI,
  accountsAPI,
  categoriesAPI,
  debtsAPI,
  investmentsAPI,
} from "../services/api";
import { format } from "date-fns";
import { useToast } from "../contexts/ToastContext";
import {
  transactionSchema,
  type TransactionFormData,
} from "../lib/validations";
import { formatCurrency as formatCurrencyUtil } from "../lib/utils";
import { subtractMoney, absMoney } from "../lib/money";
import {
  Card,
  Button,
  Badge,
  Input,
  Label,
  Spinner,
  Autocomplete,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  FormField,
  TransactionsSkeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from "../components/shadcn";
import {
  Plus,
  Edit2,
  Trash2,
  Filter,
  X,
  Download,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  RotateCcw,
} from "lucide-react";
import {
  LOAN_CATEGORY,
  REFUND_CATEGORY,
  RefundDialog,
  RefundExpensePicker,
  RefundExplainer,
  RefundKindItems,
  SpecialCategoryItems,
  expenseLabel,
  refundAmountError,
  refundKindOf,
  refundMaxLabel,
  type RefundKind,
  type RefundableExpense,
} from "../components/Refunds";

// KPI Card Component
interface KPICardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  iconColor: string;
  loading?: boolean;
}

function KPICard({ title, value, icon, iconColor, loading }: KPICardProps) {
  return (
    <Card className="relative overflow-hidden p-4 sm:p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
      {/* Background gradient effect */}
      <div
        className={`absolute top-0 right-0 w-32 h-32 ${iconColor} opacity-5 blur-3xl rounded-full`}
      />

      <div className="relative">
        <div className="flex items-start justify-between mb-2 sm:mb-4">
          <div
            className={`p-2 sm:p-3 rounded-lg ${iconColor} bg-opacity-10 [&>svg]:w-5 [&>svg]:h-5 sm:[&>svg]:w-6 sm:[&>svg]:h-6`}
          >
            {icon}
          </div>
        </div>

        <div>
          <p className="text-xs sm:text-sm text-foreground-muted mb-0.5 sm:mb-1">
            {title}
          </p>
          {loading ? (
            <div className="h-6 sm:h-8 flex items-center">
              <Spinner className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          ) : (
            <p className="text-lg sm:text-2xl font-bold text-foreground truncate">
              {value}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

const FLOW_TITLES: Record<string, string> = {
  income: "Counted as income in Monthly Income",
  expense: "Counted as expenses in Monthly Expenses",
  savings: "Behind Monthly Savings: income − expenses",
  invested: "Counted in Monthly Invested",
  investment_transfers: "Sent towards investments, not counted in Monthly Invested",
};

function FlowBanner({
  flow,
  startDate,
  endDate,
  count,
  totalAmount,
  totalIncome,
  totalExpense,
  currency,
  investedCard,
  onFlowChange,
  onClear,
}: {
  flow: string;
  startDate: string;
  endDate: string;
  count?: number;
  totalAmount?: number;
  totalIncome?: number;
  totalExpense?: number;
  currency: string;
  investedCard?: {
    total_invested: number;
    buy_count: number;
    transfer_count: number;
    unlinked_buy_count: number;
  };
  onFlowChange: (flow: string) => void;
  onClear: () => void;
}) {
  const period =
    startDate && endDate && startDate.slice(0, 7) === endDate.slice(0, 7)
      ? format(new Date(`${startDate}T00:00:00`), "MMMM yyyy")
      : [startDate, endDate].filter(Boolean).join(" – ");
  const money = (amount: number) => formatCurrencyUtil(amount, currency);
  const transactions = count === undefined ? "…" : `${count} transaction${count !== 1 ? "s" : ""}`;

  let detail: string;
  if (flow === "invested") {
    detail = investedCard
      ? `${investedCard.buy_count} buy${investedCard.buy_count !== 1 ? "s" : ""} (fees and tax included)` +
        ` + ${investedCard.transfer_count} transfer${investedCard.transfer_count !== 1 ? "s" : ""} into accounts without holdings` +
        ` · ${money(investedCard.total_invested)}` +
        (investedCard.unlinked_buy_count
          ? ` · ${investedCard.unlinked_buy_count} counted but not listed here (no cash transaction)`
          : "")
      : "…";
  } else if (totalAmount === undefined) {
    detail = transactions;
  } else if (flow === "savings" && totalIncome !== undefined && totalExpense !== undefined) {
    detail = `${transactions} · ${money(totalIncome)} − ${money(totalExpense)} = ${money(totalAmount)}`;
  } else if (flow === "income") {
    detail = `${transactions} · ${money(totalAmount)}`;
  } else {
    detail = `${transactions} · ${money(Math.abs(totalAmount))}`;
  }

  const investmentView = flow === "invested" || flow === "investment_transfers";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg bg-primary/10 border border-primary/20">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          {FLOW_TITLES[flow] ?? flow}
          {period && <span className="text-foreground-muted">, {period}</span>}
        </p>
        <p className="text-xs text-foreground-muted mt-0.5">{detail}</p>
      </div>
      {investmentView && (
        <Tabs value={flow} onValueChange={(value) => onFlowChange(String(value))}>
          <TabsList>
            <TabsTrigger value="invested">Counted</TabsTrigger>
            <TabsTrigger value="investment_transfers">Transfers not counted</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear this filter">
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function TransactionsPage() {
  const toast = useToast();
  const location = useLocation();
  const [openDialog, setOpenDialog] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [selectedFormOwner, setSelectedFormOwner] = useState<string>("");
  // The expense the transaction in the form pays back, when it is a refund.
  const [refundOf, setRefundOf] = useState<RefundableExpense | null>(null);
  // A loan payment from the form: monthly (interest + capital) or extra.
  const [loanPaymentType, setLoanPaymentType] = useState<"monthly" | "extra">(
    "monthly",
  );
  // The expense whose "Record refund" dialog is open.
  const [refundingExpense, setRefundingExpense] = useState<any>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Pending filters (what user is currently editing)
  const [pendingFilters, setPendingFilters] = useState({
    account_id: "",
    owner_id: "",
    category_id: "",
    subcategory_id: "",
    start_date: "",
    end_date: "",
    recipient: "",
    tags: "",
    flow: "",
  });

  // Applied filters (what's actually used for the query)
  const [appliedFilters, setAppliedFilters] = useState({
    account_id: "",
    owner_id: "",
    category_id: "",
    subcategory_id: "",
    start_date: "",
    end_date: "",
    recipient: "",
    tags: "",
    flow: "",
  });

  const [fromReports, setFromReports] = useState(false);
  const [pendingCategoryName, setPendingCategoryName] = useState<{
    category: string;
    subcategory?: string;
  } | null>(null);

  // Check if pending filters differ from applied filters
  const hasUnappliedChanges =
    JSON.stringify(pendingFilters) !== JSON.stringify(appliedFilters);

  // Apply filters when button is clicked
  const applyFilters = () => {
    setAppliedFilters({ ...pendingFilters });
  };

  // For backward compatibility with existing code
  const filters = pendingFilters;
  const debouncedFilters = appliedFilters;

  // Form with validation
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
    defaultValues: {
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
    },
  });

  // Watch form values for conditional rendering
  const formData = watch();
  const [autoCategorizingDescription, setAutoCategorizingDescription] =
    useState(false);
  const [autoCategorizerConfidence, setAutoCategorizerConfidence] = useState<
    number | null
  >(null);

  const queryClient = useQueryClient();

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedFilters, pageSize]);

  // Pre-apply filters when navigated from Reports page
  useEffect(() => {
    const state = location.state as any;
    if (state?.presetFilters) {
      const preset = state.presetFilters;
      const newFilters = {
        account_id: "",
        owner_id: "",
        category_id: "",
        subcategory_id: "",
        start_date: preset.start_date || "",
        end_date: preset.end_date || "",
        recipient: preset.recipient || "",
        tags: "",
        flow: preset.flow || "",
      };
      setPendingFilters(newFilters);
      setAppliedFilters(newFilters);
      // A dashboard card's banner explains the filter; keep the list in view.
      setShowFilters(!preset.flow);
      // The Recipients page and the dashboard cards explain their own preset.
      setFromReports(!preset.recipient && !preset.flow);
      if (preset.category_name) {
        setPendingCategoryName({
          category: preset.category_name,
          subcategory: preset.subcategory_name,
        });
      }
      // Clear state so back-navigation doesn't re-apply
      window.history.replaceState({}, document.title);
    }
    // Mount-only on purpose: this consumes the preset handed over by the
    // Reports page exactly once, then erases it from history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Translate the UI filters into API query params. Shared by the paginated
  // list and the summary so both always describe the same set of transactions.
  const buildFilterParams = (f: typeof appliedFilters) => {
    const params: any = {};
    if (f.start_date) params.start_date = f.start_date;
    if (f.end_date) params.end_date = f.end_date;
    if (f.account_id) params.account_id = f.account_id;
    if (f.owner_id) params.owner_id = f.owner_id;
    if (f.category_id) params.type_id = f.category_id;
    if (f.subcategory_id) params.subtype_id = f.subcategory_id;
    if (f.recipient) params.recipient = f.recipient;
    if (f.tags) params.tags = f.tags;
    if (f.flow) params.flow = f.flow;
    return params;
  };

  const { data: transactionsResponse, isLoading: transactionsLoading } =
    useQuery({
      queryKey: ["transactions", debouncedFilters, currentPage, pageSize],
      queryFn: async () => {
        const params = {
          ...buildFilterParams(debouncedFilters),
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        };

        const response = await transactionsAPI.getAll(params);
        const transactions = response.data.transactions;
        const total =
          response.data.total ?? response.data.count ?? transactions.length;

        return { transactions, total };
      },
      placeholderData: (prev) => prev,
    });

  // Totals for the whole filtered set — deliberately NOT derived from the
  // current page, and converted to the display currency server-side.
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["transactions-summary", "filtered", debouncedFilters],
    queryFn: async () => {
      const response = await transactionsAPI.getSummary(
        buildFilterParams(debouncedFilters),
      );
      return response.data;
    },
    placeholderData: (prev) => prev,
  });

  const transactionsData = transactionsResponse?.transactions;

  // Monthly Invested adds up investment buys, not ledger rows: its figure and
  // the buys without a cash transaction come from the card's own endpoint.
  const { data: investedCard } = useQuery({
    queryKey: [
      "investments-monthly-banner",
      debouncedFilters.start_date,
      debouncedFilters.end_date,
    ],
    queryFn: async () => {
      const response = await investmentsAPI.getMonthly({
        start_date: debouncedFilters.start_date || undefined,
        end_date: debouncedFilters.end_date || undefined,
      });
      return response.data;
    },
    enabled: debouncedFilters.flow === "invested",
  });

  const setFlow = (flow: string) => {
    setPendingFilters((f) => ({ ...f, flow }));
    setAppliedFilters((f) => ({ ...f, flow }));
  };

  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const response = await accountsAPI.getAll();
      return response.data.accounts;
    },
    staleTime: 30 * 60 * 1000,
  });

  const { data: ownersData } = useQuery({
    queryKey: ["owners"],
    queryFn: async () => {
      const response = await accountsAPI.getOwners();
      return response.data.owners;
    },
    staleTime: 30 * 60 * 1000,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["categories-hierarchy"],
    queryFn: async () => {
      const response = await categoriesAPI.getHierarchy();
      return response.data.categories;
    },
    staleTime: 30 * 60 * 1000,
  });

  // Resolve category/subcategory names → IDs once categories are loaded
  // (set by navigation from Reports)
  useEffect(() => {
    if (!pendingCategoryName || !categoriesData) return;
    const cat = categoriesData.find(
      (c: any) => c.name === pendingCategoryName.category,
    );
    if (cat) {
      const sub = pendingCategoryName.subcategory
        ? cat.subtypes?.find(
            (s: any) => s.name === pendingCategoryName.subcategory,
          )
        : undefined;
      const resolved = {
        category_id: cat.id.toString(),
        subcategory_id: sub ? sub.id.toString() : "",
      };
      setPendingFilters((prev) => ({ ...prev, ...resolved }));
      setAppliedFilters((prev) => ({ ...prev, ...resolved }));
    }
    setPendingCategoryName(null);
  }, [pendingCategoryName, categoriesData]);

  const { data: tagsData } = useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const response = await transactionsAPI.getAllTags();
      return response.data.tags;
    },
    staleTime: 30 * 60 * 1000,
  });

  const { data: recipientsData } = useQuery({
    queryKey: ["recipients"],
    queryFn: async () => {
      const response = await transactionsAPI.getAllRecipients();
      return response.data.recipients;
    },
    staleTime: 30 * 60 * 1000,
  });

  const { data: activeDebtsData } = useQuery({
    queryKey: ["debts", false],
    queryFn: async () => {
      const response = await debtsAPI.getAll(false);
      return response.data.debts;
    },
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => transactionsAPI.create(data),
    onMutate: async (newData: any) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ["transactions", debouncedFilters],
      });

      // Snapshot the previous value
      const previousTransactions = queryClient.getQueryData([
        "transactions",
        debouncedFilters,
      ]);

      // Build optimistic transaction with available info
      const account = accountsData?.find(
        (a: any) => a.id === newData.account_id,
      );
      const category = categoriesData?.find(
        (c: any) => c.id === newData.type_id,
      );
      const subtype = category?.subtypes?.find(
        (s: any) => s.id === newData.subtype_id,
      );

      const optimisticTransaction = {
        id: Date.now(), // Temporary ID
        ...newData,
        account_name: account?.name || "",
        bank_name: account?.bank_name || "",
        account_currency: account?.currency || "EUR",
        type_name: category?.name || "",
        subtype_name: subtype?.name || "",
        category: category?.category || "",
        // Amount sign based on category; a refund is positive
        amount:
          category?.category === "expense" && !newData.refund_of_id
            ? -Math.abs(newData.amount)
            : Math.abs(newData.amount),
        _optimistic: true, // Flag for visual indication
      };

      // Optimistically update to the new value
      queryClient.setQueryData(
        ["transactions", debouncedFilters],
        (old: any[] | undefined) => {
          if (!old) return [optimisticTransaction];
          return [optimisticTransaction, ...old];
        },
      );

      // Return context with the previous value
      return { previousTransactions };
    },
    onError: (error: any, _newData, context) => {
      // Rollback to previous state on error
      if (context?.previousTransactions) {
        queryClient.setQueryData(
          ["transactions", debouncedFilters],
          context.previousTransactions,
        );
      }
      console.error("Failed to create transaction:", error);
      const errorMessage =
        error.response?.data?.detail || error.message || "Unknown error";
      toast.error(`Failed to create transaction: ${errorMessage}`);
    },
    onSuccess: () => {
      // Don't close dialog - allow adding multiple transactions
      resetFormPartial();
      toast.success("Transaction created successfully!");
    },
    onSettled: () => {
      // Always refetch after error or success to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts-summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["spending-prediction"] });
      queryClient.invalidateQueries({ queryKey: ["debts"] });
      queryClient.invalidateQueries({ queryKey: ["debts-summary"] });
      queryClient.invalidateQueries({ queryKey: ["debt-payments"] });
      queryClient.invalidateQueries({ queryKey: ["refundable"] });
      queryClient.invalidateQueries({ queryKey: ["budgets-vs-actual"] });
    },
  });

  // "Loan payment" in the form: booked as the Debts page books it, the
  // interest as an expense and the rest as capital repaid.
  const loanPaymentMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => debtsAPI.addPayment(data),
    onSuccess: (response: any) => {
      const { interest, principal } = response.data;
      const currency = sourceAccount?.currency || "EUR";
      resetFormPartial();
      toast.success(
        `Loan payment recorded: ${formatCurrencyUtil(interest, currency)} interest, ` +
          `${formatCurrencyUtil(principal, currency)} capital repaid`,
      );
    },
    onError: (error: any) =>
      toast.error(
        `Failed to record the loan payment: ${error.response?.data?.detail || error.message}`,
      ),
    onSettled: () => {
      for (const key of [
        "transactions",
        "accounts-summary",
        "transactions-summary",
        "spending-prediction",
        "budgets-vs-actual",
        "debts",
        "debts-summary",
        "debt-payments",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      transactionsAPI.update(id, data),
    onMutate: async ({ id, data: updatedData }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ["transactions", debouncedFilters],
      });

      // Snapshot the previous value
      const previousTransactions = queryClient.getQueryData([
        "transactions",
        debouncedFilters,
      ]);

      // Build optimistic transaction with available info
      const account = accountsData?.find(
        (a: any) => a.id === updatedData.account_id,
      );
      const category = categoriesData?.find(
        (c: any) => c.id === updatedData.type_id,
      );
      const subtype = category?.subtypes?.find(
        (s: any) => s.id === updatedData.subtype_id,
      );

      // Optimistically update to the new value
      queryClient.setQueryData(
        ["transactions", debouncedFilters],
        (old: any[] | undefined) => {
          if (!old) return old;
          return old.map((t: any) => {
            if (t.id === id) {
              return {
                ...t,
                ...updatedData,
                account_name: account?.name || t.account_name,
                bank_name: account?.bank_name || t.bank_name,
                account_currency: account?.currency || t.account_currency,
                type_name: category?.name || t.type_name,
                subtype_name: subtype?.name || t.subtype_name,
                category: category?.category || t.category,
                amount:
                  category?.category === "expense"
                    ? -Math.abs(updatedData.amount)
                    : Math.abs(updatedData.amount),
                _optimistic: true,
              };
            }
            return t;
          });
        },
      );

      // Return context with the previous value
      return { previousTransactions };
    },
    onError: (error: any, _variables, context) => {
      // Rollback to previous state on error
      if (context?.previousTransactions) {
        queryClient.setQueryData(
          ["transactions", debouncedFilters],
          context.previousTransactions,
        );
      }
      console.error("Failed to update transaction:", error);
      const errorMessage =
        error.response?.data?.detail || error.message || "Unknown error";
      toast.error(`Failed to update transaction: ${errorMessage}`);
    },
    onSuccess: () => {
      setOpenDialog(false);
      setEditingTransaction(null);
      resetFormCompletely();
      toast.success("Transaction updated successfully!");
    },
    onSettled: () => {
      // Always refetch after error or success to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts-summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["spending-prediction"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => transactionsAPI.delete(id),
    onMutate: async (deletedId: number) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ["transactions", debouncedFilters],
      });

      // Snapshot the previous value
      const previousTransactions = queryClient.getQueryData([
        "transactions",
        debouncedFilters,
      ]);

      // Optimistically remove from the list
      queryClient.setQueryData(
        ["transactions", debouncedFilters],
        (old: any[] | undefined) => {
          if (!old) return old;
          return old.filter((t: any) => t.id !== deletedId);
        },
      );

      // Close UI elements immediately for better UX
      setDeleteConfirm(null);
      setExpandedRow(null);

      // Return context with the previous value
      return { previousTransactions };
    },
    onError: (error: any, _deletedId, context) => {
      // Rollback to previous state on error
      if (context?.previousTransactions) {
        queryClient.setQueryData(
          ["transactions", debouncedFilters],
          context.previousTransactions,
        );
      }
      console.error("Failed to delete transaction:", error);
      const errorMessage =
        error.response?.data?.detail || error.message || "Unknown error";
      toast.error(`Failed to delete transaction: ${errorMessage}`);
    },
    onSuccess: () => {
      toast.success("Transaction deleted successfully!");
    },
    onSettled: () => {
      // Always refetch after error or success to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts-summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
      queryClient.invalidateQueries({ queryKey: ["spending-prediction"] });
    },
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

  const resetFormCompletely = () => {
    resetForm({
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
    setSelectedFormOwner("");
    setAutoCategorizerConfidence(null);
  };

  const clearFilters = () => {
    const emptyFilters = {
      account_id: "",
      owner_id: "",
      category_id: "",
      subcategory_id: "",
      start_date: "",
      end_date: "",
      recipient: "",
      tags: "",
      flow: "",
    };
    setPendingFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setFromReports(false);
  };

  const hasActiveFilters =
    Object.values(appliedFilters).some((v) => v) ||
    Object.values(pendingFilters).some((v) => v);

  useEffect(() => {
    if (!openDialog) setRefundOf(null);
  }, [openDialog]);

  const refreshAfterRefund = () => {
    for (const key of [
      "transactions",
      "accounts-summary",
      "transactions-summary",
      "recipients",
      "spending-prediction",
      "budgets-vs-actual",
      "refundable",
    ]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  // Picking the expense a refund pays back. A refund comes from the
  // expense's recipient; a reimbursement asks who paid it.
  const handleRefundOf = (expense: RefundableExpense | null) => {
    setRefundOf(expense);
    clearErrors(["amount", "recipient"]);
    if (expense && refundKind === "refund")
      setValue("recipient", expense.destinataire || "");
  };

  const handleEdit = (transaction: any) => {
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
    setEditingTransaction(transaction);
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
    setOpenDialog(true);
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

  const formatCurrency = (amount: number, currency: string = "EUR") => {
    return formatCurrencyUtil(Math.abs(amount), currency);
  };

  const formatTransactionDate = (
    dateString: string | null | undefined,
  ): string => {
    if (!dateString) return "Invalid Date";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "Invalid Date";
      return format(date, "MMM dd, yyyy");
    } catch {
      return "Invalid Date";
    }
  };

  const exportToCSV = () => {
    if (!transactionsData || transactionsData.length === 0) {
      toast.warning("No transactions to export");
      return;
    }

    const headers = [
      "ID",
      "Date",
      "Account",
      "Amount",
      "Currency",
      "Category",
      "Subcategory",
      "Description",
      "Recipient",
      "Tags",
    ];
    const rows = transactionsData.map((t: any) => [
      t.id,
      t.date || "",
      t.account_name || "",
      t.amount,
      t.account_currency || "EUR",
      t.type_name || "",
      t.subtype_name || "",
      t.description || "",
      t.destinataire || "",
      t.tags || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row: any[]) =>
        row
          .map((field: any) => {
            const stringField = String(field);
            if (
              stringField.includes(",") ||
              stringField.includes('"') ||
              stringField.includes("\n")
            ) {
              return `"${stringField.replace(/"/g, '""')}"`;
            }
            return stringField;
          })
          .join(","),
      ),
    ].join("\n");

    const dataBlob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `transactions_${format(new Date(), "yyyy-MM-dd_HHmmss")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Summary statistics for every transaction matching the current filters,
  // already converted to the display currency by the backend.
  const { totalIncome, totalExpenses, netChange, summaryCurrency } =
    useMemo(() => {
      const inc = summaryData?.total_income ?? 0;
      const exp = absMoney(summaryData?.total_expense ?? 0);
      return {
        totalIncome: inc,
        totalExpenses: exp,
        netChange: subtractMoney(inc, exp),
        summaryCurrency: summaryData?.currency ?? "EUR",
      };
    }, [summaryData]);

  // Pagination logic — server-side, total from API
  const totalTransactions = transactionsResponse?.total || 0;
  const totalPages = Math.ceil(totalTransactions / pageSize);
  const paginatedTransactions = transactionsData || [];

  const toggleExpandRow = (id: number) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  if (transactionsLoading) {
    return <TransactionsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Transactions"
        description="All your financial transactions"
        accentColor="border-l-rose-500"
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
        <KPICard
          title="Total Transactions"
          value={totalTransactions.toString()}
          icon={<Receipt size={24} className="text-blue-500" />}
          iconColor="bg-blue-500"
          loading={transactionsLoading}
        />
        <KPICard
          title="Total Income"
          value={formatCurrency(totalIncome, summaryCurrency)}
          icon={<ArrowUpCircle size={24} className="text-emerald-500" />}
          iconColor="bg-emerald-500"
          loading={summaryLoading}
        />
        <KPICard
          title="Total Expenses"
          value={formatCurrency(totalExpenses, summaryCurrency)}
          icon={<ArrowDownCircle size={24} className="text-rose-500" />}
          iconColor="bg-rose-500"
          loading={summaryLoading}
        />
        <KPICard
          title="Net Change"
          // Signed on purpose: a negative net change must not read as a gain
          value={formatCurrencyUtil(netChange, summaryCurrency)}
          icon={
            <Wallet
              size={24}
              className={netChange >= 0 ? "text-emerald-500" : "text-rose-500"}
            />
          }
          iconColor={netChange >= 0 ? "bg-emerald-500" : "bg-rose-500"}
          loading={summaryLoading}
        />
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
        <Button
          variant={showFilters ? "default" : "outline"}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-4 h-4 mr-2" />
          Filters{" "}
          {hasActiveFilters &&
            `(${Object.values(filters).filter((v) => v).length})`}
        </Button>
        <Button
          variant="outline"
          onClick={exportToCSV}
          disabled={!transactionsData || transactionsData.length === 0}
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
        <Button
          onClick={() => {
            setEditingTransaction(null);
            resetFormCompletely();
            setOpenDialog(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Transaction
        </Button>
      </div>

      {/* Opened from a dashboard card: say what the list is and what it adds up to */}
      {appliedFilters.flow && (
        <FlowBanner
          flow={appliedFilters.flow}
          startDate={appliedFilters.start_date}
          endDate={appliedFilters.end_date}
          count={transactionsResponse?.total}
          totalAmount={summaryData?.total_amount}
          totalIncome={summaryData?.total_income}
          totalExpense={summaryData?.total_expense}
          currency={summaryData?.currency ?? "EUR"}
          investedCard={investedCard}
          onFlowChange={setFlow}
          onClear={clearFilters}
        />
      )}

      {/* Filters Section */}
      {showFilters && (
        <Card className="relative z-10 p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          {fromReports && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-xs text-primary font-medium">
                Filtered from Reports
              </span>
              <button
                className="ml-auto text-primary/60 hover:text-primary transition-colors"
                onClick={() => {
                  clearFilters();
                }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="filter-account">Account</Label>
              <Select
                value={pendingFilters.account_id}
                onValueChange={(value) =>
                  setPendingFilters({ ...pendingFilters, account_id: value })
                }
              >
                <SelectTrigger id="filter-account">
                  <SelectValue placeholder="All Accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Accounts</SelectItem>
                  {accountsData?.map((account: any) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name} - {account.bank_name} ({account.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-owner">Owner</Label>
              <Select
                value={pendingFilters.owner_id}
                onValueChange={(value) =>
                  setPendingFilters({ ...pendingFilters, owner_id: value })
                }
              >
                <SelectTrigger id="filter-owner">
                  <SelectValue placeholder="All Owners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Owners</SelectItem>
                  {ownersData?.map((owner: any) => (
                    <SelectItem key={owner.id} value={owner.id.toString()}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-category">Category</Label>
              <Select
                value={pendingFilters.category_id}
                onValueChange={(value) =>
                  // A subcategory only makes sense within its parent category
                  setPendingFilters({
                    ...pendingFilters,
                    category_id: value,
                    subcategory_id: "",
                  })
                }
              >
                <SelectTrigger id="filter-category">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Categories</SelectItem>
                  {categoriesData?.map((category: any) => (
                    <SelectItem
                      key={category.id}
                      value={category.id.toString()}
                    >
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-subcategory">Subcategory</Label>
              <Select
                value={pendingFilters.subcategory_id}
                onValueChange={(value) =>
                  setPendingFilters({
                    ...pendingFilters,
                    subcategory_id: value,
                  })
                }
                disabled={!pendingFilters.category_id}
              >
                <SelectTrigger id="filter-subcategory">
                  <SelectValue placeholder="All Subcategories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Subcategories</SelectItem>
                  {categoriesData
                    ?.find(
                      (c: any) =>
                        c.id.toString() === pendingFilters.category_id,
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-recipient">Recipient</Label>
              <Autocomplete
                id="filter-recipient"
                options={recipientsData || []}
                value={pendingFilters.recipient}
                onChange={(value) =>
                  setPendingFilters({ ...pendingFilters, recipient: value })
                }
                placeholder="Search recipient..."
                freeSolo
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-start-date">Start Date</Label>
              <Input
                id="filter-start-date"
                type="date"
                value={pendingFilters.start_date}
                onChange={(e) =>
                  setPendingFilters({
                    ...pendingFilters,
                    start_date: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-end-date">End Date</Label>
              <Input
                id="filter-end-date"
                type="date"
                value={pendingFilters.end_date}
                onChange={(e) =>
                  setPendingFilters({
                    ...pendingFilters,
                    end_date: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-tag">Tag</Label>
              <Autocomplete
                id="filter-tag"
                options={tagsData || []}
                value={pendingFilters.tags}
                onChange={(value) =>
                  setPendingFilters({ ...pendingFilters, tags: value })
                }
                placeholder="Filter by tag..."
                freeSolo
              />
            </div>
          </div>
          <div className="flex justify-between items-center mt-4">
            <p className="text-sm text-foreground-muted">
              Found {totalTransactions} transaction
              {totalTransactions !== 1 ? "s" : ""}
              {hasUnappliedChanges && (
                <span className="text-warning ml-2">
                  (filters changed - click Apply)
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={applyFilters}
                disabled={!hasUnappliedChanges}
              >
                <Filter className="w-4 h-4 mr-2" />
                Apply Filters
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
              >
                <X className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Pagination Controls - Top */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground-muted">Show</span>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => setPageSize(parseInt(value))}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-foreground-muted">per page</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground-muted">
            {(currentPage - 1) * pageSize + 1}-
            {Math.min(currentPage * pageSize, totalTransactions)} of{" "}
            {totalTransactions}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium px-2">
            Page {currentPage} of {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Transactions List */}
      <div className="space-y-2">
        {paginatedTransactions.map((transaction: any) => {
          const isTransfer = transaction.category === "transfer";
          const isIncome = transaction.amount >= 0;
          const isExpanded = expandedRow === transaction.id;
          const amountDisplay = formatCurrency(
            transaction.amount,
            transaction.account_currency || "EUR",
          );

          // Determine amount color and sign
          // For transfers: positive = money arriving (green), negative = money leaving (red)
          let amountColor = isIncome ? "text-success" : "text-error";
          let amountSign = isIncome ? "+" : "-";
          if (isTransfer) {
            amountColor = isIncome ? "text-blue-400" : "text-orange-400";
            amountSign = isIncome ? "+" : "-";
          }

          // Build transfer direction label
          const transferLabel =
            isTransfer && transaction.transfer_account_name
              ? isIncome
                ? `From ${transaction.transfer_account_name}`
                : `To ${transaction.transfer_account_name}`
              : null;

          return (
            <Card
              key={transaction.id}
              className={`rounded-xl overflow-hidden border border-border bg-card/50 backdrop-blur-sm transition-all ${isExpanded ? "ring-2 ring-primary/50" : ""}`}
            >
              {/* Collapsed View - Click to Expand */}
              <div
                className="p-4 cursor-pointer hover:bg-surface-hover transition-colors"
                onClick={() => toggleExpandRow(transaction.id)}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm text-foreground-muted w-24 flex-shrink-0">
                    {formatTransactionDate(transaction.date)}
                  </div>
                  <Badge variant="outline" size="sm" className="flex-shrink-0">
                    {transaction.type_name}
                  </Badge>
                  <div className="truncate flex-1 min-w-0">
                    <span className="text-foreground">
                      {transaction.destinataire ||
                        transaction.description ||
                        "-"}
                    </span>
                    {transferLabel && (
                      <span className={`ml-2 text-xs ${amountColor}`}>
                        {transferLabel}
                      </span>
                    )}
                    {transaction.refund_of && (
                      <Badge variant="info" size="sm" className="ml-2">
                        Refund
                      </Badge>
                    )}
                    {transaction.refunded_amount > 0 && (
                      <Badge variant="success" size="sm" className="ml-2">
                        {transaction.refunded_amount >= Math.abs(transaction.amount) - 0.005
                          ? "Fully refunded"
                          : `Refunded ${formatCurrency(
                              transaction.refunded_amount,
                              transaction.account_currency || "EUR",
                            )}`}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`font-bold ${amountColor}`}>
                      {amountSign}
                      {amountDisplay}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-foreground-muted" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-foreground-muted" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded View */}
              {isExpanded && (
                <div className="border-t border-border px-4 py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-foreground-muted mb-1">Date</p>
                      <p className="text-sm font-medium text-foreground">
                        {formatTransactionDate(transaction.date)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-muted mb-1">
                        Amount
                      </p>
                      <p className={`text-sm font-bold ${amountColor}`}>
                        {amountSign}
                        {amountDisplay}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-muted mb-1">
                        Account
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {transaction.account_name} - {transaction.bank_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-muted mb-1">
                        Currency
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {transaction.account_currency || "EUR"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-muted mb-1">
                        Category
                      </p>
                      <div className="flex gap-1 flex-wrap">
                        <Badge variant="default" size="sm">
                          {transaction.type_name}
                        </Badge>
                        {transaction.subtype_name && (
                          <Badge variant="outline" size="sm">
                            {transaction.subtype_name}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {transaction.destinataire && (
                      <div>
                        <p className="text-xs text-foreground-muted mb-1">
                          Recipient
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {transaction.destinataire}
                        </p>
                      </div>
                    )}
                    {transaction.description && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-foreground-muted mb-1">
                          Description
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {transaction.description}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-foreground-muted mb-1">
                        Transaction ID
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        #{transaction.id}
                      </p>
                    </div>
                    {transaction.transfer_account_name && (
                      <>
                        <div>
                          <p className="text-xs text-foreground-muted mb-1">
                            {isTransfer && isIncome
                              ? "Transfer From"
                              : "Transfer To"}
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {transaction.transfer_account_name} -{" "}
                            {transaction.transfer_bank_name || ""}
                          </p>
                        </div>
                        {transaction.transfer_amount && (
                          <div>
                            <p className="text-xs text-foreground-muted mb-1">
                              Transfer Amount
                            </p>
                            <p className="text-sm font-medium text-foreground">
                              {formatCurrency(
                                transaction.transfer_amount,
                                transaction.transfer_currency || "EUR",
                              )}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    {transaction.due_date && (
                      <div>
                        <p className="text-xs text-foreground-muted mb-1">
                          Due Date
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {formatTransactionDate(transaction.due_date)}
                        </p>
                      </div>
                    )}
                    {transaction.tags && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-foreground-muted mb-1">
                          Tags
                        </p>
                        <div className="flex gap-1 flex-wrap">
                          {transaction.tags
                            .split(",")
                            .map((tag: string, idx: number) => (
                              <Badge key={idx} variant="info" size="sm">
                                {tag.trim()}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Refund link, either side */}
                  {transaction.refund_of && (
                    <p className="text-sm text-foreground-muted mb-3">
                      Refund of:{" "}
                      <span className="text-foreground">
                        {expenseLabel(transaction.refund_of)}
                      </span>
                    </p>
                  )}
                  {transaction.refunded_amount > 0 && (
                    <p className="text-sm text-foreground-muted mb-3">
                      Refunded{" "}
                      <span className="text-foreground">
                        {formatCurrency(
                          transaction.refunded_amount,
                          transaction.account_currency || "EUR",
                        )}
                      </span>{" "}
                      of{" "}
                      {formatCurrency(
                        transaction.amount,
                        transaction.account_currency || "EUR",
                      )}{" "}
                      ({transaction.refund_count} refund
                      {transaction.refund_count !== 1 ? "s" : ""})
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(transaction)}
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-error border-error hover:bg-error/10"
                      onClick={() => setDeleteConfirm(transaction)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                    {transaction.category === "expense" &&
                      transaction.amount < 0 &&
                      !transaction.refund_of &&
                      (transaction.refunded_amount || 0) <
                        Math.abs(transaction.amount) - 0.005 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRefundingExpense(transaction)}
                        >
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Record refund
                        </Button>
                      )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {paginatedTransactions.length === 0 && (
          <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <div className="flex flex-col items-center justify-center min-h-[300px]">
              <Receipt className="h-20 w-20 text-foreground-muted mb-4" />
              <h2 className="text-xl font-semibold text-foreground-muted mb-2">
                No Transactions Found
              </h2>
              <p className="text-sm text-foreground-muted mb-6">
                {hasActiveFilters
                  ? "Try adjusting your filters"
                  : "Start by adding your first transaction"}
              </p>
              {!hasActiveFilters && (
                <Button
                  onClick={() => {
                    setEditingTransaction(null);
                    resetFormCompletely();
                    setOpenDialog(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Transaction
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Pagination Controls - Bottom */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
          >
            First
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          <span className="flex items-center px-4 text-sm text-foreground-muted">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage >= totalPages}
          >
            Last
          </Button>
        </div>
      )}

      {/* Add/Edit Transaction Dialog */}
      <Dialog
        open={openDialog}
        onOpenChange={(open) => {
          if (!open) {
            setOpenDialog(false);
            setEditingTransaction(null);
            resetFormCompletely();
          }
        }}
      >
        <DialogContent size="2xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTransaction ? "Edit Transaction" : "Add Transaction"}
            </DialogTitle>
            <DialogDescription>
              {editingTransaction
                ? "Update the transaction details below."
                : "Enter the details for your new transaction."}
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
                    <Select value={field.value} onValueChange={field.onChange}>
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
                          if (picked?.linked_account_id)
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
                onClick={() => {
                  setOpenDialog(false);
                  setEditingTransaction(null);
                  resetFormCompletely();
                }}
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

      {/* Record a refund of an expense */}
      <RefundDialog
        expense={refundingExpense}
        accounts={accountsData || []}
        onClose={() => setRefundingExpense(null)}
        onRecorded={refreshAfterRefund}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription className="sr-only">
              Confirm deletion of this transaction from your records.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-foreground-muted mb-4">
              Are you sure you want to delete this transaction?
            </p>
            {deleteConfirm && (
              <div className="p-4 rounded-lg bg-surface">
                <p className="text-sm">
                  <strong>Date:</strong>{" "}
                  {formatTransactionDate(deleteConfirm.date)}
                </p>
                <p className="text-sm">
                  <strong>Amount:</strong>{" "}
                  {formatCurrency(
                    deleteConfirm.amount,
                    deleteConfirm.account_currency,
                  )}
                </p>
                <p className="text-sm">
                  <strong>Description:</strong>{" "}
                  {deleteConfirm.description || "-"}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(deleteConfirm.id)}
              loading={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
