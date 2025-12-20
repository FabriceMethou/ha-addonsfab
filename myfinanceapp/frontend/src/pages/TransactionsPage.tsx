import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transactionsAPI, accountsAPI, categoriesAPI } from '../services/api';
import { format } from 'date-fns';
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
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

export default function TransactionsPage() {
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

  const [formData, setFormData] = useState({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      queryClient.invalidateQueries({ queryKey: ['transactions-summary'] });
      queryClient.invalidateQueries({ queryKey: ['recipients'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      // Don't close dialog - allow adding multiple transactions
      // setOpenDialog(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => transactionsAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      queryClient.invalidateQueries({ queryKey: ['transactions-summary'] });
      queryClient.invalidateQueries({ queryKey: ['recipients'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setOpenDialog(false);
      setEditingTransaction(null);
      resetFormCompletely();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => transactionsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      queryClient.invalidateQueries({ queryKey: ['transactions-summary'] });
      setDeleteConfirm(null);
      setExpandedRow(null);
    },
  });

  const resetForm = () => {
    // Only reset amount, category, description, and recipient fields
    // Keep account, date, and tags for easier multiple transaction entry
    setFormData((prev) => ({
      ...prev,
      amount: '',
      type_id: '',
      subtype_id: '',
      description: '',
      recipient: '',
      transfer_account_id: '',
      transfer_amount: '',
    }));
  };

  const resetFormCompletely = () => {
    setFormData({
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
    setFormData({
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
  };

  const selectedType = categoriesData?.find((c: any) => c.id === parseInt(formData.type_id));
  const isTransfer = selectedType?.category === 'transfer';

  const sourceAccount = accountsData?.find((a: any) => a.id === parseInt(formData.account_id));
  const destinationAccount = accountsData?.find((a: any) => a.id === parseInt(formData.transfer_account_id));
  const isDifferentCurrency = isTransfer && sourceAccount && destinationAccount &&
                              sourceAccount.currency !== destinationAccount.currency;

  const handleAutoCategorize = async () => {
    // Prioritize recipient for auto-categorization as it's more indicative of category
    const textToAnalyze = formData.recipient.trim() || formData.description.trim();
    if (!textToAnalyze) return;

    setAutoCategorizingDescription(true);
    try {
      const response = await transactionsAPI.autoCategorize(textToAnalyze);
      const data = response.data;

      if (data.type_id) {
        setFormData({
          ...formData,
          type_id: data.type_id.toString(),
          subtype_id: data.subtype_id ? data.subtype_id.toString() : '',
        });
      }
    } catch (error) {
      console.error('Auto-categorization failed:', error);
    } finally {
      setAutoCategorizingDescription(false);
    }
  };

  const handleSubmit = () => {
    const data = {
      account_id: parseInt(formData.account_id),
      date: formData.date,
      due_date: formData.due_date || null,
      amount: parseFloat(formData.amount),
      type_id: parseInt(formData.type_id),
      subtype_id: formData.subtype_id ? parseInt(formData.subtype_id) : null,
      description: formData.description || null,
      destinataire: formData.recipient || null,
      transfer_account_id: isTransfer && formData.transfer_account_id
        ? parseInt(formData.transfer_account_id)
        : null,
      transfer_amount: isDifferentCurrency && formData.transfer_amount
        ? parseFloat(formData.transfer_amount)
        : null,
      is_pending: false,
      tags: formData.tags || null,
    };

    if (editingTransaction) {
      updateMutation.mutate({ id: editingTransaction.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'EUR') => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency,
    }).format(Math.abs(amount));
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
      alert('No transactions to export');
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
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
        <div className="flex flex-wrap gap-2">
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
            resetForm();
            setOpenDialog(true);
          }}>
            <Plus className="w-4 h-4 mr-2" />
            Add Transaction
          </Button>
        </div>
      </div>

      {/* Filters Section */}
      {showFilters && (
        <Card className="p-5 rounded-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select
                value={filters.account_id}
                onValueChange={(value) => setFilters({ ...filters, account_id: value })}
              >
                <SelectTrigger>
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
              <Label>Category</Label>
              <Select
                value={filters.category_id}
                onValueChange={(value) => setFilters({ ...filters, category_id: value })}
              >
                <SelectTrigger>
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
              <Label>Recipient</Label>
              <Autocomplete
                options={recipientsData || []}
                value={filters.recipient}
                onChange={(value) => setFilters({ ...filters, recipient: value })}
                placeholder="Search recipient..."
                freeSolo
              />
            </div>
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tag</Label>
              <Autocomplete
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
              className={`rounded-xl overflow-hidden transition-all ${isExpanded ? 'ring-2 ring-primary/50' : ''}`}
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
          <Card className="p-8 text-center rounded-xl">
            <p className="text-foreground-muted">No transactions found</p>
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
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Account</Label>
              <Select
                value={formData.account_id}
                onValueChange={(value) => setFormData({ ...formData, account_id: value })}
              >
                <SelectTrigger>
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
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date (Optional)</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={formData.type_id}
                onValueChange={(value) => setFormData({ ...formData, type_id: value, subtype_id: '' })}
              >
                <SelectTrigger>
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
            </div>
            {formData.type_id && (
              <div className="space-y-1.5">
                <Label>Subcategory (Optional)</Label>
                <Select
                  value={formData.subtype_id}
                  onValueChange={(value) => setFormData({ ...formData, subtype_id: value })}
                >
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
              </div>
            )}
            {isTransfer && (
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Destination Account</Label>
                <Select
                  value={formData.transfer_account_id}
                  onValueChange={(value) => setFormData({ ...formData, transfer_account_id: value })}
                >
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
              </div>
            )}
            {isDifferentCurrency && (
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Amount in {destinationAccount?.currency || 'destination currency'}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.transfer_amount}
                  onChange={(e) => setFormData({ ...formData, transfer_amount: e.target.value })}
                  placeholder={`Amount in ${destinationAccount?.currency || ''}`}
                />
                <p className="text-xs text-foreground-muted">
                  Source: {formData.amount} {sourceAccount?.currency || ''} → Destination: {destinationAccount?.currency || ''}
                </p>
              </div>
            )}
            {!isTransfer && (
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Recipient</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Autocomplete
                      options={recipientsData || []}
                      value={formData.recipient}
                      onChange={(value) => setFormData({ ...formData, recipient: value })}
                      placeholder="Select or enter recipient"
                      freeSolo
                      helperText="Select from previous recipients or enter a new one"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleAutoCategorize}
                    disabled={!formData.recipient.trim() || autoCategorizingDescription}
                    className="shrink-0"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    {autoCategorizingDescription ? 'Analyzing...' : 'Auto-Categorize'}
                  </Button>
                </div>
              </div>
            )}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Description (Optional)</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Additional notes or description"
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Tags (Optional)</Label>
              <Autocomplete
                options={tagsData || []}
                value={formData.tags}
                onChange={(value) => setFormData({ ...formData, tags: value })}
                placeholder="Select or type tags (comma-separated)"
                freeSolo
                helperText="E.g., grocery, monthly, vacation"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setOpenDialog(false);
              setEditingTransaction(null);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editingTransaction
                ? (updateMutation.isPending ? 'Updating...' : 'Update Transaction')
                : (createMutation.isPending ? 'Adding...' : 'Add Transaction')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
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
