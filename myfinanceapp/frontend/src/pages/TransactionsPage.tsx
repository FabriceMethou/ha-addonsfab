import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { transactionsAPI, accountsAPI, categoriesAPI } from '../services/api';
import { format } from 'date-fns';
import { useToast } from '../contexts/ToastContext';
import { transactionSchema, type TransactionFormData } from '../lib/validations';
import { formatCurrency as formatCurrencyUtil } from '../lib/utils';
import { sumMoney, subtractMoney, absMoney } from '../lib/money';
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
} from '../components/shadcn';
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
} from 'lucide-react';

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

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
      <div className={`absolute top-0 right-0 w-32 h-32 ${iconColor} opacity-5 blur-3xl rounded-full`} />

      <div className="relative">
        <div className="flex items-start justify-between mb-2 sm:mb-4">
          <div className={`p-2 sm:p-3 rounded-lg ${iconColor} bg-opacity-10 [&>svg]:w-5 [&>svg]:h-5 sm:[&>svg]:w-6 sm:[&>svg]:h-6`}>
            {icon}
          </div>
        </div>

        <div>
          <p className="text-xs sm:text-sm text-foreground-muted mb-0.5 sm:mb-1">{title}</p>
          {loading ? (
            <div className="h-6 sm:h-8 flex items-center">
              <Spinner className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          ) : (
            <p className="text-lg sm:text-2xl font-bold text-foreground truncate">{value}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function TransactionsPage() {
  const toast = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Filters with debounce
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    account_id: '',
    category_id: '',
    recipient: '',
    tags: '',
  });

  // Debounce text-based filters
  const debouncedFilters = useDebounce(filters, 500);

  // Form with validation
  const {
    control,
    register,
    handleSubmit: handleFormSubmit,
    formState: { errors, isValid },
    reset: resetForm,
    watch,
    setValue,
    trigger,
  } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    mode: 'onChange', // Validate on change for immediate feedback
    defaultValues: {
      account_id: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      due_date: '',
      amount: '',
      type_id: '',
      subtype_id: '',
      description: '',
      recipient: '',
      transfer_account_id: '',
      transfer_amount: '',
      tags: '',
    },
  });

  // Watch form values for conditional rendering
  const formData = watch();
  const [autoCategorizingDescription, setAutoCategorizingDescription] = useState(false);

  const queryClient = useQueryClient();

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedFilters, pageSize]);

  const { data: transactionsData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions', debouncedFilters],
    queryFn: async () => {
      const params: any = { limit: 1000 };
      if (debouncedFilters.start_date) params.start_date = debouncedFilters.start_date;
      if (debouncedFilters.end_date) params.end_date = debouncedFilters.end_date;
      if (debouncedFilters.account_id) params.account_id = debouncedFilters.account_id;
      if (debouncedFilters.category_id) params.type_id = debouncedFilters.category_id;

      const response = await transactionsAPI.getAll(params);
      let transactions = response.data.transactions;

      // Client-side filtering for recipient
      if (debouncedFilters.recipient) {
        const searchLower = debouncedFilters.recipient.toLowerCase();
        transactions = transactions.filter((t: any) =>
          (t.description?.toLowerCase().includes(searchLower)) ||
          (t.destinataire?.toLowerCase().includes(searchLower))
        );
      }

      // Client-side filtering for tags
      if (debouncedFilters.tags) {
        const tagLower = debouncedFilters.tags.toLowerCase();
        transactions = transactions.filter((t: any) =>
          t.tags?.toLowerCase().includes(tagLower)
        );
      }

      return transactions;
    },
  });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await accountsAPI.getAll();
      return response.data.accounts;
    },
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories-hierarchy'],
    queryFn: async () => {
      const response = await categoriesAPI.getHierarchy();
      return response.data.categories;
    },
  });

  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const response = await transactionsAPI.getAllTags();
      return response.data.tags;
    },
  });

  const { data: recipientsData } = useQuery({
    queryKey: ['recipients'],
    queryFn: async () => {
      const response = await transactionsAPI.getAllRecipients();
      return response.data.recipients;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => transactionsAPI.create(data),
    onMutate: async (newData: any) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['transactions', debouncedFilters] });

      // Snapshot the previous value
      const previousTransactions = queryClient.getQueryData(['transactions', debouncedFilters]);

      // Build optimistic transaction with available info
      const account = accountsData?.find((a: any) => a.id === newData.account_id);
      const category = categoriesData?.find((c: any) => c.id === newData.type_id);
      const subtype = category?.subtypes?.find((s: any) => s.id === newData.subtype_id);

      const optimisticTransaction = {
        id: Date.now(), // Temporary ID
        ...newData,
        account_name: account?.name || '',
        bank_name: account?.bank_name || '',
        account_currency: account?.currency || 'EUR',
        type_name: category?.name || '',
        subtype_name: subtype?.name || '',
        category: category?.category || '',
        // Amount sign based on category
        amount: category?.category === 'expense' ? -Math.abs(newData.amount) : Math.abs(newData.amount),
        _optimistic: true, // Flag for visual indication
      };

      // Optimistically update to the new value
      queryClient.setQueryData(['transactions', debouncedFilters], (old: any[] | undefined) => {
        if (!old) return [optimisticTransaction];
        return [optimisticTransaction, ...old];
      });

      // Return context with the previous value
      return { previousTransactions };
    },
    onError: (error: any, _newData, context) => {
      // Rollback to previous state on error
      if (context?.previousTransactions) {
        queryClient.setQueryData(['transactions', debouncedFilters], context.previousTransactions);
      }
      console.error('Failed to create transaction:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to create transaction: ${errorMessage}`);
    },
    onSuccess: () => {
      // Don't close dialog - allow adding multiple transactions
      resetFormPartial();
      toast.success('Transaction created successfully!');
    },
    onSettled: () => {
      // Always refetch after error or success to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      queryClient.invalidateQueries({ queryKey: ['transactions-summary'] });
      queryClient.invalidateQueries({ queryKey: ['recipients'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => transactionsAPI.update(id, data),
    onMutate: async ({ id, data: updatedData }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['transactions', debouncedFilters] });

      // Snapshot the previous value
      const previousTransactions = queryClient.getQueryData(['transactions', debouncedFilters]);

      // Build optimistic transaction with available info
      const account = accountsData?.find((a: any) => a.id === updatedData.account_id);
      const category = categoriesData?.find((c: any) => c.id === updatedData.type_id);
      const subtype = category?.subtypes?.find((s: any) => s.id === updatedData.subtype_id);

      // Optimistically update to the new value
      queryClient.setQueryData(['transactions', debouncedFilters], (old: any[] | undefined) => {
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
              amount: category?.category === 'expense' ? -Math.abs(updatedData.amount) : Math.abs(updatedData.amount),
              _optimistic: true,
            };
          }
          return t;
        });
      });

      // Return context with the previous value
      return { previousTransactions };
    },
    onError: (error: any, _variables, context) => {
      // Rollback to previous state on error
      if (context?.previousTransactions) {
        queryClient.setQueryData(['transactions', debouncedFilters], context.previousTransactions);
      }
      console.error('Failed to update transaction:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to update transaction: ${errorMessage}`);
    },
    onSuccess: () => {
      setOpenDialog(false);
      setEditingTransaction(null);
      resetFormCompletely();
      toast.success('Transaction updated successfully!');
    },
    onSettled: () => {
      // Always refetch after error or success to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      queryClient.invalidateQueries({ queryKey: ['transactions-summary'] });
      queryClient.invalidateQueries({ queryKey: ['recipients'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => transactionsAPI.delete(id),
    onMutate: async (deletedId: number) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['transactions', debouncedFilters] });

      // Snapshot the previous value
      const previousTransactions = queryClient.getQueryData(['transactions', debouncedFilters]);

      // Optimistically remove from the list
      queryClient.setQueryData(['transactions', debouncedFilters], (old: any[] | undefined) => {
        if (!old) return old;
        return old.filter((t: any) => t.id !== deletedId);
      });

      // Close UI elements immediately for better UX
      setDeleteConfirm(null);
      setExpandedRow(null);

      // Return context with the previous value
      return { previousTransactions };
    },
    onError: (error: any, _deletedId, context) => {
      // Rollback to previous state on error
      if (context?.previousTransactions) {
        queryClient.setQueryData(['transactions', debouncedFilters], context.previousTransactions);
      }
      console.error('Failed to delete transaction:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to delete transaction: ${errorMessage}`);
    },
    onSuccess: () => {
      toast.success('Transaction deleted successfully!');
    },
    onSettled: () => {
      // Always refetch after error or success to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      queryClient.invalidateQueries({ queryKey: ['transactions-summary'] });
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
      amount: '',
      type_id: '',
      subtype_id: '',
      description: '',
      recipient: '',
      transfer_account_id: '',
      transfer_amount: '',
      tags: currentValues.tags,
    });
  };

  const resetFormCompletely = () => {
    resetForm({
      account_id: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      due_date: '',
      amount: '',
      type_id: '',
      subtype_id: '',
      description: '',
      recipient: '',
      transfer_account_id: '',
      transfer_amount: '',
      tags: '',
    });
  };

  const clearFilters = () => {
    setFilters({
      start_date: '',
      end_date: '',
      account_id: '',
      category_id: '',
      recipient: '',
      tags: '',
    });
  };

  const hasActiveFilters = Object.values(filters).some(v => v);

  const handleEdit = (transaction: any) => {
    setEditingTransaction(transaction);
    resetForm({
      account_id: transaction.account_id.toString(),
      date: transaction.date || format(new Date(), 'yyyy-MM-dd'),
      due_date: transaction.due_date || '',
      amount: Math.abs(transaction.amount).toString(),
      type_id: transaction.type_id.toString(),
      subtype_id: transaction.subtype_id?.toString() || '',
      description: transaction.description || '',
      recipient: transaction.destinataire || '',
      transfer_account_id: transaction.transfer_account_id?.toString() || '',
      transfer_amount: transaction.transfer_amount?.toString() || '',
      tags: transaction.tags || '',
    });
    setOpenDialog(true);
    // Trigger validation after reset to enable the Update button
    setTimeout(() => trigger(), 0);
  };

  const selectedType = categoriesData?.find((c: any) => c.id === parseInt(formData.type_id || '0'));
  const isTransfer = selectedType?.category === 'transfer';

  const sourceAccount = accountsData?.find((a: any) => a.id === parseInt(formData.account_id || '0'));
  const destinationAccount = accountsData?.find((a: any) => a.id === parseInt(formData.transfer_account_id || '0'));
  const isDifferentCurrency = isTransfer && sourceAccount && destinationAccount &&
                              sourceAccount.currency !== destinationAccount.currency;

  const handleAutoCategorize = async () => {
    // Prioritize recipient for auto-categorization as it's more indicative of category
    const textToAnalyze = formData.recipient?.trim() || formData.description?.trim();
    if (!textToAnalyze) return;

    setAutoCategorizingDescription(true);
    try {
      const response = await transactionsAPI.autoCategorize(textToAnalyze);
      const data = response.data;

      if (data.type_id) {
        setValue('type_id', data.type_id.toString());
        setValue('subtype_id', data.subtype_id ? data.subtype_id.toString() : '');
        // Trigger validation after setting values
        trigger(['type_id', 'subtype_id']);
      }
    } catch (error) {
      console.error('Auto-categorization failed:', error);
    } finally {
      setAutoCategorizingDescription(false);
    }
  };

  const onSubmit = (formValues: TransactionFormData) => {
    const data = {
      account_id: parseInt(formValues.account_id),
      date: formValues.date,
      due_date: formValues.due_date || null,
      amount: parseFloat(formValues.amount),
      type_id: parseInt(formValues.type_id),
      subtype_id: formValues.subtype_id ? parseInt(formValues.subtype_id) : null,
      description: formValues.description || null,
      destinataire: formValues.recipient || null,
      transfer_account_id: isTransfer && formValues.transfer_account_id
        ? parseInt(formValues.transfer_account_id)
        : null,
      transfer_amount: isDifferentCurrency && formValues.transfer_amount
        ? parseFloat(formValues.transfer_amount)
        : null,
      is_pending: false,
      tags: formValues.tags || null,
    };

    if (editingTransaction) {
      updateMutation.mutate({ id: editingTransaction.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'EUR') => {
    return formatCurrencyUtil(Math.abs(amount), currency);
  };

  const formatTransactionDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Invalid Date';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return format(date, 'MMM dd, yyyy');
    } catch {
      return 'Invalid Date';
    }
  };

  const exportToCSV = () => {
    if (!transactionsData || transactionsData.length === 0) {
      toast.warning('No transactions to export');
      return;
    }

    const headers = ['ID', 'Date', 'Account', 'Amount', 'Currency', 'Category', 'Subcategory', 'Description', 'Recipient', 'Tags'];
    const rows = transactionsData.map((t: any) => [
      t.id,
      t.date || '',
      t.account_name || '',
      t.amount,
      t.account_currency || 'EUR',
      t.type_name || '',
      t.subtype_name || '',
      t.description || '',
      t.destinataire || '',
      t.tags || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) => row.map((field: any) => {
        const stringField = String(field);
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
          return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
      }).join(','))
    ].join('\n');

    const dataBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Calculate summary statistics using precise decimal arithmetic
  const incomeTransactions = (transactionsData || []).filter((t: any) => t.amount > 0 && t.category !== 'transfer');
  const expenseTransactions = (transactionsData || []).filter((t: any) => t.amount < 0 && t.category !== 'transfer');
  const totalIncome = sumMoney(incomeTransactions, (t: any) => t.amount);
  const totalExpenses = absMoney(sumMoney(expenseTransactions, (t: any) => t.amount));
  const netChange = subtractMoney(totalIncome, totalExpenses);

  // Pagination logic
  const totalTransactions = transactionsData?.length || 0;
  const totalPages = Math.ceil(totalTransactions / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedTransactions = transactionsData?.slice(startIndex, endIndex) || [];

  const toggleExpandRow = (id: number) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  if (transactionsLoading) {
    return <TransactionsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Transactions</h1>
        <p className="text-foreground-muted">
          {totalTransactions} transaction{totalTransactions !== 1 ? 's' : ''} • Track your financial activity
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <KPICard
          title="Total Transactions"
          value={totalTransactions.toString()}
          icon={<Receipt size={24} className="text-blue-500" />}
          iconColor="bg-blue-500"
          loading={transactionsLoading}
        />
        <KPICard
          title="Total Income"
          value={formatCurrency(totalIncome)}
          icon={<ArrowUpCircle size={24} className="text-emerald-500" />}
          iconColor="bg-emerald-500"
          loading={transactionsLoading}
        />
        <KPICard
          title="Total Expenses"
          value={formatCurrency(totalExpenses)}
          icon={<ArrowDownCircle size={24} className="text-rose-500" />}
          iconColor="bg-rose-500"
          loading={transactionsLoading}
        />
        <KPICard
          title="Net Change"
          value={formatCurrency(netChange)}
          icon={<Wallet size={24} className={netChange >= 0 ? "text-emerald-500" : "text-rose-500"} />}
          iconColor={netChange >= 0 ? "bg-emerald-500" : "bg-rose-500"}
          loading={transactionsLoading}
        />
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
        <Button
          variant={showFilters ? 'default' : 'outline'}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-4 h-4 mr-2" />
          Filters {hasActiveFilters && `(${Object.values(filters).filter(v => v).length})`}
        </Button>
        <Button
          variant="outline"
          onClick={exportToCSV}
          disabled={!transactionsData || transactionsData.length === 0}
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
        <Button onClick={() => {
          setEditingTransaction(null);
          resetFormCompletely();
          setOpenDialog(true);
        }}>
          <Plus className="w-4 h-4 mr-2" />
          Add Transaction
        </Button>
      </div>

      {/* Filters Section */}
      {showFilters && (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="filter-account">Account</Label>
              <Select
                value={filters.account_id}
                onValueChange={(value) => setFilters({ ...filters, account_id: value })}
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
              <Label htmlFor="filter-category">Category</Label>
              <Select
                value={filters.category_id}
                onValueChange={(value) => setFilters({ ...filters, category_id: value })}
              >
                <SelectTrigger id="filter-category">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Categories</SelectItem>
                  {categoriesData?.map((category: any) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      {category.name}
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
                value={filters.recipient}
                onChange={(value) => setFilters({ ...filters, recipient: value })}
                placeholder="Search recipient..."
                freeSolo
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-start-date">Start Date</Label>
              <Input
                id="filter-start-date"
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-end-date">End Date</Label>
              <Input
                id="filter-end-date"
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-tag">Tag</Label>
              <Autocomplete
                id="filter-tag"
                options={tagsData || []}
                value={filters.tags}
                onChange={(value) => setFilters({ ...filters, tags: value })}
                placeholder="Filter by tag..."
                freeSolo
              />
            </div>
          </div>
          <div className="flex justify-between items-center mt-4">
            <p className="text-sm text-foreground-muted">
              Found {totalTransactions} transaction{totalTransactions !== 1 ? 's' : ''}
            </p>
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
            {startIndex + 1}-{Math.min(endIndex, totalTransactions)} of {totalTransactions}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Transactions List */}
      <div className="space-y-2">
        {paginatedTransactions.map((transaction: any) => {
          const isTransfer = transaction.category === 'transfer';
          const isIncome = transaction.amount >= 0;
          const isExpanded = expandedRow === transaction.id;
          const amountDisplay = formatCurrency(transaction.amount, transaction.account_currency || 'EUR');

          // Determine amount color and sign
          let amountColor = isIncome ? 'text-success' : 'text-error';
          let amountSign = isIncome ? '+' : '-';
          if (isTransfer) {
            amountColor = 'text-foreground-muted';
            amountSign = '';
          }

          return (
            <Card
              key={transaction.id}
              className={`rounded-xl overflow-hidden border border-border bg-card/50 backdrop-blur-sm transition-all ${isExpanded ? 'ring-2 ring-primary/50' : ''}`}
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
                  <span className="text-foreground truncate flex-1 min-w-0">
                    {transaction.destinataire || transaction.description || '-'}
                  </span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`font-bold ${amountColor}`}>
                      {amountSign}{amountDisplay}
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
                      <p className="text-xs text-foreground-muted mb-1">Amount</p>
                      <p className={`text-sm font-bold ${amountColor}`}>
                        {amountSign}{amountDisplay}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-muted mb-1">Account</p>
                      <p className="text-sm font-medium text-foreground">
                        {transaction.account_name} - {transaction.bank_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-muted mb-1">Currency</p>
                      <p className="text-sm font-medium text-foreground">
                        {transaction.account_currency || 'EUR'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-muted mb-1">Category</p>
                      <div className="flex gap-1 flex-wrap">
                        <Badge variant="default" size="sm">{transaction.type_name}</Badge>
                        {transaction.subtype_name && (
                          <Badge variant="outline" size="sm">{transaction.subtype_name}</Badge>
                        )}
                      </div>
                    </div>
                    {transaction.destinataire && (
                      <div>
                        <p className="text-xs text-foreground-muted mb-1">Recipient</p>
                        <p className="text-sm font-medium text-foreground">
                          {transaction.destinataire}
                        </p>
                      </div>
                    )}
                    {transaction.description && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-foreground-muted mb-1">Description</p>
                        <p className="text-sm font-medium text-foreground">
                          {transaction.description}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-foreground-muted mb-1">Transaction ID</p>
                      <p className="text-sm font-medium text-foreground">#{transaction.id}</p>
                    </div>
                    {transaction.transfer_account_name && (
                      <>
                        <div>
                          <p className="text-xs text-foreground-muted mb-1">Transfer To</p>
                          <p className="text-sm font-medium text-foreground">
                            {transaction.transfer_account_name} - {transaction.transfer_bank_name || ''}
                          </p>
                        </div>
                        {transaction.transfer_amount && (
                          <div>
                            <p className="text-xs text-foreground-muted mb-1">Transfer Amount</p>
                            <p className="text-sm font-medium text-foreground">
                              {formatCurrency(transaction.transfer_amount, transaction.transfer_currency || 'EUR')}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    {transaction.due_date && (
                      <div>
                        <p className="text-xs text-foreground-muted mb-1">Due Date</p>
                        <p className="text-sm font-medium text-foreground">
                          {formatTransactionDate(transaction.due_date)}
                        </p>
                      </div>
                    )}
                    {transaction.tags && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-foreground-muted mb-1">Tags</p>
                        <div className="flex gap-1 flex-wrap">
                          {transaction.tags.split(',').map((tag: string, idx: number) => (
                            <Badge key={idx} variant="info" size="sm">
                              {tag.trim()}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-3 border-t border-border">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(transaction)}>
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
                {hasActiveFilters ? 'Try adjusting your filters' : 'Start by adding your first transaction'}
              </p>
              {!hasActiveFilters && (
                <Button onClick={() => {
                  setEditingTransaction(null);
                  resetFormCompletely();
                  setOpenDialog(true);
                }}>
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
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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
      <Dialog open={openDialog} onOpenChange={(open) => {
        if (!open) {
          setOpenDialog(false);
          setEditingTransaction(null);
          resetFormCompletely();
        }
      }}>
        <DialogContent size="2xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTransaction ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
            <DialogDescription>
              {editingTransaction ? 'Update the transaction details below.' : 'Enter the details for your new transaction.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFormSubmit(onSubmit)}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
              {/* Account Field */}
              <FormField
                label="Account"
                required
                error={errors.account_id?.message}
                className="sm:col-span-2"
              >
                <Controller
                  name="account_id"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className={errors.account_id ? 'border-error' : ''}>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accountsData?.map((account: any) => (
                          <SelectItem key={account.id} value={account.id.toString()}>
                            {account.name} - {account.bank_name} ({account.currency})
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
                  {...register('date')}
                  className={errors.date ? 'border-error' : ''}
                />
              </FormField>

              {/* Due Date Field */}
              <FormField label="Due Date (Optional)">
                <Input type="date" {...register('due_date')} />
              </FormField>

              {/* Amount Field */}
              <FormField label="Amount" required error={errors.amount?.message}>
                <Input
                  type="number"
                  step="0.01"
                  {...register('amount')}
                  className={errors.amount ? 'border-error' : ''}
                  placeholder="0.00"
                />
              </FormField>

              {/* Category Field */}
              <FormField label="Category" required error={errors.type_id?.message}>
                <Controller
                  name="type_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        setValue('subtype_id', ''); // Reset subcategory when category changes
                      }}
                    >
                      <SelectTrigger className={errors.type_id ? 'border-error' : ''}>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoriesData?.map((category: any) => (
                          <SelectItem key={category.id} value={category.id.toString()}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>

              {/* Subcategory Field */}
              {formData.type_id && (
                <FormField label="Subcategory (Optional)">
                  <Controller
                    name="subtype_id"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value || ''} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select subcategory" />
                        </SelectTrigger>
                        <SelectContent>
                          {categoriesData
                            ?.find((c: any) => c.id === parseInt(formData.type_id))
                            ?.subtypes?.map((subtype: any) => (
                              <SelectItem key={subtype.id} value={subtype.id.toString()}>
                                {subtype.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              )}

              {/* Transfer Destination Account */}
              {isTransfer && (
                <FormField label="Destination Account" className="sm:col-span-2">
                  <Controller
                    name="transfer_account_id"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value || ''} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select destination account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accountsData
                            ?.filter((account: any) => account.id !== parseInt(formData.account_id))
                            ?.map((account: any) => (
                              <SelectItem key={account.id} value={account.id.toString()}>
                                {account.name} - {account.bank_name} ({account.currency})
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
                  label={`Amount in ${destinationAccount?.currency || 'destination currency'}`}
                  className="sm:col-span-2"
                  helperText={`Source: ${formData.amount} ${sourceAccount?.currency || ''} → Destination: ${destinationAccount?.currency || ''}`}
                >
                  <Input
                    type="number"
                    step="0.01"
                    {...register('transfer_amount')}
                    placeholder={`Amount in ${destinationAccount?.currency || ''}`}
                  />
                </FormField>
              )}

              {/* Recipient Field (non-transfer) */}
              {!isTransfer && (
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="transaction-recipient">Recipient</Label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Controller
                        name="recipient"
                        control={control}
                        render={({ field }) => (
                          <Autocomplete
                            id="transaction-recipient"
                            options={recipientsData || []}
                            value={field.value || ''}
                            onChange={field.onChange}
                            placeholder="Select or enter recipient"
                            freeSolo
                            helperText="Select from previous recipients or enter a new one"
                          />
                        )}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAutoCategorize}
                      disabled={!formData.recipient?.trim() || autoCategorizingDescription}
                      className="shrink-0"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      {autoCategorizingDescription ? 'Analyzing...' : 'Auto-Categorize'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Description Field */}
              <FormField label="Description (Optional)" htmlFor="transaction-description" className="sm:col-span-2">
                <Input
                  id="transaction-description"
                  {...register('description')}
                  placeholder="Additional notes or description"
                />
              </FormField>

              {/* Tags Field */}
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="transaction-tags">Tags (Optional)</Label>
                <Controller
                  name="tags"
                  control={control}
                  render={({ field }) => (
                    <Autocomplete
                      id="transaction-tags"
                      options={tagsData || []}
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="Select or type tags (comma-separated)"
                      freeSolo
                      helperText="E.g., grocery, monthly, vacation"
                    />
                  )}
                />
              </div>
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
                disabled={!isValid}
                loading={createMutation.isPending || updateMutation.isPending}
              >
                {editingTransaction
                  ? (updateMutation.isPending ? 'Updating...' : 'Update Transaction')
                  : (createMutation.isPending ? 'Adding...' : 'Add Transaction')
                }
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
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
                <p className="text-sm"><strong>Date:</strong> {formatTransactionDate(deleteConfirm.date)}</p>
                <p className="text-sm"><strong>Amount:</strong> {formatCurrency(deleteConfirm.amount, deleteConfirm.account_currency)}</p>
                <p className="text-sm"><strong>Description:</strong> {deleteConfirm.description || '-'}</p>
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
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
