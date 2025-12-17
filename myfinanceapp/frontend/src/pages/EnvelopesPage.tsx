// Envelopes Page - Savings Goals with Progress Tracking
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/shadcn';
import { envelopesAPI } from '../services/api';
import { format, parseISO, isPast, differenceInDays } from 'date-fns';

interface EnvelopeFormData {
  name: string;
  target_amount: string;
  deadline: string;
  description: string;
  tags: string;
  color: string;
}

export default function EnvelopesPage() {
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
  });

  const [formData, setFormData] = useState<EnvelopeFormData>({
    name: '',
    target_amount: '',
    deadline: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    tags: '',
    color: '#4ECDC4',
  });

  const queryClient = useQueryClient();

  // Fetch envelopes
  const { data: envelopesData, isLoading: envelopesLoading, error: envelopesError } = useQuery({
    queryKey: ['envelopes', showInactive],
    queryFn: async () => {
      const response = await envelopesAPI.getAll(showInactive);
      return response.data.envelopes;
    },
  });

  // Create envelope mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => envelopesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envelopes'] });
      setOpenDialog(false);
      resetForm();
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
    },
  });

  // Deactivate envelope mutation (soft delete)
  const deleteMutation = useMutation({
    mutationFn: (id: number) => envelopesAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envelopes'] });
      setDeleteConfirm(null);
    },
  });

  // Permanent delete envelope mutation
  const permanentDeleteMutation = useMutation({
    mutationFn: (id: number) => envelopesAPI.permanentDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envelopes'] });
      setPermanentDeleteConfirm(null);
    },
  });

  // Reactivate envelope mutation
  const reactivateMutation = useMutation({
    mutationFn: (id: number) => envelopesAPI.reactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envelopes'] });
    },
  });

  // Add transaction mutation
  const addTransactionMutation = useMutation({
    mutationFn: (data: any) => envelopesAPI.addTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envelopes'] });
      queryClient.invalidateQueries({ queryKey: ['envelope-transactions', selectedEnvelope?.id] });
      setOpenTransactionDialog(false);
      setTransactionForm({ amount: '', description: '' });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      target_amount: '',
      deadline: format(new Date(), 'yyyy-MM-dd'),
      description: '',
      tags: '',
      color: '#4ECDC4',
    });
  };

  const handleEdit = (envelope: any) => {
    setEditingEnvelope(envelope);
    setFormData({
      name: envelope.name,
      target_amount: envelope.target_amount.toString(),
      deadline: envelope.deadline || format(new Date(), 'yyyy-MM-dd'),
      description: envelope.description || '',
      tags: envelope.tags || '',
      color: envelope.color || '#4ECDC4',
    });
    setOpenDialog(true);
  };

  const handleSubmit = () => {
    const data = {
      name: formData.name,
      target_amount: parseFloat(formData.target_amount),
      deadline: formData.deadline,
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
      const data = {
        envelope_id: selectedEnvelope.id,
        amount: transactionType === 'withdraw' ? -Math.abs(amount) : Math.abs(amount),
        description: transactionForm.description || (transactionType === 'withdraw' ? 'Withdrawal' : 'Deposit'),
      };
      addTransactionMutation.mutate(data);
    }
  };

  const handleOpenAddFunds = (envelope: any) => {
    setSelectedEnvelope(envelope);
    setTransactionType('add');
    setTransactionForm({ amount: '', description: '' });
    setOpenTransactionDialog(true);
  };

  const handleOpenWithdraw = (envelope: any) => {
    setSelectedEnvelope(envelope);
    setTransactionType('withdraw');
    setTransactionForm({ amount: '', description: '' });
    setOpenTransactionDialog(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
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
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
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

  // Calculate summary statistics
  const totalTarget = envelopesData?.reduce((sum: number, env: any) => sum + env.target_amount, 0) || 0;
  const totalCurrent = envelopesData?.reduce((sum: number, env: any) => sum + env.current_amount, 0) || 0;
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
        <Card className="p-6">
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

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Emergency Fund, Vacation"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="target">Target Amount</Label>
                <Input
                  id="target"
                  type="number"
                  value={formData.target_amount}
                  onChange={(e) => setFormData({ ...formData, target_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deadline">Deadline</Label>
                <Input
                  id="deadline"
                  type="date"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What are you saving for?"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="e.g., savings, emergency, short-term"
                />
                <p className="text-xs text-foreground-muted">Add tags to organize your envelopes</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer border border-border"
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending || !formData.name || !formData.target_amount}
            >
              {editingEnvelope ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Withdraw Transaction Dialog */}
      <Dialog open={openTransactionDialog} onOpenChange={setOpenTransactionDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {transactionType === 'withdraw' ? 'Withdraw from' : 'Add Funds to'} {selectedEnvelope?.name}
            </DialogTitle>
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
              <Label htmlFor="txDescription">Description (Optional)</Label>
              <Input
                id="txDescription"
                value={transactionForm.description}
                onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                placeholder={transactionType === 'withdraw' ? 'Withdrawal reason' : 'Deposit note'}
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
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
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
            <TableCell className="text-sm">{transaction.description}</TableCell>
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
