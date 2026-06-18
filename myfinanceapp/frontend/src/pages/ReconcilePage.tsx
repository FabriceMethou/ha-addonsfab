import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { transactionSchema, type TransactionFormData } from '../lib/validations';
import { formatCurrency as formatCurrencyUtil } from '../lib/utils';
import { useToast } from '../contexts/ToastContext';
import { useIsMobile } from '../hooks/useBreakpoint';
import {
  accountsAPI,
  transactionsAPI,
  categoriesAPI,
  reconciliationAPI,
  settingsAPI,
} from '../services/api';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/shadcn';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Plus,
  Flag,
  EyeOff,
  ArrowRight,
  Check,
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Link2,
} from 'lucide-react';

// Types for reconciliation data
interface CSVTransaction {
  date: string;
  original_date: string;
  type: string;
  amount: number;
  balance: number | null;
  description: string;
  suggested_recipient: string | null;
}

interface SystemTransaction {
  id: number;
  transaction_date: string;
  amount: number;
  type_name: string;
  subtype_name: string;
  destinataire: string | null;
  description: string | null;
  tags: string | null;
}

interface MatchedTransaction {
  csv_index: number;
  system_id: number;
  date_mismatch: boolean;
  csv_date: string;
  system_date: string;
  days_difference: number;
}

interface MatchDetail {
  csv_index: number;
  csv_date: string;
  csv_amount: number;
  csv_description: string;
  system_id: number;
  system_date: string | null;
  system_amount: number | null;
  system_destinataire: string | null;
  date_mismatch: boolean;
  days_difference: number;
}

interface ReconciliationData {
  csv_transactions: CSVTransaction[];
  system_transactions: SystemTransaction[];
  matched: MatchedTransaction[];
  match_details?: MatchDetail[];
  missing_from_system: number[];
  not_in_csv: number[];
  csv_ending_balance: number | null;
  parse_errors: string[];
  summary: {
    total_csv: number;
    total_system: number;
    matched: number;
    exact_matches: number;
    date_mismatch_matches: number;
    missing: number;
    extra: number;
    parse_errors: number;
  };
}

