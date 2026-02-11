// Envelopes Page - Savings Goals with Progress Tracking
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { envelopeSchema, type EnvelopeFormData } from '../lib/validations';
import {
  Plus,
  Pencil,
  Trash2,
  PiggyBank,
  CheckCircle,
  Clock,
  Minus,
  RefreshCw,
  EyeOff,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Label,
  Badge,
  Spinner,
  Progress,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Textarea,
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
  FormField,
  EnvelopesSkeleton,
} from '../components/shadcn';
import { envelopesAPI, accountsAPI, transactionsAPI } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { format, parseISO, isPast, differenceInDays } from 'date-fns';
import { formatCurrency as formatCurrencyUtil } from '../lib/utils';
import { sumMoney, absMoney, negateMoney } from '../lib/money';

export default function EnvelopesPage() {
  const toast = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [openTransactionDialog, setOpenTransactionDialog] = useState(false);
  const [editingEnvelope, setEditingEnvelope] = useState<any>(null);
  const [selectedEnvelope, setSelectedEnvelope] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState<any>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [transactionType, setTransactionType] = useState<'add' | 'withdraw'>('add');
  const [transactionForm, setTransactionForm] = useState({
    amount: '',
    description: '',
    transaction_date: format(new Date(), 'yyyy-MM-dd'),
    account_id: '',
    transaction_id: '',
  });

  // Envelope form with validation
  const {
    register,
    handleSubmit: handleFormSubmit,
    formState: { errors, isValid },
    reset: resetForm,
    watch,
    trigger,
  } = useForm<EnvelopeFormData>({
    resolver: zodResolver(envelopeSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      target_amount: '',
      deadline: '',
      description: '',
      tags: '',
      color: '#4ECDC4',
    },
  });

  // Watch color value for the color picker
  const colorValue = watch('color');

  const queryClient = useQueryClient();

  // Fetch envelopes
  const { data: envelopesData, isLoading: envelopesLoading, error: envelopesError } = useQuery({
    queryKey: ['envelopes', showInactive],
    queryFn: async () => {
      const response = await envelopesAPI.getAll(showInactive);
      return response.data.envelopes;
    },
  });

  // Fetch accounts for account selector
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await accountsAPI.getAll();
      return response.data.accounts;
    },
    staleTime: 30 * 60 * 1000,
  });

  // Fetch recent transactions for linking
  const { data: recentTransactionsData } = useQuery({
    queryKey: ['recent-transactions'],
    queryFn: async () => {
      const response = await transactionsAPI.getAll({ limit: 100, confirmed: 1 });
      return response.data.transactions;
    },
    enabled: openTransactionDialog,
    staleTime: 5 * 60 * 1000,
  });

  // Create envelope mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => envelopesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envelopes'] });
      setOpenDialog(false);
      resetForm();
      toast.success('Envelope created successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to create envelope:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to create envelope: ${errorMessage}`);
    },
  });

  // Update envelope mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => envelopesAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envelopes'] });
      setOpenDialog(false);
      resetForm();
      setEditingEnvelope(null);
      toast.success('Envelope updated successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to update envelope:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to update envelope: ${errorMessage}`);
    },
  });

  // Deactivate envelope mutation (soft delete)
  const deleteMutation = useMutation({
    mutationFn: (id: number) => envelopesAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envelopes'] });
      setDeleteConfirm(null);
      toast.success('Envelope deactivated successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to deactivate envelope:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to deactivate envelope: ${errorMessage}`);
    },
  });

  // Permanent delete envelope mutation
  const permanentDeleteMutation = useMutation({
    mutationFn: (id: number) => envelopesAPI.permanentDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envelopes'] });
      setPermanentDeleteConfirm(null);
      toast.success('Envelope permanently deleted!');
    },
    onError: (error: any) => {
      console.error('Failed to delete envelope:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to delete envelope: ${errorMessage}`);
    },
  });

  // Reactivate envelope mutation
  const reactivateMutation = useMutation({
    mutationFn: (id: number) => envelopesAPI.reactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envelopes'] });
      toast.success('Envelope reactivated successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to reactivate envelope:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to reactivate envelope: ${errorMessage}`);
    },
  });

  // Add transaction mutation
  const addTransactionMutation = useMutation({
    mutationFn: (data: any) => envelopesAPI.addTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envelopes'] });
      queryClient.invalidateQueries({ queryKey: ['envelope-transactions', selectedEnvelope?.id] });
      setOpenTransactionDialog(false);
      setTransactionForm({ amount: '', description: '', transaction_date: format(new Date(), 'yyyy-MM-dd'), account_id: '', transaction_id: '' });
      toast.success('Transaction added successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to add transaction:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to add transaction: ${errorMessage}`);
    },
  });

  const handleEdit = (envelope: any) => {
    setEditingEnvelope(envelope);
    resetForm({
      name: envelope.name,
      target_amount: envelope.target_amount.toString(),
      deadline: envelope.deadline || '',
      description: envelope.description || '',
      tags: envelope.tags || '',
      color: envelope.color || '#4ECDC4',
    });
    setOpenDialog(true);
    // Trigger validation after reset to enable the Update button
    setTimeout(() => trigger(), 0);
  };

  const onSubmit = (formData: EnvelopeFormData) => {
    const data = {
      name: formData.name,
      target_amount: parseFloat(formData.target_amount),
      deadline: formData.deadline || null,
      description: formData.description,
      tags: formData.tags || null,
      color: formData.color,
    };

    if (editingEnvelope) {
      updateMutation.mutate({ id: editingEnvelope.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleAddTransaction = () => {
    if (selectedEnvelope) {
      const amount = parseFloat(transactionForm.amount);
      const data: any = {
        envelope_id: selectedEnvelope.id,
        amount: transactionType === 'withdraw' ? negateMoney(absMoney(amount)) : absMoney(amount),
        description: transactionForm.description || (transactionType === 'withdraw' ? 'Withdrawal' : 'Deposit'),
        date: transactionForm.transaction_date,  // API expects 'date' field
      };

      // account_id is optional - only include if selected
      if (transactionForm.account_id) {
        data.account_id = parseInt(transactionForm.account_id);
      }

      // transaction_id is optional - only include if selected
      if (transactionForm.transaction_id) {
        data.transaction_id = parseInt(transactionForm.transaction_id);
      }

      addTransactionMutation.mutate(data);
    }
  };

  const handleOpenAddFunds = (envelope: any) => {
    setSelectedEnvelope(envelope);
    setTransactionType('add');
    setTransactionForm({ amount: '', description: '', transaction_date: format(new Date(), 'yyyy-MM-dd'), account_id: '', transaction_id: '' });
    setOpenTransactionDialog(true);
  };

  const handleOpenWithdraw = (envelope: any) => {
    setSelectedEnvelope(envelope);
    setTransactionType('withdraw');
    setTransactionForm({ amount: '', description: '', transaction_date: format(new Date(), 'yyyy-MM-dd'), account_id: '', transaction_id: '' });
    setOpenTransactionDialog(true);
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyUtil(amount, 'EUR');
  };

  const getProgressVariant = (percentage: number): 'error' | 'warning' | 'info' | 'success' => {
    if (percentage >= 100) return 'success';
    if (percentage >= 75) return 'info';
    if (percentage >= 50) return 'warning';
    return 'error';
  };

  const getDeadlineStatus = (deadline: string | null | undefined) => {
    if (!deadline) {
      return { variant: 'default' as const, text: 'No deadline', daysLeft: null, icon: <Clock className="h-3 w-3" /> };
    }

    try {
      const deadlineDate = parseISO(deadline);

      if (isNaN(deadlineDate.getTime())) {
        return { variant: 'default' as const, text: 'Invalid date', daysLeft: null, icon: <Clock className="h-3 w-3" /> };
      }

      const daysRemaining = differenceInDays(deadlineDate, new Date());

      if (isPast(deadlineDate)) {
        return { variant: 'error' as const, text: 'Overdue', daysLeft: 0, icon: <Clock className="h-3 w-3" /> };
      } else if (daysRemaining <= 7) {
        return { variant: 'warning' as const, text: `${daysRemaining} days left`, daysLeft: daysRemaining, icon: <Clock className="h-3 w-3" /> };
      } else if (daysRemaining <= 30) {
        return { variant: 'info' as const, text: `${daysRemaining} days left`, daysLeft: daysRemaining, icon: <Clock className="h-3 w-3" /> };
      } else {
        return { variant: 'default' as const, text: `${daysRemaining} days left`, daysLeft: daysRemaining, icon: <Clock className="h-3 w-3" /> };
      }
    } catch {
      return { variant: 'default' as const, text: 'Invalid date', daysLeft: null, icon: <Clock className="h-3 w-3" /> };
    }
  };

  // Calculate monthly savings needed to reach target by deadline
  const getMonthlyTarget = (envelope: any) => {
    if (!envelope.deadline) return null;

    try {
      const deadlineDate = parseISO(envelope.deadline);
      if (isNaN(deadlineDate.getTime()) || isPast(deadlineDate)) return null;

      const remaining = envelope.target_amount - envelope.current_amount;
      if (remaining <= 0) return 0; // Goal already reached

      const daysRemaining = differenceInDays(deadlineDate, new Date());
      const monthsRemaining = daysRemaining / 30.44; // Average days per month

      if (monthsRemaining < 1) {
        // Less than a month left - show total remaining needed
        return remaining;
      }

      return remaining / monthsRemaining;
    } catch {
      return null;
    }
  };

  if (envelopesLoading) {
    return <EnvelopesSkeleton />;
  }

  if (envelopesError) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 p-4 rounded-lg bg-error/10 text-error">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p>Failed to load envelopes: {(envelopesError as any)?.message || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  // Calculate summary statistics using precise decimal arithmetic
  const totalTarget = sumMoney(envelopesData || [], (env: any) => env.target_amount);
  const totalCurrent = sumMoney(envelopesData || [], (env: any) => env.current_amount);
  const completedGoals = envelopesData?.filter((env: any) => env.current_amount >= env.target_amount).length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-foreground">
          Savings Envelopes
        </h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-surface text-primary focus:ring-primary"
            />
            Show Inactive
          </label>
          <Button
            onClick={() => {
              setEditingEnvelope(null);
              resetForm();
              setOpenDialog(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Envelope
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <PiggyBank className="h-5 w-5 text-primary" />
            <span className="text-sm text-foreground-muted">Total Goals</span>
          </div>
          <p className="text-3xl font-bold text-primary">{envelopesData?.length || 0}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-5 w-5 text-success" />
            <span className="text-sm text-foreground-muted">Completed</span>
          </div>
          <p className="text-3xl font-bold text-success">{completedGoals}</p>
        </Card>
        <Card className="p-4">
          <span className="text-sm text-foreground-muted">Total Target</span>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalTarget)}</p>
        </Card>
        <Card className="p-4">
          <span className="text-sm text-foreground-muted">Total Saved</span>
          <p className="text-2xl font-bold text-success mt-1">{formatCurrency(totalCurrent)}</p>
          <span className="text-xs text-foreground-muted">
            {totalTarget > 0 ? `${((totalCurrent / totalTarget) * 100).toFixed(1)}% of target` : '0%'}
          </span>
        </Card>
      </div>

      {/* Envelopes List */}
      {envelopesData && envelopesData.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {envelopesData.map((envelope: any) => {
            const percentage = (envelope.current_amount / envelope.target_amount) * 100;
            const deadlineStatus = getDeadlineStatus(envelope.deadline);
            const isInactive = !envelope.is_active;

            return (
              <Card
                key={envelope.id}
                className={`p-6 relative ${isInactive ? 'opacity-60' : ''}`}
              >
                {isInactive && (
                  <div className="absolute top-3 right-3 z-10">
                    <Badge variant="outline">
                      <EyeOff className="h-3 w-3 mr-1" />
                      Inactive
                    </Badge>
                  </div>
                )}

                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {envelope.color && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: envelope.color }}
                        />
                      )}
                      <h3 className="text-lg font-semibold text-foreground">
                        {envelope.name}
                      </h3>
                    </div>
                    {envelope.description && (
                      <p className="text-sm text-foreground-muted mt-1">
                        {envelope.description}
                      </p>
                    )}
                    {envelope.tags && (
                      <div className="flex gap-1 flex-wrap mt-2">
                        {envelope.tags.split(',').map((tag: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {tag.trim()}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isInactive ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => reactivateMutation.mutate(envelope.id)}
                          title="Reactivate"
                          className="text-success hover:text-success"
                          disabled={reactivateMutation.isPending}
                        >
                          <RefreshCw className={`h-4 w-4 ${reactivateMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPermanentDeleteConfirm(envelope)}
                          className="text-error hover:text-error"
                          title="Delete Permanently"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(envelope)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(envelope)}
                          className="text-warning hover:text-warning"
                          title="Deactivate"
                        >
                          <EyeOff className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress */}
                <div className="mb-4">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-foreground-muted">Progress</span>
                    <span className="text-sm font-semibold">{percentage.toFixed(1)}%</span>
                  </div>
                  <Progress
                    value={Math.min(percentage, 100)}
                    variant={getProgressVariant(percentage)}
                    className="h-2.5"
                  />
                </div>

                {/* Amount Details */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <span className="text-xs text-foreground-muted">Current</span>
                    <p className="text-lg font-bold text-success">
                      {formatCurrency(envelope.current_amount)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-foreground-muted">Target</span>
                    <p className="text-lg font-bold text-foreground">
                      {formatCurrency(envelope.target_amount)}
                    </p>
                  </div>
                </div>

                {/* Monthly Target & Days Left */}
                {!isInactive && envelope.current_amount < envelope.target_amount && (
                  <div className="grid grid-cols-2 gap-4 mb-4 p-3 rounded-lg bg-surface-secondary">
                    {deadlineStatus.daysLeft !== null && deadlineStatus.daysLeft > 0 && (
                      <div>
                        <span className="text-xs text-foreground-muted">Days Left</span>
                        <p className="text-sm font-semibold text-foreground">{deadlineStatus.daysLeft} days</p>
                      </div>
                    )}
                    {(() => {
                      const monthlyTarget = getMonthlyTarget(envelope);
                      if (monthlyTarget !== null && monthlyTarget > 0) {
                        return (
                          <div>
                            <span className="text-xs text-foreground-muted">Monthly Target</span>
                            <p className="text-sm font-semibold text-primary">{formatCurrency(monthlyTarget)}/mo</p>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-between items-center">
                  <Badge variant={deadlineStatus.variant}>
                    {deadlineStatus.icon}
                    <span className="ml-1">{deadlineStatus.text}</span>
                  </Badge>
                  {!isInactive && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenWithdraw(envelope)}
                        disabled={envelope.current_amount <= 0 || addTransactionMutation.isPending}
                        className="text-error border-error hover:bg-error/10"
                      >
                        <Minus className="h-4 w-4 mr-1" />
                        Withdraw
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenAddFunds(envelope)}
                        disabled={addTransactionMutation.isPending}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Funds
                      </Button>
                    </div>
                  )}
                </div>

                {/* Transaction History Accordion */}
                <Accordion className="mt-4">
                  <AccordionItem className="border-0 bg-transparent">
                    <AccordionTrigger className="px-0 py-2 hover:bg-transparent">
                      <span className="text-sm text-foreground-muted">Transaction History</span>
                    </AccordionTrigger>
                    <AccordionContent className="px-0">
                      <EnvelopeTransactions envelopeId={envelope.id} />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="flex flex-col items-center justify-center min-h-[300px]">
            <PiggyBank className="h-20 w-20 text-foreground-muted mb-4" />
            <h2 className="text-xl font-semibold text-foreground-muted mb-2">
              No Savings Goals Yet
            </h2>
            <p className="text-sm text-foreground-muted mb-6">
              Create your first envelope to start tracking savings goals
            </p>
            <Button
              onClick={() => {
                setEditingEnvelope(null);
                resetForm();
                setOpenDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Envelope
            </Button>
          </div>
        </Card>
      )}

      {/* Add/Edit Envelope Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editingEnvelope ? 'Edit Envelope' : 'Create Envelope'}</DialogTitle>
            <DialogDescription>
              {editingEnvelope ? 'Update your savings envelope details.' : 'Set up a new savings goal to track your progress.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit(onSubmit)}>
            <div className="space-y-4 py-4">
              <FormField label="Name" error={errors.name?.message} required>
                <Input
                  {...register('name')}
                  placeholder="e.g., Emergency Fund, Vacation"
                />
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Target Amount" error={errors.target_amount?.message} required>
                  <Input
                    type="number"
                    step="0.01"
                    {...register('target_amount')}
                    placeholder="0.00"
                  />
                </FormField>
                <FormField label="Deadline (Optional)">
                  <Input
                    type="date"
                    {...register('deadline')}
                  />
                </FormField>
              </div>

              <FormField label="Description (Optional)">
                <Textarea
                  {...register('description')}
                  placeholder="What are you saving for?"
                  rows={2}
                />
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="Tags (comma-separated)" helperText="Add tags to organize your envelopes" className="col-span-2">
                  <Input
                    {...register('tags')}
                    placeholder="e.g., savings, emergency, short-term"
                  />
                </FormField>
                <FormField label="Color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      {...register('color')}
                      className="w-10 h-10 rounded cursor-pointer border border-border"
                    />
                    <Input
                      value={colorValue}
                      {...register('color')}
                      className="flex-1"
                    />
                  </div>
                </FormField>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setOpenDialog(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!isValid || createMutation.isPending || updateMutation.isPending}
              >
                {editingEnvelope ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add/Withdraw Transaction Dialog */}
      <Dialog open={openTransactionDialog} onOpenChange={setOpenTransactionDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {transactionType === 'withdraw' ? 'Withdraw from' : 'Add Funds to'} {selectedEnvelope?.name}
            </DialogTitle>
            <DialogDescription>
              {transactionType === 'withdraw'
                ? 'Withdraw funds from this envelope allocation.'
                : 'Add funds to this envelope allocation.'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {transactionType === 'withdraw' && selectedEnvelope && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-info/10 text-info">
                <Info className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">Available balance: {formatCurrency(selectedEnvelope.current_amount)}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={transactionForm.amount}
                onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                min={0}
                className={
                  transactionType === 'withdraw' &&
                  selectedEnvelope &&
                  parseFloat(transactionForm.amount) > selectedEnvelope.current_amount
                    ? 'border-error focus:ring-error'
                    : ''
                }
              />
              {transactionType === 'withdraw' &&
                selectedEnvelope &&
                parseFloat(transactionForm.amount) > selectedEnvelope.current_amount && (
                  <p className="text-xs text-error">Amount exceeds available balance</p>
                )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="account">Account (Optional)</Label>
              <Select
                value={transactionForm.account_id}
                onValueChange={(value) => setTransactionForm({ ...transactionForm, account_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None - Virtual allocation only" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {accountsData?.map((account: any) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name} - {account.bank_name} ({formatCurrency(account.balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-foreground-muted">
                Envelope transactions are virtual allocations. Leave empty for goal tracking only.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedTransaction">Link to Transaction (Optional)</Label>
              <Select
                value={transactionForm.transaction_id}
                onValueChange={(value) => setTransactionForm({ ...transactionForm, transaction_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None - No link to existing transaction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {recentTransactionsData?.map((transaction: any) => (
                    <SelectItem key={transaction.id} value={transaction.id.toString()}>
                      {format(parseISO(transaction.date), 'MMM dd, yyyy')} - {transaction.description} ({formatCurrency(transaction.amount)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-foreground-muted">
                Optionally link this envelope allocation to an existing transaction for tracking.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="txDescription">Description (Optional)</Label>
              <Input
                id="txDescription"
                value={transactionForm.description}
                onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                placeholder={transactionType === 'withdraw' ? 'Withdrawal reason' : 'Deposit note'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="txDate">Transaction Date</Label>
              <Input
                id="txDate"
                type="date"
                value={transactionForm.transaction_date}
                onChange={(e) => setTransactionForm({ ...transactionForm, transaction_date: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenTransactionDialog(false)}>
              Cancel
            </Button>
            <Button
              variant={transactionType === 'withdraw' ? 'destructive' : 'default'}
              onClick={handleAddTransaction}
              disabled={
                addTransactionMutation.isPending ||
                !transactionForm.amount ||
                parseFloat(transactionForm.amount) <= 0 ||
                (transactionType === 'withdraw' &&
                  selectedEnvelope &&
                  parseFloat(transactionForm.amount) > selectedEnvelope.current_amount)
              }
            >
              {transactionType === 'withdraw' ? 'Withdraw' : 'Add Funds'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Deactivate Envelope</DialogTitle>
            <DialogDescription className="sr-only">
              Confirm deactivation of this envelope.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-info/10 text-info">
              <Info className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">
                Are you sure you want to deactivate the envelope "{deleteConfirm?.name}"?
                The envelope will be hidden from the main view but can be reactivated later by enabling "Show Inactive".
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="warning"
              onClick={() => deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deactivating...' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Confirmation Dialog */}
      <Dialog open={!!permanentDeleteConfirm} onOpenChange={() => setPermanentDeleteConfirm(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Permanently Delete Envelope</DialogTitle>
            <DialogDescription className="sr-only">
              Confirm permanent deletion of this envelope and all associated transactions.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-error/10 text-error">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold mb-1">Warning: This action cannot be undone!</p>
                <p>
                  Are you sure you want to permanently delete the envelope "{permanentDeleteConfirm?.name}"?
                  All associated transactions will also be deleted.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermanentDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => permanentDeleteMutation.mutate(permanentDeleteConfirm.id)}
              disabled={permanentDeleteMutation.isPending}
            >
              {permanentDeleteMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Envelope Transactions Component
function EnvelopeTransactions({ envelopeId }: { envelopeId: number }) {
  const { data: transactionsData, isLoading, error } = useQuery({
    queryKey: ['envelope-transactions', envelopeId],
    queryFn: async () => {
      const response = await envelopesAPI.getTransactions(envelopeId);
      return response.data.transactions;
    },
  });

  const formatCurrency = (amount: number) => {
    return formatCurrencyUtil(amount, 'EUR');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Spinner size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-lg bg-error/10 text-error text-sm">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p>Failed to load transactions</p>
      </div>
    );
  }

  if (!transactionsData || transactionsData.length === 0) {
    return (
      <p className="text-sm text-foreground-muted text-center py-4">
        No transactions yet
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactionsData.map((transaction: any) => (
          <TableRow key={transaction.id}>
            <TableCell className="text-sm">
              {transaction.date ? format(parseISO(transaction.date), 'MMM dd, yyyy') : 'N/A'}
            </TableCell>
            <TableCell className="text-sm">
              <div>
                <div>{transaction.description}</div>
                {transaction.linked_transaction && (
                  <Badge variant="outline" className="text-xs mt-1">
                    Linked: {transaction.linked_transaction.description}
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell
              className={`text-right font-semibold ${
                transaction.amount >= 0 ? 'text-success' : 'text-error'
              }`}
            >
              {formatCurrency(transaction.amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
