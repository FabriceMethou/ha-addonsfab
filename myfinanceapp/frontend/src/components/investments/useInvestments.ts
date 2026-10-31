// State, data and actions of the Investments page.
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../contexts/ToastContext";
import { investmentsAPI, accountsAPI } from "../../services/api";
import { format } from "date-fns";
import { formatCurrency as formatCurrencyUtil } from "../../lib/utils";
import { useIsMobile } from "../../hooks/useBreakpoint";
import { usePriceUpdates } from "./usePriceUpdates";
import { TAB_HOLDINGS, type SecurityFormData, type HoldingFormData, type TransactionFormData } from "./shared";

export function useInvestments() {
  const isMobile = useIsMobile();
  const [expandedSecurity, setExpandedSecurity] = useState<number | null>(null);
  const [expandedHolding, setExpandedHolding] = useState<number | null>(null);
  const [expandedInvTx, setExpandedInvTx] = useState<number | null>(null);

  // In the address, so another page can link straight to a tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabValue = searchParams.get("tab") || TAB_HOLDINGS;
  const setTabValue = (value: number | string) =>
    setSearchParams(
      (params) => {
        params.set("tab", String(value));
        return params;
      },
      { replace: true },
    );

  const [ownerFilter, setOwnerFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [holdingDialog, setHoldingDialog] = useState(false);
  const [transactionDialog, setTransactionDialog] = useState(false);
  const [securityDialog, setSecurityDialog] = useState(false);
  const [editingHolding, setEditingHolding] = useState<any>(null);
  const [editingSecurity, setEditingSecurity] = useState<any>(null);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);

  const [holdingForm, setHoldingForm] = useState<HoldingFormData>({
    security_id: "",
    account_id: "",
    quantity: "",
    purchase_price: "",
    purchase_date: format(new Date(), "yyyy-MM-dd"),
    notes: "",
  });

  const [securityForm, setSecurityForm] = useState<SecurityFormData>({
    symbol: "",
    name: "",
    investment_type: "stock",
    isin: "",
    exchange: "",
    currency: "EUR",
    sector: "",
    country: "",
    notes: "",
  });

  const [lookingUpISIN, setLookingUpISIN] = useState(false);

  // Manual price update state
  const [manualPriceDialog, setManualPriceDialog] = useState(false);
  const [manualPriceHolding, setManualPriceHolding] = useState<any>(null);
  const [manualPrice, setManualPrice] = useState("");

  const [transactionForm, setTransactionForm] = useState<TransactionFormData>({
    account_id: "",
    holding_id: "",
    transaction_type: "buy",
    quantity: "",
    price: "",
    transaction_date: format(new Date(), "yyyy-MM-dd"),
    fees: "0",
    tax: "0",
    notes: "",
  });

  const queryClient = useQueryClient();
  const toast = useToast();

  const handleSecurityISINLookup = async () => {
    const isin = securityForm.isin.trim();

    if (!isin) {
      toast.error("Please enter an ISIN code");
      return;
    }

    // Validate ISIN format (12 alphanumeric characters)
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) {
      toast.error(
        "Invalid ISIN format. ISIN should be 12 characters: 2 letters + 9 alphanumeric + 1 digit",
      );
      return;
    }

    setLookingUpISIN(true);
    try {
      const response = await investmentsAPI.lookupISIN(isin);
      const data = response.data;

      if (data.success && data.symbol) {
        setSecurityForm({
          ...securityForm,
          symbol: data.symbol || securityForm.symbol,
          name: data.name || securityForm.name,
          investment_type: data.investment_type || securityForm.investment_type,
          exchange: data.exchange || securityForm.exchange,
          currency: data.currency || securityForm.currency,
        });
        toast.success(
          "ISIN lookup successful! Security details have been filled in.",
        );
      } else {
        toast.error("ISIN lookup failed: No data found for this ISIN");
      }
    } catch (error: any) {
      console.error("ISIN lookup failed:", error);

      // Provide more specific error messages
      let errorText = "ISIN lookup failed: ";
      if (error.response?.status === 400) {
        errorText +=
          error.response?.data?.detail || "Invalid ISIN or API error";
      } else if (error.response?.status === 401) {
        errorText += "Authentication required. Please login.";
      } else if (error.response?.status === 429) {
        errorText += "API rate limit exceeded. Please try again later.";
      } else {
        errorText += error.response?.data?.detail || "Unknown error occurred";
      }
      toast.error(errorText);
    } finally {
      setLookingUpISIN(false);
    }
  };

  // Fetch securities
  const { data: securitiesData } = useQuery({
    queryKey: ["investments-securities"],
    queryFn: async () => {
      const response = await investmentsAPI.getSecurities();
      return response.data.securities;
    },
  });

  // Fetch investment accounts
  const {
    data: investmentAccounts,
    error: accountsError,
    isLoading: accountsLoading,
  } = useQuery({
    queryKey: ["investment-accounts"],
    queryFn: async () => {
      try {
        const response = await accountsAPI.getAll();

        if (!response || !response.data || !response.data.accounts) {
          throw new Error(
            "Invalid API response format - missing accounts array",
          );
        }

        const allAccounts = response.data.accounts;

        if (!Array.isArray(allAccounts)) {
          throw new Error("Accounts data is not an array");
        }

        const investmentAccounts = allAccounts.filter(
          (account) => account.account_type === "investment",
        );

        return investmentAccounts;
      } catch (error: any) {
        console.error("Detailed error in accounts query:", {
          message: error.message,
          stack: error.stack,
          response: error.response?.data,
          status: error.response?.status,
        });
        throw error;
      }
    },
    retry: 3, // Retry failed requests up to 3 times
    staleTime: 30 * 60 * 1000,
  });

  // Fetch holdings
  const {
    data: holdingsData,
    isLoading: holdingsLoading,
    isError: holdingsError,
    refetch: refetchHoldings,
  } = useQuery({
    queryKey: ["investments-holdings"],
    queryFn: async () => {
      const response = await investmentsAPI.getHoldings();
      return response.data.holdings;
    },
  });

  // Fetch summary
  const { data: summaryData } = useQuery({
    queryKey: ["investments-summary", ownerFilter, accountFilter],
    queryFn: async () => {
      const response = await investmentsAPI.getSummary({
        ...(ownerFilter ? { owner_id: Number(ownerFilter) } : {}),
        ...(accountFilter ? { account_id: Number(accountFilter) } : {}),
      });
      return response.data;
    },
  });

  // Fetch transactions
  const { data: transactionsData } = useQuery({
    queryKey: ["investments-transactions"],
    queryFn: async () => {
      const response = await investmentsAPI.getTransactions();
      return response.data.transactions;
    },
  });

  // Create security mutation
  const createSecurityMutation = useMutation({
    mutationFn: (data: any) => investmentsAPI.createSecurity(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investments-securities"] });
      setSecurityDialog(false);
      resetSecurityForm();
    },
  });

  // Update security mutation
  const updateSecurityMutation = useMutation({
    mutationFn: ({ id, data }: any) => investmentsAPI.updateSecurity(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investments-securities"] });
      queryClient.invalidateQueries({ queryKey: ["investments-holdings"] });
      setSecurityDialog(false);
      resetSecurityForm();
      setEditingSecurity(null);
    },
  });

  // Delete security mutation
  const deleteSecurityMutation = useMutation({
    mutationFn: (id: number) => investmentsAPI.deleteSecurity(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investments-securities"] });
      setDeleteConfirm(null);
      toast.success("Security deleted successfully!");
    },
    onError: (error: any) => {
      console.error("Failed to delete security:", error);
      const errorMessage =
        error.response?.data?.detail || error.message || "Unknown error";
      setDeleteConfirm(null);
      toast.error(`Failed to delete security: ${errorMessage}`);
    },
  });

  // Create holding mutation
  const createHoldingMutation = useMutation({
    mutationFn: (data: any) => investmentsAPI.createHolding(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investments-holdings"] });
      queryClient.invalidateQueries({ queryKey: ["investments-summary"] });

      // Show success message
      toast.success("Holding created successfully!");

      // Close dialog immediately
      setHoldingDialog(false);
      resetHoldingForm();
    },
    onError: (error: any) => {
      console.error("Failed to create holding:", error);
      const errorMessage =
        error.response?.data?.detail || error.message || "Unknown error";
      toast.error(`Failed to create holding: ${errorMessage}`);
    },
  });

  // Update holding mutation
  const updateHoldingMutation = useMutation({
    mutationFn: ({ id, data }: any) => investmentsAPI.updateHolding(id, data),
    onSuccess: () => {
      // Invalidate and refetch the queries
      queryClient.invalidateQueries({ queryKey: ["investments-holdings"] });
      queryClient.invalidateQueries({ queryKey: ["investments-summary"] });

      // Show success message
      toast.success("Holding updated successfully!");

      // Close dialog immediately
      setHoldingDialog(false);
      resetHoldingForm();
      setEditingHolding(null);
    },
    onError: (error: any) => {
      console.error("Failed to update holding:", error);
      const errorMessage =
        error.response?.data?.detail || error.message || "Unknown error";
      toast.error(`Failed to update holding: ${errorMessage}`);
    },
  });

  // Delete holding mutation
  const deleteHoldingMutation = useMutation({
    mutationFn: (id: number) => investmentsAPI.deleteHolding(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investments-holdings"] });
      queryClient.invalidateQueries({ queryKey: ["investments-summary"] });
      setDeleteConfirm(null);
      toast.success("Holding deleted successfully!");
    },
    onError: (error: any) => {
      console.error("Failed to delete holding:", error);
      const errorMessage =
        error.response?.data?.detail || error.message || "Unknown error";
      setDeleteConfirm(null);
      toast.error(`Failed to delete holding: ${errorMessage}`);
    },
  });

  // Create transaction mutation
  const createTransactionMutation = useMutation({
    mutationFn: (data: any) => investmentsAPI.createTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investments-holdings"] });
      queryClient.invalidateQueries({ queryKey: ["investments-summary"] });
      queryClient.invalidateQueries({ queryKey: ["investments-transactions"] });

      // Show success message
      toast.success("Transaction added successfully!");

      // Keep holding and date, but reset other fields for next transaction
      setTransactionForm((prev) => ({
        ...prev,
        // Keep: holding_id, transaction_date
        // Reset: quantity, price, fees, tax, notes, but keep transaction_type
        quantity: "",
        price: "",
        fees: "0",
        tax: "0",
        notes: "",
      }));
    },
    onError: (error: any) => {
      console.error("Failed to create transaction:", error);
      // Handle Pydantic validation errors (array of error objects)
      let errorMessage = "Unknown error";
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          // Pydantic validation error format
          errorMessage = error.response.data.detail
            .map((err: any) => `${err.loc?.join(".") || "field"}: ${err.msg}`)
            .join(", ");
        } else if (typeof error.response.data.detail === "string") {
          errorMessage = error.response.data.detail;
        } else {
          errorMessage = JSON.stringify(error.response.data.detail);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast.error(`Failed to create transaction: ${errorMessage}`);
    },
  });

  // Update transaction mutation
  const updateTransactionMutation = useMutation({
    mutationFn: ({ id, data }: any) =>
      investmentsAPI.updateTransaction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investments-holdings"] });
      queryClient.invalidateQueries({ queryKey: ["investments-summary"] });
      queryClient.invalidateQueries({ queryKey: ["investments-transactions"] });

      // Show success message
      toast.success("Transaction updated successfully!");

      // Close dialog immediately
      setTransactionDialog(false);
      resetTransactionForm();
      setEditingTransaction(null);
    },
    onError: (error: any) => {
      console.error("Failed to update transaction:", error);
      // Handle Pydantic validation errors (array of error objects)
      let errorMessage = "Unknown error";
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          // Pydantic validation error format
          errorMessage = error.response.data.detail
            .map((err: any) => `${err.loc?.join(".") || "field"}: ${err.msg}`)
            .join(", ");
        } else if (typeof error.response.data.detail === "string") {
          errorMessage = error.response.data.detail;
        } else {
          errorMessage = JSON.stringify(error.response.data.detail);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast.error(`Failed to update transaction: ${errorMessage}`);
    },
  });

  // Delete transaction mutation
  const deleteTransactionMutation = useMutation({
    mutationFn: (id: number) => investmentsAPI.deleteTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investments-holdings"] });
      queryClient.invalidateQueries({ queryKey: ["investments-summary"] });
      queryClient.invalidateQueries({ queryKey: ["investments-transactions"] });
      setDeleteConfirm(null);
      toast.success("Transaction deleted successfully!");
    },
    onError: (error: any) => {
      console.error("Failed to delete transaction:", error);
      const errorMessage =
        error.response?.data?.detail || error.message || "Unknown error";
      setDeleteConfirm(null);
      toast.error(`Failed to delete transaction: ${errorMessage}`);
    },
  });

  // Update single holding price mutation
  const updateHoldingPriceMutation = useMutation({
    mutationFn: (holdingId: number) =>
      investmentsAPI.updateHoldingPrice(holdingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investments-holdings"] });
      queryClient.invalidateQueries({ queryKey: ["investments-summary"] });
      // Price updated successfully
    },
    onError: (error: any) => {
      console.error("Failed to update holding price:", error);
    },
  });

  // Track last update result for showing summary
  const {
    lastUpdateResult,
    setLastUpdateResult,
    priceUpdateRunning,
    priceUpdateProgress,
    updateAllPricesMutation,
  } = usePriceUpdates();

  const updateManualPriceMutation = useMutation({
    mutationFn: ({
      holding_id,
      price,
    }: {
      holding_id: number;
      price: number;
    }) => investmentsAPI.updateHolding(holding_id, { current_price: price }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investments-holdings"] });
      queryClient.invalidateQueries({ queryKey: ["investments-summary"] });
      toast.success("Price updated successfully!");
      setManualPriceDialog(false);
      setManualPrice("");
      setManualPriceHolding(null);
    },
    onError: (error: any) => {
      console.error("Failed to update price:", error);
      const errorMessage =
        error.response?.data?.detail || error.message || "Unknown error";
      toast.error(`Failed to update price: ${errorMessage}`);
    },
  });

  const resetSecurityForm = () => {
    setSecurityForm({
      symbol: "",
      name: "",
      investment_type: "stock",
      isin: "",
      exchange: "",
      currency: "EUR",
      sector: "",
      country: "",
      notes: "",
    });
  };

  const resetHoldingForm = () => {
    setHoldingForm({
      security_id: "",
      account_id: "",
      quantity: "",
      purchase_price: "",
      purchase_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    });
  };

  const resetTransactionForm = () => {
    setTransactionForm({
      account_id: "",
      holding_id: "",
      transaction_type: "buy",
      quantity: "",
      price: "",
      transaction_date: format(new Date(), "yyyy-MM-dd"),
      fees: "0",
      tax: "0",
      notes: "",
    });
  };

  const handleEditSecurity = (security: any) => {
    setEditingSecurity(security);
    setSecurityForm({
      symbol: security.symbol,
      name: security.name,
      investment_type: security.investment_type,
      isin: security.isin || "",
      exchange: security.exchange || "",
      currency: security.currency || "EUR",
      sector: security.sector || "",
      country: security.country || "",
      notes: security.notes || "",
    });
    setSecurityDialog(true);
  };

  const handleEditHolding = (holding: any) => {
    setEditingHolding(holding);
    setHoldingForm({
      security_id: holding.security_id.toString(),
      account_id: holding.account_id.toString(),
      quantity: holding.quantity.toString(),
      purchase_price: holding.average_cost.toString(),
      purchase_date: holding.purchase_date || format(new Date(), "yyyy-MM-dd"),
      notes: holding.notes || "",
    });
    setHoldingDialog(true);
  };

  const handleEditTransaction = (transaction: any) => {
    setEditingTransaction(transaction);
    // Find the holding to get the account_id
    const holding = holdingsData?.find(
      (h: any) => h.id === transaction.holding_id,
    );
    setTransactionForm({
      account_id: holding?.account_id?.toString() || "",
      holding_id: transaction.holding_id.toString(),
      transaction_type: transaction.transaction_type,
      quantity: transaction.quantity?.toString() || "",
      price: transaction.price?.toString() || "",
      transaction_date:
        transaction.transaction_date || format(new Date(), "yyyy-MM-dd"),
      fees: transaction.fees?.toString() || "0",
      tax: transaction.tax?.toString() || "0",
      notes: transaction.notes || "",
    });
    setTransactionDialog(true);
  };

  const handleSubmitSecurity = () => {
    const data = {
      symbol: securityForm.symbol,
      name: securityForm.name,
      investment_type: securityForm.investment_type,
      isin: securityForm.isin || undefined,
      exchange: securityForm.exchange || undefined,
      currency: securityForm.currency,
      sector: securityForm.sector || undefined,
      country: securityForm.country || undefined,
      notes: securityForm.notes || undefined,
    };

    if (editingSecurity) {
      updateSecurityMutation.mutate({ id: editingSecurity.id, data });
    } else {
      createSecurityMutation.mutate(data);
    }
  };

  // A holding with trades takes its quantity and cost from them; the dialog
  // then edits only what the holding itself owns.
  const quantityFromTrades =
    !!editingHolding && (editingHolding.transaction_count || 0) > 0;

  const handleSubmitHolding = () => {
    // Validate required fields
    if (!holdingForm.account_id) {
      toast.error("Please select an investment account");
      return;
    }

    if (!holdingForm.security_id) {
      toast.error("Please select a security");
      return;
    }

    if (!quantityFromTrades) {
      if (!holdingForm.quantity || isNaN(parseFloat(holdingForm.quantity))) {
        toast.error("Please enter a valid quantity");
        return;
      }

      if (
        !holdingForm.purchase_price ||
        isNaN(parseFloat(holdingForm.purchase_price))
      ) {
        toast.error("Please enter a valid purchase price");
        return;
      }

      if (!holdingForm.purchase_date) {
        toast.error("Please enter a purchase date");
        return;
      }
    }

    const data = {
      security_id: parseInt(holdingForm.security_id),
      account_id: parseInt(holdingForm.account_id),
      notes: holdingForm.notes,
      ...(quantityFromTrades
        ? {}
        : {
            quantity: parseFloat(holdingForm.quantity),
            purchase_price: parseFloat(holdingForm.purchase_price),
            purchase_date: holdingForm.purchase_date,
          }),
    };

    if (editingHolding) {
      updateHoldingMutation.mutate({ id: editingHolding.id, data });
    } else {
      createHoldingMutation.mutate(data);
    }
  };

  const handleSubmitTransaction = () => {
    const data = {
      holding_id: parseInt(transactionForm.holding_id),
      transaction_type: transactionForm.transaction_type,
      // For dividend transactions, quantity is not used (set to 0)
      quantity:
        transactionForm.transaction_type === "dividend"
          ? 0
          : parseFloat(transactionForm.quantity),
      price: parseFloat(transactionForm.price),
      transaction_date: transactionForm.transaction_date,
      // Dividends have no fees; the field is hidden for them.
      fees:
        transactionForm.transaction_type === "dividend"
          ? 0
          : parseFloat(transactionForm.fees) || 0,
      tax: parseFloat(transactionForm.tax) || 0,
      notes: transactionForm.notes,
    };

    if (editingTransaction) {
      updateTransactionMutation.mutate({ id: editingTransaction.id, data });
    } else {
      createTransactionMutation.mutate(data);
    }
  };

  const displayCurrency = summaryData?.display_currency || "EUR";

  const formatCurrency = (amount: number) => {
    return formatCurrencyUtil(amount, displayCurrency);
  };

  const totalValue = summaryData?.total_value || 0;
  const totalCost = summaryData?.total_cost || 0;

  // Count auto-updateable holdings (stocks, ETFs, mutual funds - not bonds/crypto)
  const autoUpdateableTypes = ["stock", "etf", "mutual_fund"];
  const autoUpdateableCount =
    holdingsData?.filter((h: any) =>
      autoUpdateableTypes.includes(h.investment_type?.toLowerCase()),
    ).length || 0;
  const manualOnlyCount = (holdingsData?.length || 0) - autoUpdateableCount;

  const { data: owners } = useQuery({
    queryKey: ["owners"],
    queryFn: async () => (await accountsAPI.getOwners()).data.owners || [],
  });

  const matchesFilters = (holding: any) => {
    if (accountFilter && String(holding.account_id) !== accountFilter) return false;
    if (!ownerFilter) return true;
    const account = investmentAccounts?.find((a: any) => a.id === holding.account_id);
    return String(account?.owner_id) === ownerFilter;
  };
  const filteredHoldings: any[] = (holdingsData || []).filter(matchesFilters);
  const isClosed = (holding: any) => (holding.quantity || 0) <= 0;
  const closedCount = filteredHoldings.filter(isClosed).length;
  // What is held, biggest first. A sold-out holding stays out of the way until asked for.
  const visibleHoldings = filteredHoldings
    .filter((holding) => showClosed || !isClosed(holding))
    .sort((a, b) => (b.current_value_display || 0) - (a.current_value_display || 0));
  const openHoldings = filteredHoldings.filter((holding) => !isClosed(holding));
  const filteredIds = new Set(filteredHoldings.map((holding) => holding.id));
  const visibleTrades: any[] = (transactionsData || []).filter((trade: any) =>
    filteredIds.has(trade.holding_id),
  );


  return {
    ownerFilter,
    setOwnerFilter,
    accountFilter,
    setAccountFilter,
    showClosed,
    setShowClosed,
    owners,
    closedCount,
    visibleHoldings,
    openHoldings,
    visibleTrades,
    isMobile,
    expandedSecurity,
    setExpandedSecurity,
    expandedHolding,
    setExpandedHolding,
    expandedInvTx,
    setExpandedInvTx,
    tabValue,
    setTabValue,
    holdingDialog,
    setHoldingDialog,
    transactionDialog,
    setTransactionDialog,
    securityDialog,
    setSecurityDialog,
    editingHolding,
    setEditingHolding,
    editingSecurity,
    setEditingSecurity,
    editingTransaction,
    setEditingTransaction,
    deleteConfirm,
    setDeleteConfirm,
    holdingForm,
    setHoldingForm,
    securityForm,
    setSecurityForm,
    lookingUpISIN,
    manualPriceDialog,
    setManualPriceDialog,
    manualPriceHolding,
    setManualPriceHolding,
    manualPrice,
    setManualPrice,
    transactionForm,
    setTransactionForm,
    handleSecurityISINLookup,
    securitiesData,
    investmentAccounts,
    accountsError,
    accountsLoading,
    holdingsData,
    holdingsLoading,
    holdingsError,
    refetchHoldings,
    summaryData,
    createSecurityMutation,
    updateSecurityMutation,
    deleteSecurityMutation,
    createHoldingMutation,
    updateHoldingMutation,
    deleteHoldingMutation,
    createTransactionMutation,
    updateTransactionMutation,
    deleteTransactionMutation,
    updateHoldingPriceMutation,
    lastUpdateResult,
    setLastUpdateResult,
    priceUpdateRunning,
    priceUpdateProgress,
    updateAllPricesMutation,
    updateManualPriceMutation,
    resetSecurityForm,
    resetHoldingForm,
    resetTransactionForm,
    handleEditSecurity,
    handleEditHolding,
    handleEditTransaction,
    handleSubmitSecurity,
    quantityFromTrades,
    handleSubmitHolding,
    handleSubmitTransaction,
    formatCurrency,
    totalValue,
    totalCost,
    autoUpdateableCount,
    manualOnlyCount,
  };
}

export type InvestmentsState = ReturnType<typeof useInvestments>;