export default function ReconcilePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);

  // Settings for currency display
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settingsAPI.getAll();
      return response.data.settings || {};
    },
  });

  const formatCurrency = (amount: number) => {
    const displayCurrency = settingsData?.display_currency || 'EUR';
    return formatCurrencyUtil(amount, displayCurrency);
  };

  // Setup state
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Reconciliation results state
  const [reconciliationData, setReconciliationData] = useState<ReconciliationData | null>(null);
  const [ignoredCsvIndices, setIgnoredCsvIndices] = useState<Set<number>>(new Set());
  const [ignoredSystemIds, setIgnoredSystemIds] = useState<Set<number>>(new Set());
  const [addedCsvIndices, setAddedCsvIndices] = useState<Set<number>>(new Set());
  const [flaggedSystemIds, setFlaggedSystemIds] = useState<Set<number>>(new Set());
  // Manual links: csvIndex -> systemId. Session-only — declares that a CSV row
  // corresponds to an existing system transaction the auto-matcher missed.
  const [linkedPairs, setLinkedPairs] = useState<Map<number, number>>(new Map());

  // Link dialog state
  const [linkDialogCsvIndex, setLinkDialogCsvIndex] = useState<number | null>(null);
  const [linkSearch, setLinkSearch] = useState('');

  // Add transaction dialog state
  const [addTransactionDialog, setAddTransactionDialog] = useState(false);
  const [prefilledCsvIndex, setPrefilledCsvIndex] = useState<number | null>(null);
  const [autoCategorizingDescription, setAutoCategorizingDescription] = useState(false);

  // Complete dialog state
  const [completeDialog, setCompleteDialog] = useState(false);

  // Queries
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await accountsAPI.getAll();
      return response.data.accounts;
    },
    staleTime: 30 * 60 * 1000,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories-hierarchy'],
    queryFn: async () => {
      const response = await categoriesAPI.getHierarchy();
      return response.data.categories;
    },
    staleTime: 30 * 60 * 1000,
  });

  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const response = await transactionsAPI.getAllTags();
      return response.data.tags;
    },
    staleTime: 30 * 60 * 1000,
  });

  const { data: recipientsData } = useQuery({
    queryKey: ['recipients'],
    queryFn: async () => {
      const response = await transactionsAPI.getAllRecipients();
      return response.data.recipients;
    },
    staleTime: 30 * 60 * 1000,
  });

  // Get selected account info
  const selectedAccount = useMemo(() => {
    if (!selectedAccountId || !accountsData) return null;
    return accountsData.find((a: any) => a.id.toString() === selectedAccountId);
  }, [selectedAccountId, accountsData]);

  // When account is selected, fetch the latest validation date for start date suggestion
  useEffect(() => {
    if (selectedAccountId) {
      accountsAPI.getLatestValidation(parseInt(selectedAccountId))
        .then((response) => {
          if (response.data && response.data.validation_date) {
            setStartDate(response.data.validation_date);
          }
        })
        .catch(() => {
          // No validation exists, keep start date empty or set to account creation
        });
    }
  }, [selectedAccountId]);

  // Form for adding transaction
  const {
    control,
    register,
    handleSubmit: handleFormSubmit,
    formState: { errors, isValid },
    reset: resetForm,
    watch,
    setValue,
  } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    mode: 'onChange',
    defaultValues: {
      account_id: '',
      date: '',
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

  const formData = watch();

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!selectedFile || !selectedAccountId) {
        throw new Error('Missing file or account');
      }
      return reconciliationAPI.upload(
        parseInt(selectedAccountId),
        startDate,
        endDate,
        selectedFile
      );
    },
    onSuccess: (response) => {
      setReconciliationData(response.data);
      // Reset tracking state
      setIgnoredCsvIndices(new Set());
      setIgnoredSystemIds(new Set());
      setAddedCsvIndices(new Set());
      setFlaggedSystemIds(new Set());
      setLinkedPairs(new Map());

      const summary = response.data.summary;
      toast.success(
        `Processed ${summary.total_csv} CSV transactions. ${summary.matched} matched, ${summary.missing} missing, ${summary.extra} extra.`
      );

      if (response.data.parse_errors && response.data.parse_errors.length > 0) {
        toast.warning(`${response.data.parse_errors.length} rows had parsing errors.`);
      }
    },
    onError: (error: any) => {
      toast.error(`Upload failed: ${error.response?.data?.detail || error.message}`);
    },
  });

  // Flag mutation
  const flagMutation = useMutation({
    mutationFn: (transactionId: number) => reconciliationAPI.flagTransaction(transactionId),
    onSuccess: (_, transactionId) => {
      setFlaggedSystemIds((prev) => new Set(prev).add(transactionId));
      toast.success('Transaction flagged for verification');
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to flag: ${error.response?.data?.detail || error.message}`);
    },
  });

  // Create transaction mutation
  const createTransactionMutation = useMutation({
    mutationFn: (data: any) => transactionsAPI.create(data),
    onSuccess: () => {
      if (prefilledCsvIndex !== null) {
        setAddedCsvIndices((prev) => new Set(prev).add(prefilledCsvIndex));
      }
      setAddTransactionDialog(false);
      setPrefilledCsvIndex(null);
      resetForm();
      toast.success('Transaction created successfully!');
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to create: ${error.response?.data?.detail || error.message}`);
    },
  });

  // Complete reconciliation mutation
  const completeMutation = useMutation({
    mutationFn: () => {
      if (!reconciliationData || !selectedAccountId) {
        throw new Error('Missing data');
      }
      return reconciliationAPI.complete({
        account_id: parseInt(selectedAccountId),
        validation_date: format(new Date(), 'yyyy-MM-dd'),
        actual_balance: reconciliationData.csv_ending_balance || 0,
        matched_count: reconciliationData.summary.matched + linkedPairs.size,
        added_count: addedCsvIndices.size,
        flagged_count: flaggedSystemIds.size,
      });
    },
    onSuccess: () => {
      setCompleteDialog(false);
      toast.success('Reconciliation completed! Validation record created.');
      // Reset state
      setReconciliationData(null);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to complete: ${error.response?.data?.detail || error.message}`);
    },
  });

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        toast.error('Please select a CSV file');
        return;
      }
      setSelectedFile(file);
    }
  };

  // Handle "Add" action
  const handleAddTransaction = (csvIndex: number) => {
    if (!reconciliationData) return;
    const csvTx = reconciliationData.csv_transactions[csvIndex];

    setPrefilledCsvIndex(csvIndex);

    // Prefill form
    setValue('account_id', selectedAccountId);
    setValue('date', csvTx.date);
    setValue('amount', Math.abs(csvTx.amount).toString());
    setValue('recipient', csvTx.suggested_recipient || '');
    setValue('description', csvTx.description || '');
    setValue('tags', '');
    setValue('type_id', '');
    setValue('subtype_id', '');

    setAddTransactionDialog(true);
  };

  // Handle ignore actions
  const handleIgnoreCsv = (index: number) => {
    setIgnoredCsvIndices((prev) => new Set(prev).add(index));
  };

  const handleIgnoreSystem = (id: number) => {
    setIgnoredSystemIds((prev) => new Set(prev).add(id));
  };

  // Handle link actions
  const openLinkDialog = (csvIndex: number) => {
    setLinkSearch('');
    setLinkDialogCsvIndex(csvIndex);
  };

  const handleLink = (csvIndex: number, systemId: number) => {
    setLinkedPairs((prev) => new Map(prev).set(csvIndex, systemId));
    setLinkDialogCsvIndex(null);
    setLinkSearch('');
    toast.success('Transaction linked to existing system transaction');
  };

  const handleUnlink = (csvIndex: number) => {
    setLinkedPairs((prev) => {
      const next = new Map(prev);
      next.delete(csvIndex);
      return next;
    });
  };

  // Handle form submission for adding transaction
  const onSubmitTransaction = (data: TransactionFormData) => {
    const submitData = {
      account_id: parseInt(data.account_id),
      date: data.date,
      due_date: data.due_date || null,
      amount: parseFloat(data.amount),
      type_id: parseInt(data.type_id),
      subtype_id: data.subtype_id ? parseInt(data.subtype_id) : null,
      description: data.description || null,
      destinataire: data.recipient || null,
      transfer_account_id: null,
      transfer_amount: null,
      is_pending: false,
      tags: data.tags || null,
    };

    createTransactionMutation.mutate(submitData);
  };

  // Auto-categorize
  const handleAutoCategorize = async (description: string) => {
    if (!description.trim()) return;
    setAutoCategorizingDescription(true);
    try {
      const response = await transactionsAPI.autoCategorize(description);
      if (response.data.category_id) {
        setValue('type_id', response.data.category_id.toString());
        if (response.data.subcategory_id) {
          setValue('subtype_id', response.data.subcategory_id.toString());
        }
        toast.success('Category suggested!');
      }
    } catch {
      // Silent fail for auto-categorize
    } finally {
      setAutoCategorizingDescription(false);
    }
  };

  // Get filtered lists for display
  const missingFromSystem = useMemo(() => {
    if (!reconciliationData) return [];
    return reconciliationData.missing_from_system.filter(
      (idx) => !ignoredCsvIndices.has(idx) && !addedCsvIndices.has(idx) && !linkedPairs.has(idx)
    );
  }, [reconciliationData, ignoredCsvIndices, addedCsvIndices, linkedPairs]);

  const linkedSystemIds = useMemo(() => new Set(linkedPairs.values()), [linkedPairs]);

  const notInCsv = useMemo(() => {
    if (!reconciliationData) return [];
    return reconciliationData.not_in_csv.filter(
      (id) => !ignoredSystemIds.has(id) && !flaggedSystemIds.has(id) && !linkedSystemIds.has(id)
    );
  }, [reconciliationData, ignoredSystemIds, flaggedSystemIds, linkedSystemIds]);

  // CSV row currently being linked
  const linkCsvTx = useMemo(() => {
    if (linkDialogCsvIndex === null || !reconciliationData) return null;
    return reconciliationData.csv_transactions[linkDialogCsvIndex];
  }, [linkDialogCsvIndex, reconciliationData]);

  // Candidate system transactions for linking: the still-unmatched "Not in CSV"
  // rows, sorted by closeness to the CSV row (amount delta first, then date delta).
  const linkCandidates = useMemo(() => {
    if (!linkCsvTx || !reconciliationData) return [];

    const daysBetween = (a: string, b: string) => {
      const d1 = new Date(a).getTime();
      const d2 = new Date(b).getTime();
      if (isNaN(d1) || isNaN(d2)) return Number.MAX_SAFE_INTEGER;
      return Math.abs(Math.round((d1 - d2) / 86400000));
    };

    const search = linkSearch.trim().toLowerCase();

    return notInCsv
      .map((id) => {
        const tx = reconciliationData.system_transactions.find((t) => t.id === id);
        if (!tx) return null;
        const amountDelta = Math.abs(Math.abs(tx.amount) - Math.abs(linkCsvTx.amount));
        const dateDelta = daysBetween(tx.transaction_date, linkCsvTx.date);
        return { tx, amountDelta, dateDelta };
      })
      .filter((c): c is { tx: SystemTransaction; amountDelta: number; dateDelta: number } => {
        if (!c) return false;
        if (!search) return true;
        const haystack = `${c.tx.destinataire || ''} ${c.tx.description || ''} ${c.tx.type_name || ''} ${c.tx.subtype_name || ''}`.toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => a.amountDelta - b.amountDelta || a.dateDelta - b.dateDelta);
  }, [linkCsvTx, reconciliationData, notInCsv, linkSearch]);

  // Get subtypes for selected type
  const selectedTypeId = watch('type_id');
  const subtypesForSelectedType = useMemo(() => {
    if (!categoriesData || !selectedTypeId) return [];
    const type = categoriesData?.find((t: any) => t.id.toString() === selectedTypeId);
    return type?.subtypes || [];
  }, [categoriesData, selectedTypeId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reconcile Transactions</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Upload a bank CSV to compare with system transactions
          </p>
        </div>
      </div>

      {/* Setup Section */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" />
          Setup
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Account Selection */}
          <div className="space-y-2">
            <Label htmlFor="account">Account</Label>
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger id="account">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accountsData?.map((account: any) => (
                  <SelectItem key={account.id} value={account.id.toString()}>
                    {account.bank_name} - {account.name || account.account_type} ({account.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Start Date */}
          <div className="space-y-2">
            <Label htmlFor="start-date">Start Date</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="From last validation"
            />
          </div>

          {/* End Date */}
          <div className="space-y-2">
            <Label htmlFor="end-date">End Date</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="csv-file">CSV File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="cursor-pointer"
            />
          </div>
        </div>

        {selectedFile && (
          <div className="mt-4 p-3 bg-surface rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              <span className="text-sm">{selectedFile.name}</span>
              <span className="text-xs text-foreground-muted">
                ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedFile(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={!selectedAccountId || !selectedFile || !startDate || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <>
                <Spinner className="w-4 h-4 mr-2" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload & Compare
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Results Section */}
      {reconciliationData && (
        <>
          {/* Summary */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              <div className="text-center p-3 bg-success/10 rounded-lg">
                <div className="text-2xl font-bold text-success">{reconciliationData.summary.matched}</div>
                <div className="text-sm text-foreground-muted">Matched</div>
              </div>
              <div className="text-center p-3 bg-info/10 rounded-lg">
                <div className="text-2xl font-bold text-info">{linkedPairs.size}</div>
                <div className="text-sm text-foreground-muted">Linked</div>
              </div>
              <div className="text-center p-3 bg-warning/10 rounded-lg">
                <div className="text-2xl font-bold text-warning">{missingFromSystem.length}</div>
                <div className="text-sm text-foreground-muted">Missing from System</div>
              </div>
              <div className="text-center p-3 bg-error/10 rounded-lg">
                <div className="text-2xl font-bold text-error">{notInCsv.length}</div>
                <div className="text-sm text-foreground-muted">Not in CSV</div>
              </div>
              <div className="text-center p-3 bg-surface rounded-lg">
                <div className="text-2xl font-bold">{reconciliationData.summary.total_csv} / {reconciliationData.summary.total_system}</div>
                <div className="text-sm text-foreground-muted">CSV / System Total</div>
              </div>
            </div>

            {reconciliationData.csv_ending_balance !== null && selectedAccount && (
              <div className="mt-4 p-4 bg-surface rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-foreground-muted">CSV Ending Balance</div>
                    <div className="text-xl font-bold">{formatCurrency(reconciliationData.csv_ending_balance)}</div>
                  </div>
                  <ArrowRight className="w-6 h-6 text-foreground-muted" />
                  <div>
                    <div className="text-sm text-foreground-muted">System Balance</div>
                    <div className="text-xl font-bold">{formatCurrency(selectedAccount.balance)}</div>
                  </div>
                  <ArrowRight className="w-6 h-6 text-foreground-muted" />
                  <div>
                    <div className="text-sm text-foreground-muted">Difference</div>
                    <div className={`text-xl font-bold ${
                      Math.abs(reconciliationData.csv_ending_balance - selectedAccount.balance) < 0.01
                        ? 'text-success'
                        : 'text-error'
                    }`}>
                      {formatCurrency(reconciliationData.csv_ending_balance - selectedAccount.balance)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {reconciliationData.parse_errors && reconciliationData.parse_errors.length > 0 && (
              <div className="mt-4 p-4 bg-warning/10 rounded-lg">
                <div className="text-sm font-medium text-warning mb-2">Parse Errors ({reconciliationData.parse_errors.length})</div>
                <div className="text-xs text-foreground-muted max-h-24 overflow-y-auto">
                  {reconciliationData.parse_errors.slice(0, 5).map((err, idx) => (
                    <div key={idx}>{err}</div>
                  ))}
                  {reconciliationData.parse_errors.length > 5 && (
                    <div>... and {reconciliationData.parse_errors.length - 5} more</div>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* All Matches (Debug) - Collapsible */}
          {reconciliationData.match_details && reconciliationData.match_details.length > 0 && (
            <Card className="p-6">
              <details>
                <summary className="cursor-pointer text-lg font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-success" />
                  All Matches ({reconciliationData.match_details.length}) - Click to expand
                </summary>
                <div className="mt-4">
                  {isMobile ? (
                    <div className="space-y-3">
                      {reconciliationData.match_details.map((detail, idx) => {
                        const isExpanded = expandedMatch === idx;
                        return (
                          <Card key={idx} className="p-4">
                            <div
                              className="flex items-center justify-between cursor-pointer"
                              onClick={() => setExpandedMatch(isExpanded ? null : idx)}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm text-foreground-muted">{detail.csv_date}</span>
                                  <ArrowRight className="w-4 h-4 text-foreground-muted" />
                                  <span className="text-sm font-mono text-foreground-muted">#{detail.system_id}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={`text-base font-medium ${detail.csv_amount < 0 ? 'text-error' : 'text-success'}`}>
                                    {formatCurrency(detail.csv_amount)}
                                  </span>
                                  <ArrowRight className="w-4 h-4 text-foreground-muted" />
                                  <span className={`text-base font-medium ${(detail.system_amount || 0) < 0 ? 'text-error' : 'text-success'}`}>
                                    {detail.system_amount !== null ? formatCurrency(detail.system_amount) : '-'}
                                  </span>
                                </div>
                              </div>
                              {isExpanded ? <ChevronUp className="w-5 h-5 text-foreground-muted" /> : <ChevronDown className="w-5 h-5 text-foreground-muted" />}
                            </div>
                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-border space-y-2">
                                <div>
                                  <div className="text-xs text-foreground-muted">CSV Description</div>
                                  <div className="text-sm">{detail.csv_description || '-'}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-foreground-muted">System Recipient</div>
                                  <div className="text-sm">{detail.system_destinataire || '-'}</div>
                                </div>
                                {detail.date_mismatch && (
                                  <div className="flex items-center gap-2 text-warning">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span className="text-xs">Date mismatch ({detail.days_difference} days)</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>CSV Date</TableHead>
                            <TableHead className="text-right">CSV Amount</TableHead>
                            <TableHead>CSV Desc</TableHead>
                            <TableHead>→</TableHead>
                            <TableHead>Sys ID</TableHead>
                            <TableHead>Sys Date</TableHead>
                            <TableHead className="text-right">Sys Amount</TableHead>
                            <TableHead>Sys Dest</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reconciliationData.match_details.map((detail, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="whitespace-nowrap">{detail.csv_date}</TableCell>
                              <TableCell className={`text-right font-medium ${detail.csv_amount < 0 ? 'text-error' : 'text-success'}`}>
                                {formatCurrency(detail.csv_amount)}
                              </TableCell>
                              <TableCell className="truncate" title={detail.csv_description}>
                                {detail.csv_description || '-'}
                              </TableCell>
                              <TableCell><ArrowRight className="w-4 h-4 text-foreground-muted" /></TableCell>
                              <TableCell className="font-mono text-sm">#{detail.system_id}</TableCell>
                              <TableCell className="whitespace-nowrap">{detail.system_date || '-'}</TableCell>
                              <TableCell className={`text-right font-medium ${(detail.system_amount || 0) < 0 ? 'text-error' : 'text-success'}`}>
                                {detail.system_amount !== null ? formatCurrency(detail.system_amount) : '-'}
                              </TableCell>
                              <TableCell className="truncate" title={detail.system_destinataire || ''}>
                                {detail.system_destinataire || '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </details>
            </Card>
          )}

          {/* Missing from System Table */}
          {missingFromSystem.length > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                Missing from System ({missingFromSystem.length})
              </h2>
              <p className="text-sm text-foreground-muted mb-4">
                These transactions appear in the CSV but not in your system.
              </p>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead hiddenOnMobile>Description</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {missingFromSystem.map((idx) => {
                      const tx = reconciliationData.csv_transactions[idx];
                      return (
                        <TableRow key={idx}>
                          <TableCell className="whitespace-nowrap">{tx.original_date}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{tx.type}</Badge>
                          </TableCell>
                          <TableCell className={`text-right font-medium ${tx.amount < 0 ? 'text-error' : 'text-success'}`}>
                            {formatCurrency(tx.amount)}
                          </TableCell>
                          <TableCell hiddenOnMobile title={tx.description}>
                            {tx.description}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2 justify-center">
                              <Button size="sm" onClick={() => handleAddTransaction(idx)}>
                                <Plus className="w-4 h-4 mr-1" /> Add
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => openLinkDialog(idx)}>
                                <Link2 className="w-4 h-4 mr-1" /> Link
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleIgnoreCsv(idx)}>
                                <EyeOff className="w-4 h-4 mr-1" /> Ignore
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Not in CSV Table */}
          {notInCsv.length > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-error" />
                Not in Bank Statement ({notInCsv.length})
              </h2>
              <p className="text-sm text-foreground-muted mb-4">
                These transactions are in your system but not in the CSV.
              </p>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead hiddenOnMobile>Recipient</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notInCsv.map((id) => {
                      const tx = reconciliationData.system_transactions.find((t) => t.id === id);
                      if (!tx) return null;
                      return (
                        <TableRow key={id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(tx.transaction_date), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell>
                            <Badge>{tx.type_name}</Badge>
                            {tx.subtype_name && (
                              <span className="text-xs text-foreground-muted ml-1">/ {tx.subtype_name}</span>
                            )}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${tx.amount < 0 ? 'text-error' : 'text-success'}`}>
                            {formatCurrency(tx.amount)}
                          </TableCell>
                          <TableCell hiddenOnMobile title={tx.destinataire || tx.description || ''}>
                            {tx.destinataire || tx.description || '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2 justify-center">
                              <Button
                                size="sm"
                                variant="warning"
                                onClick={() => flagMutation.mutate(id)}
                                disabled={flagMutation.isPending}
                              >
                                <Flag className="w-4 h-4 mr-1" /> Flag
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleIgnoreSystem(id)}>
                                <EyeOff className="w-4 h-4 mr-1" /> Ignore
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Linked Pairs Table */}
          {linkedPairs.size > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-info" />
                Linked ({linkedPairs.size})
              </h2>
              <p className="text-sm text-foreground-muted mb-4">
                These CSV rows were manually matched to existing system transactions for this session.
              </p>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CSV Date</TableHead>
                      <TableHead className="text-right">CSV Amount</TableHead>
                      <TableHead hiddenOnMobile>CSV Description</TableHead>
                      <TableHead>→</TableHead>
                      <TableHead>System</TableHead>
                      <TableHead className="text-right">Sys Amount</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from(linkedPairs.entries()).map(([csvIndex, systemId]) => {
                      const csvTx = reconciliationData.csv_transactions[csvIndex];
                      const sysTx = reconciliationData.system_transactions.find((t) => t.id === systemId);
                      if (!csvTx) return null;
                      return (
                        <TableRow key={csvIndex}>
                          <TableCell className="whitespace-nowrap">{csvTx.original_date}</TableCell>
                          <TableCell className={`text-right font-medium ${csvTx.amount < 0 ? 'text-error' : 'text-success'}`}>
                            {formatCurrency(csvTx.amount)}
                          </TableCell>
                          <TableCell hiddenOnMobile title={csvTx.description}>
                            {csvTx.description || '-'}
                          </TableCell>
                          <TableCell><ArrowRight className="w-4 h-4 text-foreground-muted" /></TableCell>
                          <TableCell className="font-mono text-sm whitespace-nowrap">
                            #{systemId}
                            {sysTx && (
                              <span className="ml-1 font-sans text-foreground-muted">
                                {sysTx.destinataire || sysTx.type_name || ''}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${(sysTx?.amount || 0) < 0 ? 'text-error' : 'text-success'}`}>
                            {sysTx ? formatCurrency(sysTx.amount) : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-center">
                              <Button size="sm" variant="ghost" onClick={() => handleUnlink(csvIndex)}>
                                <X className="w-4 h-4 mr-1" /> Unlink
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Complete Section */}
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Ready to Complete?</h2>
                <p className="text-sm text-foreground-muted">
                  This will create a balance validation record with the reconciliation summary.
                </p>
              </div>
              <Button size="lg" onClick={() => setCompleteDialog(true)}>
                <CheckCircle className="w-5 h-5 mr-2" />
                Complete Reconciliation
              </Button>
            </div>
          </Card>
        </>
      )}

      {/* Add Transaction Dialog */}
      <Dialog open={addTransactionDialog} onOpenChange={setAddTransactionDialog}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
            <DialogDescription>
              Add the missing transaction to your system.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit(onSubmitTransaction)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Account (read-only) */}
              <FormField label="Account" error={errors.account_id?.message}>
                <Controller
                  name="account_id"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accountsData?.map((account: any) => (
                          <SelectItem key={account.id} value={account.id.toString()}>
                            {account.bank_name} - {account.name || account.account_type} ({account.currency})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>

              {/* Date */}
              <FormField label="Date" error={errors.date?.message}>
                <Input type="date" {...register('date')} />
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Amount */}
              <FormField label="Amount" error={errors.amount?.message}>
                <Input
                  type="number"
                  step="0.01"
                  {...register('amount')}
                  placeholder="0.00"
                />
              </FormField>

              {/* Category */}
              <FormField label="Category" error={errors.type_id?.message}>
                <Controller
                  name="type_id"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoriesData?.map((type: any) => (
                          <SelectItem key={type.id} value={type.id.toString()}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>

            {/* Subcategory */}
            {subtypesForSelectedType.length > 0 && (
              <FormField label="Subcategory" error={errors.subtype_id?.message}>
                <Controller
                  name="subtype_id"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select subcategory (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {subtypesForSelectedType.map((subtype: any) => (
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

            {/* Recipient */}
            <FormField label="Recipient" error={errors.recipient?.message}>
              <Controller
                name="recipient"
                control={control}
                render={({ field }) => (
                  <Autocomplete
                    options={recipientsData || []}
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder="Enter recipient"
                    freeSolo
                  />
                )}
              />
            </FormField>

            {/* Description with auto-categorize */}
            <FormField label="Description" error={errors.description?.message}>
              <div className="flex gap-2">
                <Input {...register('description')} placeholder="Transaction description" className="flex-1" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleAutoCategorize(formData.description || '')}
                  disabled={autoCategorizingDescription || !formData.description}
                  title="Auto-categorize"
                >
                  {autoCategorizingDescription ? <Spinner className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                </Button>
              </div>
            </FormField>

            {/* Tags */}
            <FormField label="Tags" error={errors.tags?.message}>
              <Controller
                name="tags"
                control={control}
                render={({ field }) => (
                  <Autocomplete
                    options={tagsData || []}
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder="Enter tags (comma-separated)"
                    freeSolo
                  />
                )}
              />
            </FormField>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddTransactionDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid || createTransactionMutation.isPending}>
                {createTransactionMutation.isPending ? (
                  <>
                    <Spinner className="w-4 h-4 mr-2" /> Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" /> Add Transaction
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Link Dialog */}
      <Dialog open={linkDialogCsvIndex !== null} onOpenChange={(open) => { if (!open) { setLinkDialogCsvIndex(null); setLinkSearch(''); } }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Link to Existing Transaction</DialogTitle>
            <DialogDescription>
              Match this bank row to a system transaction the auto-matcher missed (e.g. amount or date differs). This is for reconciliation only — the system transaction is left unchanged.
            </DialogDescription>
          </DialogHeader>

          {linkCsvTx && (
            <div className="space-y-4">
              {/* CSV row being linked */}
              <div className="p-3 bg-surface rounded-lg flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs text-foreground-muted">Bank row</div>
                  <div className="text-sm truncate" title={linkCsvTx.description}>
                    {linkCsvTx.original_date} · {linkCsvTx.description || linkCsvTx.type || '-'}
                  </div>
                </div>
                <div className={`text-lg font-bold whitespace-nowrap ${linkCsvTx.amount < 0 ? 'text-error' : 'text-success'}`}>
                  {formatCurrency(linkCsvTx.amount)}
                </div>
              </div>

              {/* Search */}
              <div className="space-y-2">
                <Label htmlFor="link-search">Search candidates</Label>
                <Input
                  id="link-search"
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  placeholder="Filter by recipient, description, category..."
                />
              </div>

              {/* Candidate list */}
              <div className="max-h-80 overflow-y-auto border border-border rounded-lg">
                {linkCandidates.length === 0 ? (
                  <div className="p-6 text-center text-sm text-foreground-muted">
                    No unmatched system transactions available to link.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead hiddenOnMobile>Recipient</TableHead>
                        <TableHead className="text-center">Δ</TableHead>
                        <TableHead className="text-center">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linkCandidates.map(({ tx, amountDelta, dateDelta }) => (
                        <TableRow key={tx.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(tx.transaction_date), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${tx.amount < 0 ? 'text-error' : 'text-success'}`}>
                            {formatCurrency(tx.amount)}
                          </TableCell>
                          <TableCell hiddenOnMobile title={tx.destinataire || tx.description || ''}>
                            {tx.destinataire || tx.description || tx.type_name || '-'}
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap">
                            <div className="flex flex-col items-center gap-1">
                              {amountDelta < 0.01 ? (
                                <Badge variant="outline" className="text-success border-success">amount ✓</Badge>
                              ) : (
                                <Badge variant="outline" className="text-warning border-warning">{formatCurrency(amountDelta)}</Badge>
                              )}
                              <span className="text-xs text-foreground-muted">{dateDelta}d</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button size="sm" onClick={() => handleLink(linkDialogCsvIndex!, tx.id)}>
                              <Link2 className="w-4 h-4 mr-1" /> Link
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setLinkDialogCsvIndex(null); setLinkSearch(''); }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Confirmation Dialog */}
      <Dialog open={completeDialog} onOpenChange={setCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Reconciliation</DialogTitle>
            <DialogDescription>
              This will create a balance validation record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-foreground-muted">Matched:</span>
                <span className="ml-2 font-medium">{reconciliationData?.summary.matched || 0}</span>
              </div>
              <div>
                <span className="text-foreground-muted">Linked:</span>
                <span className="ml-2 font-medium text-info">{linkedPairs.size}</span>
              </div>
              <div>
                <span className="text-foreground-muted">Added:</span>
                <span className="ml-2 font-medium text-success">{addedCsvIndices.size}</span>
              </div>
              <div>
                <span className="text-foreground-muted">Flagged:</span>
                <span className="ml-2 font-medium text-warning">{flaggedSystemIds.size}</span>
              </div>
              <div>
                <span className="text-foreground-muted">Ignored:</span>
                <span className="ml-2 font-medium">{ignoredCsvIndices.size + ignoredSystemIds.size}</span>
              </div>
            </div>

            {reconciliationData?.csv_ending_balance !== null && (
              <div className="p-3 bg-surface rounded-lg">
                <div className="text-sm text-foreground-muted mb-1">CSV Ending Balance</div>
                <div className="text-lg font-bold">{formatCurrency(reconciliationData?.csv_ending_balance || 0)}</div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
              {completeMutation.isPending ? (
                <>
                  <Spinner className="w-4 h-4 mr-2" /> Completing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" /> Complete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
