// Budgets Page
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '../contexts/ToastContext';
import { budgetSchema, type BudgetFormData } from '../lib/validations';
import {
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  Wallet,
  CheckCircle2,
  DollarSign,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Badge,
  Progress,
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
  FormField,
  BudgetsSkeleton,
} from '../components/shadcn';
import { budgetsAPI, categoriesAPI, currenciesAPI } from '../services/api';
import { format } from 'date-fns';
import { formatCurrency as formatCurrencyUtil } from '../lib/utils';
import { sumMoney, absMoney } from '../lib/money';
import { useIsMobile } from '../hooks/useBreakpoint';

export default function BudgetsPage() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [openDialog, setOpenDialog] = useState(false);
  const [editingBudget, setEditingBudget] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [expandedBudget, setExpandedBudget] = useState<number | null>(null);
  const [currentYear] = useState(new Date().getFullYear());
  const [currentMonth] = useState(new Date().getMonth() + 1);

  // Budget form with validation
  const {
    control,
    register,
    handleSubmit: handleFormSubmit,
    formState: { errors, isValid },
    reset: resetForm,
    trigger,
  } = useForm<BudgetFormData>({
    resolver: zodResolver(budgetSchema),
    mode: 'onChange',
    defaultValues: {
      type_id: '',
      amount: '',
      currency: 'EUR',
      period: 'monthly',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: '',
      is_active: true,
    },
  });

  const queryClient = useQueryClient();

  // Fetch budgets
  const { data: budgetsData, isLoading: budgetsLoading } = useQuery({
    queryKey: ['budgets'],
    queryFn: async () => {
      const response = await budgetsAPI.getAll(false);
      return response.data.budgets;
    },
  });

  // Fetch categories for dropdown
  const { data: categoriesData } = useQuery({
    queryKey: ['categories-hierarchy'],
    queryFn: async () => {
      const response = await categoriesAPI.getHierarchy();
      return response.data.categories;
    },
    staleTime: 30 * 60 * 1000,
  });

  // Fetch currencies for dropdown
  const { data: currenciesData } = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => {
      const response = await currenciesAPI.getAll();
      return response.data.currencies;
    },
    staleTime: 30 * 60 * 1000,
  });

  // Fetch budget vs actual for current month
  const { data: vsActualResponse } = useQuery({
    queryKey: ['budget-vs-actual', currentYear, currentMonth],
    queryFn: async () => {
      const response = await budgetsAPI.getVsActual(currentYear, currentMonth);
      return response.data;
    },
  });

  // Extract categories and display currency from response
  const vsActualData = vsActualResponse?.categories || [];
  const displayCurrency = vsActualResponse?.display_currency || 'EUR';

  // Create budget mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => budgetsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['budget-vs-actual'] });
      setOpenDialog(false);
      resetForm();
      toast.success('Budget created successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to create budget:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to create budget: ${errorMessage}`);
    },
  });

  // Update budget mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => budgetsAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['budget-vs-actual'] });
      setOpenDialog(false);
      setEditingBudget(null);
      resetForm();
      toast.success('Budget updated successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to update budget:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to update budget: ${errorMessage}`);
    },
  });

  // Delete budget mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => budgetsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['budget-vs-actual'] });
      setDeleteConfirm(null);
      toast.success('Budget deleted successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to delete budget:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to delete budget: ${errorMessage}`);
    },
  });

  const handleEdit = (budget: any) => {
    setEditingBudget(budget);
    resetForm({
      type_id: budget.type_id.toString(),
      amount: budget.amount.toString(),
      currency: budget.currency || 'EUR',
      period: budget.period || 'monthly',
      start_date: budget.start_date || format(new Date(), 'yyyy-MM-dd'),
      end_date: budget.end_date || '',
      is_active: budget.is_active !== false,
    });
    setOpenDialog(true);
    // Trigger validation after reset to enable the Update button
    setTimeout(() => trigger(), 0);
  };

  const onSubmit = (formData: BudgetFormData) => {
    const data = {
      type_id: parseInt(formData.type_id),
      amount: parseFloat(formData.amount),
      currency: formData.currency,
      period: formData.period,
      start_date: formData.start_date,
      end_date: formData.end_date || null,
      is_active: formData.is_active,
    };

    if (editingBudget) {
      updateMutation.mutate({ id: editingBudget.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const formatCurrency = (amount: number, currency?: string) => {
    return formatCurrencyUtil(amount, currency || displayCurrency);
  };

  const calculateProgress = (spent: number, budget: number) => {
    if (budget === 0) return 0;
    return Math.min((spent / budget) * 100, 100);
  };

  const getProgressVariant = (spent: number, budget: number): 'success' | 'warning' | 'error' => {
    const percentage = (spent / budget) * 100;
    if (percentage >= 100) return 'error';
    if (percentage >= 80) return 'warning';
    return 'success';
  };

  if (budgetsLoading) {
    return <BudgetsSkeleton />;
  }

  // Calculate KPI metrics using precise decimal arithmetic
  const totalBudgets = budgetsData?.length || 0;
  const activeBudgets = budgetsData?.filter((b: any) => b.is_active).length || 0;
  const monthlyActiveBudgets = (budgetsData || []).filter((b: any) => b.period === 'monthly' && b.is_active);
  const totalMonthlyBudget = sumMoney(monthlyActiveBudgets, (b: any) => b.amount);
  const budgetsOnTrack = vsActualData?.filter((item: any) => item.actual <= item.budget).length || 0;
  const totalTrackedBudgets = vsActualData?.length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Budgets</h1>
        <p className="text-foreground-muted">
          {totalBudgets} budget{totalBudgets !== 1 ? 's' : ''}, {activeBudgets} active • Track and manage your spending limits
        </p>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Total Budgets */}
        <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 opacity-5 blur-3xl rounded-full" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-blue-500 bg-opacity-10">
                <Target className="h-6 w-6 text-blue-500" />
              </div>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">Total Budgets</p>
              <p className="text-2xl font-bold text-foreground">{totalBudgets}</p>
            </div>
          </div>
        </Card>

        {/* Active Budgets */}
        <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 opacity-5 blur-3xl rounded-full" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-emerald-500 bg-opacity-10">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">Active Budgets</p>
              <p className="text-2xl font-bold text-foreground">{activeBudgets}</p>
            </div>
          </div>
        </Card>

        {/* Monthly Budget Total */}
        <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500 opacity-5 blur-3xl rounded-full" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-violet-500 bg-opacity-10">
                <DollarSign className="h-6 w-6 text-violet-500" />
              </div>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">Monthly Budget</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totalMonthlyBudget)}</p>
            </div>
          </div>
        </Card>

        {/* Budgets On Track */}
        <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500 opacity-5 blur-3xl rounded-full" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-cyan-500 bg-opacity-10">
                <Wallet className="h-6 w-6 text-cyan-500" />
              </div>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">On Track This Month</p>
              <p className="text-2xl font-bold text-foreground">
                {budgetsOnTrack}/{totalTrackedBudgets}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Action Bar */}
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditingBudget(null);
            resetForm();
            setOpenDialog(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Budget
        </Button>
      </div>

      {/* Current Month Budget vs Actual */}
      {vsActualData && vsActualData.length > 0 && (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              Budget vs Actual - {format(new Date(currentYear, currentMonth - 1), 'MMMM yyyy')}
            </h2>
            <Badge variant="outline" className="text-xs">
              Amounts in {displayCurrency}
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vsActualData.map((item: any) => {
              const progress = calculateProgress(item.actual, item.budget);
              const variant = getProgressVariant(item.actual, item.budget);
              const remaining = item.budget - item.actual;

              return (
                <Card key={item.type_id} className="p-4 border border-border">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium text-foreground">{item.type_name}</h3>
                    <Badge variant={remaining >= 0 ? 'success' : 'destructive'}>
                      {remaining >= 0 ? (
                        <TrendingUp className="h-3 w-3 mr-1" />
                      ) : (
                        <TrendingDown className="h-3 w-3 mr-1" />
                      )}
                      {remaining >= 0
                        ? `${formatCurrency(remaining)} left`
                        : `${formatCurrency(absMoney(remaining))} over`}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm text-foreground-muted mb-2">
                    <span>Spent: {formatCurrency(item.actual)}</span>
                    <span>Budget: {formatCurrency(item.budget)}</span>
                  </div>
                  <Progress value={progress} variant={variant} className="h-2" />
                  <p className="text-xs text-foreground-muted mt-1">{progress.toFixed(1)}% used</p>
                </Card>
              );
            })}
          </div>
        </Card>
      )}

      {/* All Budgets Table */}
      <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-foreground mb-4">All Budgets</h2>
        {budgetsData && budgetsData.length > 0 ? (
          isMobile ? (
            <div className="space-y-3">
              {budgetsData.map((budget: any) => {
                const isExpanded = expandedBudget === budget.id;
                return (
                  <Card
                    key={budget.id}
                    className={`rounded-xl overflow-hidden border border-border bg-card/50 backdrop-blur-sm transition-all ${
                      isExpanded ? 'ring-2 ring-primary/50' : ''
                    }`}
                  >
                    <div
                      className="p-4 cursor-pointer hover:bg-surface-hover transition-colors"
                      onClick={() => setExpandedBudget(isExpanded ? null : budget.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground truncate">
                            {budget.type_name || 'Unknown Category'}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={budget.period === 'monthly' ? 'default' : 'secondary'} className="text-xs">
                              {budget.period === 'monthly' ? 'Monthly' : 'Yearly'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {budget.currency || 'EUR'}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="font-bold text-foreground">
                              {formatCurrency(budget.amount, budget.currency)}
                            </div>
                          </div>
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
                            <div className="text-xs text-foreground-muted mb-1">Start Date</div>
                            <div className="text-sm text-foreground">
                              {budget.start_date ? format(new Date(budget.start_date), 'MMM dd, yyyy') : '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-foreground-muted mb-1">End Date</div>
                            <div className="text-sm text-foreground">
                              {budget.end_date ? format(new Date(budget.end_date), 'MMM dd, yyyy') : 'Ongoing'}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-foreground-muted mb-1">Status</div>
                            <div className="text-sm">
                              <Badge variant={budget.is_active ? 'success' : 'secondary'}>
                                {budget.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1 pt-2 border-t border-border">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(budget)} className="flex-1">
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirm(budget)}
                            className="flex-1 text-error hover:text-error"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
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
                    <TableHead>Category</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgetsData.map((budget: any) => (
                    <TableRow key={budget.id}>
                      <TableCell className="font-medium">{budget.type_name || 'Unknown Category'}</TableCell>
                      <TableCell>{formatCurrency(budget.amount, budget.currency)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{budget.currency || 'EUR'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={budget.period === 'monthly' ? 'default' : 'secondary'}>
                          {budget.period === 'monthly' ? 'Monthly' : 'Yearly'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {budget.start_date ? format(new Date(budget.start_date), 'MMM dd, yyyy') : '-'}
                      </TableCell>
                      <TableCell>
                        {budget.end_date ? format(new Date(budget.end_date), 'MMM dd, yyyy') : 'Ongoing'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={budget.is_active ? 'success' : 'secondary'}>
                          {budget.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(budget)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirm(budget)}
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
          <div className="flex flex-col items-center justify-center min-h-[200px]">
            <Target className="h-16 w-16 text-foreground-muted mb-4" />
            <p className="text-foreground-muted mb-4">No budgets found. Click "Add Budget" to create your first budget.</p>
            <Button
              onClick={() => {
                setEditingBudget(null);
                resetForm();
                setOpenDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Budget
            </Button>
          </div>
        )}
      </Card>

      {/* Add/Edit Budget Dialog */}
      <Dialog
        open={openDialog}
        onOpenChange={(open) => {
          setOpenDialog(open);
          if (!open) {
            setEditingBudget(null);
            resetForm();
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editingBudget ? 'Edit Budget' : 'Add Budget'}</DialogTitle>
            <DialogDescription>
              {editingBudget ? 'Update your budget details.' : 'Create a new budget to track your spending.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit(onSubmit)}>
            <div className="space-y-4 py-4">
              <FormField label="Category" error={errors.type_id?.message} required>
                <Controller
                  name="type_id"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoriesData
                          ?.filter((cat: any) => cat.category === 'expense')
                          ?.map((category: any) => (
                            <SelectItem key={category.id} value={category.id.toString()}>
                              {category.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="Budget Amount" error={errors.amount?.message} required>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('amount')}
                  />
                </FormField>
                <FormField label="Currency" error={errors.currency?.message} required>
                  <Controller
                    name="currency"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currenciesData?.map((currency: any) => (
                            <SelectItem key={currency.code} value={currency.code}>
                              {currency.code} ({currency.symbol})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
                <FormField label="Period" error={errors.period?.message} required>
                  <Controller
                    name="period"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Start Date" error={errors.start_date?.message} required>
                  <Input type="date" {...register('start_date')} />
                </FormField>
                <FormField label="End Date (Optional)" helperText="Leave empty for ongoing budget">
                  <Input type="date" {...register('end_date')} />
                </FormField>
              </div>

              <FormField label="Status">
                <Controller
                  name="is_active"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? 'true' : 'false'}
                      onValueChange={(value) => field.onChange(value === 'true')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Active</SelectItem>
                        <SelectItem value="false">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setOpenDialog(false);
                  setEditingBudget(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!isValid || createMutation.isPending || updateMutation.isPending}
              >
                {editingBudget
                  ? updateMutation.isPending
                    ? 'Updating...'
                    : 'Update Budget'
                  : createMutation.isPending
                    ? 'Adding...'
                    : 'Add Budget'}
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
              Confirm deletion of this budget.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 text-warning">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">Are you sure you want to delete this budget?</p>
            </div>
            {deleteConfirm && (
              <div className="p-4 rounded-lg bg-surface space-y-1">
                <p className="text-sm">
                  <strong>Category:</strong> {deleteConfirm.type_name}
                </p>
                <p className="text-sm">
                  <strong>Amount:</strong> {formatCurrency(deleteConfirm.amount, deleteConfirm.currency)}
                </p>
                <p className="text-sm">
                  <strong>Currency:</strong> {deleteConfirm.currency || 'EUR'}
                </p>
                <p className="text-sm">
                  <strong>Period:</strong> {deleteConfirm.period}
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
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
