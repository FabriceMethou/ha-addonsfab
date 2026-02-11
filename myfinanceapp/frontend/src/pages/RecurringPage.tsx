// Recurring Transactions Page - Manage recurring transaction templates
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '../contexts/ToastContext';
import { recurringTemplateSchema, type RecurringTemplateFormData } from '../lib/validations';
import { useIsMobile } from '../hooks/useBreakpoint';
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Autocomplete,
  FormField,
  RecurringSkeleton,
} from '../components/shadcn';
import { recurringAPI, accountsAPI, categoriesAPI, transactionsAPI } from '../services/api';
import { format } from 'date-fns';
import { formatCurrency as formatCurrencyUtil } from '../lib/utils';

export default function RecurringPage() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [currentTab, setCurrentTab] = useState<number | string>(0);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [selectedPending, setSelectedPending] = useState<number[]>([]);
  const [expandedTemplate, setExpandedTemplate] = useState<number | null>(null);
  const [expandedPending, setExpandedPending] = useState<number | null>(null);

  // Recurring template form with validation
  const {
    control,
    register,
    handleSubmit: handleFormSubmit,
    formState: { errors, isValid },
    reset: resetForm,
    watch,
    setValue,
    trigger,
  } = useForm<RecurringTemplateFormData>({
    resolver: zodResolver(recurringTemplateSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      account_id: '',
      amount: '',
      currency: 'EUR',
      description: '',
      destinataire: '',
      type_id: '',
      subtype_id: '',
      recurrence_pattern: 'monthly',
      recurrence_interval: '1',
      day_of_month: '',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: '',
      is_active: true,
    },
  });

  // Watch form values for conditional rendering
  const recurrencePattern = watch('recurrence_pattern');
  const typeId = watch('type_id');

  const queryClient = useQueryClient();

  // Fetch recurring templates
  const { data: recurringData, isLoading } = useQuery({
    queryKey: ['recurring-templates'],
    queryFn: async () => {
      const response = await recurringAPI.getAll(true);
      return response.data.recurring_transactions;
    },
  });

  // Fetch accounts
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await accountsAPI.getAll();
      return response.data.accounts;
    },
    staleTime: 30 * 60 * 1000,
  });

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['categories-hierarchy'],
    queryFn: async () => {
      const response = await categoriesAPI.getHierarchy();
      return response.data.categories;
    },
    staleTime: 30 * 60 * 1000,
  });

  // Fetch recipients
  const { data: recipientsData } = useQuery({
    queryKey: ['recipients'],
    queryFn: async () => {
      const response = await transactionsAPI.getAllRecipients();
      return response.data.recipients;
    },
    staleTime: 30 * 60 * 1000,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => recurringAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      setOpenDialog(false);
      resetForm();
      toast.success('Recurring template created successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to create template:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to create template: ${errorMessage}`);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => recurringAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      setOpenDialog(false);
      resetForm();
      setEditingTemplate(null);
      toast.success('Recurring template updated successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to update template:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to update template: ${errorMessage}`);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => recurringAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      setDeleteConfirm(null);
      toast.success('Recurring template deleted successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to delete template:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to delete template: ${errorMessage}`);
    },
  });

  // Generate transactions mutation
  const generateMutation = useMutation({
    mutationFn: () => recurringAPI.generate(),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      queryClient.invalidateQueries({ queryKey: ['pending-transactions'] });
      toast.success(`Generated ${response.data.count} pending transactions`);
    },
    onError: (error: any) => {
      console.error('Failed to generate transactions:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to generate transactions: ${errorMessage}`);
    },
  });

  // Fetch pending transactions
  const { data: pendingData } = useQuery({
    queryKey: ['pending-transactions'],
    queryFn: async () => {
      const response = await transactionsAPI.getPending();
      return response.data.pending_transactions;
    },
  });

  // Confirm pending transaction
  const confirmMutation = useMutation({
    mutationFn: (id: number) => transactionsAPI.confirm(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['pending-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setSelectedPending((prev) => prev.filter((selectedId) => selectedId !== id));
      toast.success('Transaction approved successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to approve transaction:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to approve transaction: ${errorMessage}`);
    },
  });

  // Reject pending transaction
  const rejectMutation = useMutation({
    mutationFn: (id: number) => transactionsAPI.reject(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['pending-transactions'] });
      setSelectedPending((prev) => prev.filter((selectedId) => selectedId !== id));
      toast.success('Transaction rejected successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to reject transaction:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to reject transaction: ${errorMessage}`);
    },
  });

  // Batch approve selected
  const handleBatchApprove = async () => {
    try {
      const count = selectedPending.length;
      for (const id of selectedPending) {
        await confirmMutation.mutateAsync(id);
      }
      setSelectedPending([]);
      toast.success(`Successfully approved ${count} transaction${count !== 1 ? 's' : ''}!`);
    } catch (error) {
      console.error('Batch approve failed:', error);
    }
  };

  // Batch reject selected
  const handleBatchReject = async () => {
    try {
      const count = selectedPending.length;
      for (const id of selectedPending) {
        await rejectMutation.mutateAsync(id);
      }
      setSelectedPending([]);
      toast.success(`Successfully rejected ${count} transaction${count !== 1 ? 's' : ''}!`);
    } catch (error) {
      console.error('Batch reject failed:', error);
    }
  };

  const toggleSelectPending = (id: number) => {
    setSelectedPending((prev) =>
      prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPending = () => {
    if (selectedPending.length === pendingData?.length) {
      setSelectedPending([]);
    } else {
      setSelectedPending(pendingData?.map((t: any) => t.id) || []);
    }
  };

  const handleEdit = (template: any) => {
    setEditingTemplate(template);
    resetForm({
      name: template.name || '',
      account_id: template.account_id.toString(),
      amount: Math.abs(template.amount).toString(),
      currency: template.currency || 'EUR',
      description: template.description || '',
      destinataire: template.destinataire || '',
      type_id: template.type_id.toString(),
      subtype_id: template.subtype_id?.toString() || '',
      recurrence_pattern: template.recurrence_pattern || 'monthly',
      recurrence_interval: template.recurrence_interval?.toString() || '1',
      day_of_month: template.day_of_month?.toString() || '',
      start_date: template.start_date || format(new Date(), 'yyyy-MM-dd'),
      end_date: template.end_date || '',
      is_active: template.is_active === true || template.is_active === 1,
    });
    setOpenDialog(true);
    setTimeout(() => trigger(), 0);
  };

  const onSubmit = (formData: RecurringTemplateFormData) => {
    const data = {
      name: formData.name,
      account_id: parseInt(formData.account_id),
      amount: parseFloat(formData.amount),
      currency: formData.currency,
      description: formData.description?.trim() || null,
      destinataire: formData.destinataire?.trim() || null,
      type_id: parseInt(formData.type_id),
      subtype_id: formData.subtype_id ? parseInt(formData.subtype_id) : null,
      recurrence_pattern: formData.recurrence_pattern,
      recurrence_interval: parseInt(formData.recurrence_interval),
      day_of_month: formData.day_of_month ? parseInt(formData.day_of_month) : null,
      start_date: formData.start_date,
      end_date: formData.end_date || null,
      is_active: formData.is_active,
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyUtil(Math.abs(amount), 'EUR');
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'MMM dd, yyyy');
    } catch {
      return dateString;
    }
  };

  const getFrequencyLabel = (pattern: string, interval: number = 1) => {
    if (interval > 1) {
      return `Every ${interval} ${pattern}`;
    }
    return pattern.charAt(0).toUpperCase() + pattern.slice(1);
  };

  if (isLoading) {
    return <RecurringSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Recurring Transactions</h1>
        <p className="text-foreground-muted">
          {recurringData?.length || 0} template{(recurringData?.length || 0) !== 1 ? 's' : ''}, {pendingData?.length || 0} pending • Automate your regular payments
        </p>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Total Templates */}
        <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 opacity-5 blur-3xl rounded-full" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-blue-500 bg-opacity-10">
                <RefreshCw className="h-6 w-6 text-blue-500" />
              </div>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">Total Templates</p>
              <p className="text-2xl font-bold text-foreground">{recurringData?.length || 0}</p>
            </div>
          </div>
        </Card>

        {/* Active Templates */}
        <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 opacity-5 blur-3xl rounded-full" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-emerald-500 bg-opacity-10">
                <CheckCircle className="h-6 w-6 text-emerald-500" />
              </div>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">Active Templates</p>
              <p className="text-2xl font-bold text-foreground">
                {recurringData?.filter((t: any) => t.is_active).length || 0}
              </p>
            </div>
          </div>
        </Card>

        {/* Pending Approval */}
        <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500 opacity-5 blur-3xl rounded-full" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-amber-500 bg-opacity-10">
                <Clock className="h-6 w-6 text-amber-500" />
              </div>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">Pending Approval</p>
              <p className="text-2xl font-bold text-foreground">{pendingData?.length || 0}</p>
            </div>
          </div>
        </Card>

        {/* Inactive Templates */}
        <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-slate-500 opacity-5 blur-3xl rounded-full" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-slate-500 bg-opacity-10">
                <XCircle className="h-6 w-6 text-slate-500" />
              </div>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">Inactive Templates</p>
              <p className="text-2xl font-bold text-foreground">
                {recurringData?.filter((t: any) => !t.is_active).length || 0}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Action Bar */}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
        >
          <Play className="h-4 w-4 mr-2" />
          {generateMutation.isPending ? 'Generating...' : 'Generate Transactions'}
        </Button>
        <Button
          onClick={() => {
            setEditingTemplate(null);
            resetForm();
            setOpenDialog(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Template
        </Button>
      </div>

      {/* Tabs */}
      <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
        <Tabs value={currentTab} onValueChange={setCurrentTab}>
          <TabsList>
            <TabsTrigger value={0}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Templates
            </TabsTrigger>
            <TabsTrigger value={1}>
              <Clock className="h-4 w-4 mr-2" />
              Pending ({pendingData?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Tab 0: Templates */}
          <TabsContent value={0}>
            {recurringData && recurringData.length > 0 ? (
              isMobile ? (
                <div className="space-y-3">
                  {recurringData.map((template: any) => {
                    const isExpanded = expandedTemplate === template.id;
                    return (
                      <Card
                        key={template.id}
                        className={`rounded-xl overflow-hidden border border-border bg-card/50 backdrop-blur-sm transition-all ${
                          isExpanded ? 'ring-2 ring-primary/50' : ''
                        }`}
                      >
                        <div
                          className="p-4 cursor-pointer hover:bg-surface-hover transition-colors"
                          onClick={() => setExpandedTemplate(isExpanded ? null : template.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-foreground truncate">{template.name}</p>
                              {template.description && (
                                <p className="text-xs text-foreground-muted truncate">{template.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-semibold text-sm ${
                                  template.amount >= 0 ? 'text-success' : 'text-error'
                                }`}
                              >
                                {formatCurrency(template.amount)}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="h-5 w-5 text-foreground-muted flex-shrink-0" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-foreground-muted flex-shrink-0" />
                              )}
                            </div>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="border-t border-border px-4 py-3">
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <p className="text-xs text-foreground-muted mb-1">Account</p>
                                <p className="text-sm text-foreground">{template.account_name || 'Unknown'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-foreground-muted mb-1">Category</p>
                                <div className="flex flex-col gap-1">
                                  <Badge variant="secondary" className="w-fit text-xs">{template.type_name}</Badge>
                                  {template.subtype_name && (
                                    <Badge variant="outline" className="w-fit text-xs">{template.subtype_name}</Badge>
                                  )}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-foreground-muted mb-1">Frequency</p>
                                <Badge variant="outline" className="w-fit">
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  {getFrequencyLabel(template.recurrence_pattern, template.recurrence_interval)}
                                </Badge>
                              </div>
                              <div>
                                <p className="text-xs text-foreground-muted mb-1">Next Date</p>
                                <p className="text-sm text-foreground">
                                  {formatDate(template.last_generated || template.start_date)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-foreground-muted mb-1">Status</p>
                                {template.is_active ? (
                                  <Badge variant="success" className="w-fit">Active</Badge>
                                ) : (
                                  <Badge variant="secondary" className="w-fit">Inactive</Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1 pt-2 border-t border-border">
                              <Button variant="ghost" size="sm" onClick={() => handleEdit(template)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirm(template)}
                                className="text-error hover:text-error"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
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
                        <TableHead>Name</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Frequency</TableHead>
                        <TableHead>Next Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recurringData.map((template: any) => (
                        <TableRow key={template.id}>
                          <TableCell>
                            <div>
                              <p className="font-semibold text-foreground">{template.name}</p>
                              <p className="text-xs text-foreground-muted">{template.description}</p>
                            </div>
                          </TableCell>
                          <TableCell>{template.account_name || 'Unknown'}</TableCell>
                          <TableCell
                            className={`font-semibold ${template.amount >= 0 ? 'text-success' : 'text-error'}`}
                          >
                            {formatCurrency(template.amount)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant="secondary">{template.type_name}</Badge>
                              {template.subtype_name && (
                                <Badge variant="outline">{template.subtype_name}</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              <RefreshCw className="h-3 w-3 mr-1" />
                              {getFrequencyLabel(template.recurrence_pattern, template.recurrence_interval)}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(template.last_generated || template.start_date)}</TableCell>
                          <TableCell>
                            {template.is_active ? (
                              <Badge variant="success">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleEdit(template)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirm(template)}
                                className="text-error hover:text-error"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[300px]">
                <RefreshCw className="h-20 w-20 text-foreground-muted mb-4" />
                <h2 className="text-xl font-semibold text-foreground-muted mb-2">No Recurring Templates</h2>
                <p className="text-sm text-foreground-muted mb-6">
                  Create templates for transactions that repeat regularly
                </p>
                <Button
                  onClick={() => {
                    setEditingTemplate(null);
                    resetForm();
                    setOpenDialog(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Template
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Tab 1: Pending Transactions */}
          <TabsContent value={1}>
            {pendingData && pendingData.length > 0 ? (
              <>
                {/* Batch Actions */}
                {selectedPending.length > 0 && (
                  <div className="flex gap-3 mb-4 items-center">
                    <span className="text-sm text-foreground-muted">{selectedPending.length} selected</span>
                    <Button
                      size="sm"
                      variant="success"
                      onClick={handleBatchApprove}
                      disabled={confirmMutation.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve Selected
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleBatchReject}
                      disabled={rejectMutation.isPending}
                      className="text-error border-error hover:bg-error/10"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject Selected
                    </Button>
                  </div>
                )}
                {isMobile ? (
                  <div className="space-y-3">
                    {pendingData.map((transaction: any) => {
                      const isExpanded = expandedPending === transaction.id;
                      const isSelected = selectedPending.includes(transaction.id);
                      return (
                        <Card
                          key={transaction.id}
                          className={`rounded-xl overflow-hidden border border-border bg-card/50 backdrop-blur-sm transition-all ${
                            isExpanded ? 'ring-2 ring-primary/50' : ''
                          }`}
                        >
                          <div
                            className="p-4 cursor-pointer hover:bg-surface-hover transition-colors"
                            onClick={() => setExpandedPending(isExpanded ? null : transaction.id)}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  toggleSelectPending(transaction.id);
                                }}
                                className="w-4 h-4 mt-1 rounded border-border bg-surface flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <p className="text-sm text-foreground font-medium">
                                    {format(new Date(transaction.transaction_date), 'MMM dd, yyyy')}
                                  </p>
                                  <span
                                    className={`font-semibold text-sm flex-shrink-0 ${
                                      transaction.amount >= 0 ? 'text-success' : 'text-error'
                                    }`}
                                  >
                                    {formatCurrencyUtil(transaction.amount, transaction.currency || 'EUR')}
                                  </span>
                                </div>
                                <p className="text-sm text-foreground truncate">
                                  {transaction.destinataire && transaction.destinataire.trim() !== ''
                                    ? transaction.destinataire
                                    : transaction.description || '-'}
                                </p>
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="h-5 w-5 text-foreground-muted flex-shrink-0" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-foreground-muted flex-shrink-0" />
                              )}
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="border-t border-border px-4 py-3">
                              <div className="grid grid-cols-2 gap-3 mb-3">
                                <div>
                                  <p className="text-xs text-foreground-muted mb-1">Description</p>
                                  <p className="text-sm text-foreground">
                                    {transaction.description && transaction.description.trim() !== ''
                                      ? transaction.description
                                      : '-'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-foreground-muted mb-1">Account</p>
                                  <p className="text-sm text-foreground">{transaction.account_name}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-foreground-muted mb-1">Category</p>
                                  <div className="flex flex-col gap-1">
                                    <Badge variant="secondary" className="w-fit text-xs">
                                      {transaction.type_name || 'Uncategorized'}
                                    </Badge>
                                    {transaction.subtype_name && (
                                      <Badge variant="outline" className="w-fit text-xs">{transaction.subtype_name}</Badge>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <p className="text-xs text-foreground-muted mb-1">Template</p>
                                  <Badge variant="outline" className="w-fit">
                                    {transaction.recurring_template_name || 'N/A'}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex gap-1 pt-2 border-t border-border">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => confirmMutation.mutate(transaction.id)}
                                  disabled={confirmMutation.isPending}
                                  className="text-success hover:text-success"
                                  title="Approve"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => rejectMutation.mutate(transaction.id)}
                                  disabled={rejectMutation.isPending}
                                  className="text-error hover:text-error"
                                  title="Reject"
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
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
                          <TableHead className="w-12">
                            <input
                              type="checkbox"
                              checked={selectedPending.length === pendingData.length}
                              onChange={toggleSelectAllPending}
                              className="w-4 h-4 rounded border-border bg-surface"
                            />
                          </TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Recipient</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Template</TableHead>
                          <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingData.map((transaction: any) => (
                          <TableRow key={transaction.id}>
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={selectedPending.includes(transaction.id)}
                                onChange={() => toggleSelectPending(transaction.id)}
                                className="w-4 h-4 rounded border-border bg-surface"
                              />
                            </TableCell>
                            <TableCell>{format(new Date(transaction.transaction_date), 'MMM dd, yyyy')}</TableCell>
                            <TableCell>
                              {transaction.destinataire && transaction.destinataire.trim() !== ''
                                ? transaction.destinataire
                                : '-'}
                            </TableCell>
                            <TableCell className="text-foreground-muted">
                              {transaction.description && transaction.description.trim() !== ''
                                ? transaction.description
                                : '-'}
                            </TableCell>
                            <TableCell>{transaction.account_name}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Badge variant="secondary">{transaction.type_name || 'Uncategorized'}</Badge>
                                {transaction.subtype_name && (
                                  <Badge variant="outline" className="text-xs">{transaction.subtype_name}</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell
                              className={`text-right font-semibold ${
                                transaction.amount >= 0 ? 'text-success' : 'text-error'
                              }`}
                            >
                              {formatCurrencyUtil(transaction.amount, transaction.currency || 'EUR')}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{transaction.recurring_template_name || 'N/A'}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => confirmMutation.mutate(transaction.id)}
                                  disabled={confirmMutation.isPending}
                                  className="text-success hover:text-success"
                                  title="Approve"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => rejectMutation.mutate(transaction.id)}
                                  disabled={rejectMutation.isPending}
                                  className="text-error hover:text-error"
                                  title="Reject"
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[300px]">
                <Clock className="h-20 w-20 text-foreground-muted mb-4" />
                <h2 className="text-xl font-semibold text-foreground-muted mb-2">No Pending Transactions</h2>
                <p className="text-sm text-foreground-muted mb-6">
                  Click "Generate Transactions" to create pending transactions from your templates
                </p>
                <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                  Generate Now
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent size="full" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Recurring Template' : 'Add Recurring Template'}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? 'Update the recurring transaction template.' : 'Create a new recurring transaction template.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit(onSubmit)}>
            <div className="space-y-4">
              <FormField label="Template Name" error={errors.name?.message} required>
                <Input
                  {...register('name')}
                  placeholder="e.g., Monthly Rent, Weekly Groceries"
                />
              </FormField>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Account" error={errors.account_id?.message} required>
                  <Controller
                    name="account_id"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
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
                    )}
                  />
                </FormField>
                <FormField label="Amount" error={errors.amount?.message} required>
                  <Input type="number" step="0.01" {...register('amount')} />
                </FormField>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Category" error={errors.type_id?.message} required>
                  <Controller
                    name="type_id"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          setValue('subtype_id', '');
                        }}
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
                    )}
                  />
                </FormField>
                {typeId && (
                  <FormField label="Subcategory">
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
                              ?.find((c: any) => c.id === parseInt(typeId))
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
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Frequency" error={errors.recurrence_pattern?.message} required>
                  <Controller
                    name="recurrence_pattern"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
                <FormField label="Interval" error={errors.recurrence_interval?.message} required helperText="Every X days/weeks/months/years">
                  <Input type="number" {...register('recurrence_interval')} />
                </FormField>
              </div>

              {recurrencePattern === 'monthly' && (
                <FormField label="Day of Month (Optional)" helperText="Specific day (1-31)">
                  <Input type="number" min={1} max={31} {...register('day_of_month')} />
                </FormField>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Start Date" error={errors.start_date?.message} required>
                  <Input type="date" {...register('start_date')} />
                </FormField>
                <FormField label="End Date (Optional)" helperText="Leave empty for no end date">
                  <Input type="date" {...register('end_date')} />
                </FormField>
              </div>

              <FormField label="Recipient">
                <Controller
                  name="destinataire"
                  control={control}
                  render={({ field }) => (
                    <Autocomplete
                      options={recipientsData || []}
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="Enter recipient name..."
                    />
                  )}
                />
              </FormField>

              <FormField label="Description (Optional)">
                <Input {...register('description')} placeholder="Additional notes or description" />
              </FormField>

              <Controller
                name="is_active"
                control={control}
                render={({ field }) => (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      className="w-4 h-4 rounded border-border bg-surface text-primary focus:ring-primary"
                    />
                    <span className="text-sm">Active</span>
                  </label>
                )}
              />
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" type="button" onClick={() => setOpenDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid || createMutation.isPending || updateMutation.isPending}>
                {editingTemplate ? 'Update' : 'Create'}
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
              Confirm deletion of this recurring template.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 text-warning">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">
                Are you sure you want to delete the recurring template "{deleteConfirm?.name}"?
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
