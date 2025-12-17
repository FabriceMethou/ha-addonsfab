// Budgets Page
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Label,
  Badge,
  Spinner,
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
} from '../components/shadcn';
import { budgetsAPI, categoriesAPI } from '../services/api';
import { format } from 'date-fns';

export default function BudgetsPage() {
  const [openDialog, setOpenDialog] = useState(false);
  const [editingBudget, setEditingBudget] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [currentYear] = useState(new Date().getFullYear());
  const [currentMonth] = useState(new Date().getMonth() + 1);
  const [formData, setFormData] = useState({
    type_id: '',
    amount: '',
    period: 'monthly',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: '',
    is_active: true,
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
  });

  // Fetch budget vs actual for current month
  const { data: vsActualData } = useQuery({
    queryKey: ['budget-vs-actual', currentYear, currentMonth],
    queryFn: async () => {
      const response = await budgetsAPI.getVsActual(currentYear, currentMonth);
      return response.data.categories;
    },
  });

  // Create budget mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => budgetsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['budget-vs-actual'] });
      setOpenDialog(false);
      resetForm();
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
    },
  });

  // Delete budget mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => budgetsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['budget-vs-actual'] });
      setDeleteConfirm(null);
    },
  });

  const resetForm = () => {
    setFormData({
      type_id: '',
      amount: '',
      period: 'monthly',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: '',
      is_active: true,
    });
  };

  const handleEdit = (budget: any) => {
    setEditingBudget(budget);
    setFormData({
      type_id: budget.type_id.toString(),
      amount: budget.amount.toString(),
      period: budget.period || 'monthly',
      start_date: budget.start_date || format(new Date(), 'yyyy-MM-dd'),
      end_date: budget.end_date || '',
      is_active: budget.is_active !== false,
    });
    setOpenDialog(true);
  };

  const handleSubmit = () => {
    const data = {
      type_id: parseInt(formData.type_id),
      amount: parseFloat(formData.amount),
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const calculateProgress = (spent: number, budget: number) => {
    if (budget === 0) return 0;
    return Math.min((spent / budget) * 100, 100);
  };

  const getProgressVariant = (spent: number, budget: number): 'success' | 'warning' | 'destructive' => {
    const percentage = (spent / budget) * 100;
    if (percentage >= 100) return 'destructive';
    if (percentage >= 80) return 'warning';
    return 'success';
  };

  if (budgetsLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-foreground">Budgets</h1>
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
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Budget vs Actual - {format(new Date(currentYear, currentMonth - 1), 'MMMM yyyy')}
          </h2>
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
                        : `${formatCurrency(Math.abs(remaining))} over`}
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
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">All Budgets</h2>
        {budgetsData && budgetsData.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
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
                    <TableCell>{formatCurrency(budget.amount)}</TableCell>
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

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formData.type_id} onValueChange={(value) => setFormData({ ...formData, type_id: value })}>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Budget Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Period</Label>
                <Select value={formData.period} onValueChange={(value) => setFormData({ ...formData, period: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date (Optional)</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
                <p className="text-xs text-foreground-muted">Leave empty for ongoing budget</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.is_active ? 'true' : 'false'}
                onValueChange={(value) => setFormData({ ...formData, is_active: value === 'true' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpenDialog(false);
                setEditingBudget(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingBudget
                ? updateMutation.isPending
                  ? 'Updating...'
                  : 'Update Budget'
                : createMutation.isPending
                  ? 'Adding...'
                  : 'Add Budget'}
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
                  <strong>Amount:</strong> {formatCurrency(deleteConfirm.amount)}
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
