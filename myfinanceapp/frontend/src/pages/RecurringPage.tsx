// Recurring Transactions Page - Manage recurring transaction templates
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Label,
  Badge,
  Spinner,
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '../components/shadcn';
import { recurringAPI, accountsAPI, categoriesAPI, transactionsAPI } from '../services/api';
import { format } from 'date-fns';

export default function RecurringPage() {
  const [currentTab, setCurrentTab] = useState<number | string>(0);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [selectedPending, setSelectedPending] = useState<number[]>([]);
  const [formData, setFormData] = useState({
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
  });

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
  });

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['categories-hierarchy'],
    queryFn: async () => {
      const response = await categoriesAPI.getHierarchy();
      return response.data.categories;
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => recurringAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      setOpenDialog(false);
      resetForm();
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
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => recurringAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      setDeleteConfirm(null);
    },
  });

  // Generate transactions mutation
  const generateMutation = useMutation({
    mutationFn: () => recurringAPI.generate(),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      queryClient.invalidateQueries({ queryKey: ['pending-transactions'] });
      alert(`Generated ${response.data.count} pending transactions`);
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
      setSelectedPending((prev) => prev.filter((selectedId) => selectedId !== id));
    },
  });

  // Reject pending transaction
  const rejectMutation = useMutation({
    mutationFn: (id: number) => transactionsAPI.reject(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['pending-transactions'] });
      setSelectedPending((prev) => prev.filter((selectedId) => selectedId !== id));
    },
  });

  // Batch approve selected
  const handleBatchApprove = async () => {
    for (const id of selectedPending) {
      await confirmMutation.mutateAsync(id);
    }
    setSelectedPending([]);
  };

  // Batch reject selected
  const handleBatchReject = async () => {
    for (const id of selectedPending) {
      await rejectMutation.mutateAsync(id);
    }
    setSelectedPending([]);
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

  const resetForm = () => {
    setFormData({
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
    });
  };

  const handleEdit = (template: any) => {
    setEditingTemplate(template);
    setFormData({
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
      is_active: template.is_active !== undefined ? template.is_active : true,
    });
    setOpenDialog(true);
  };

  const handleSubmit = () => {
    const data = {
      name: formData.name,
      account_id: parseInt(formData.account_id),
      amount: parseFloat(formData.amount),
      currency: formData.currency,
      description: formData.description,
      destinataire: formData.destinataire,
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
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(Math.abs(amount));
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
        <h1 className="text-2xl font-bold text-foreground">Recurring Transactions</h1>
        <div className="flex gap-2">
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
      </div>

      {/* Tabs */}
      <Card className="p-6">
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
                          <TableCell>{transaction.description}</TableCell>
                          <TableCell>{transaction.account_name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{transaction.type_name || 'Uncategorized'}</Badge>
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold ${
                              transaction.amount >= 0 ? 'text-success' : 'text-error'
                            }`}
                          >
                            {new Intl.NumberFormat('de-DE', {
                              style: 'currency',
                              currency: transaction.currency || 'EUR',
                            }).format(transaction.amount)}
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
        <DialogContent className="max-w-4xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Recurring Template' : 'Add Recurring Template'}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? 'Update the recurring transaction template.' : 'Create a new recurring transaction template.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[80vh] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Monthly Rent, Weekly Groceries"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
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
                <div className="space-y-2">
                  <Label>Subcategory</Label>
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={formData.recurrence_pattern}
                  onValueChange={(value) => setFormData({ ...formData, recurrence_pattern: value })}
                >
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="interval">Interval</Label>
                <Input
                  id="interval"
                  type="number"
                  value={formData.recurrence_interval}
                  onChange={(e) => setFormData({ ...formData, recurrence_interval: e.target.value })}
                />
                <p className="text-xs text-foreground-muted">Every X days/weeks/months/years</p>
              </div>
            </div>

            {formData.recurrence_pattern === 'monthly' && (
              <div className="space-y-2">
                <Label htmlFor="dayOfMonth">Day of Month (Optional)</Label>
                <Input
                  id="dayOfMonth"
                  type="number"
                  min={1}
                  max={31}
                  value={formData.day_of_month}
                  onChange={(e) => setFormData({ ...formData, day_of_month: e.target.value })}
                />
                <p className="text-xs text-foreground-muted">Specific day (1-31)</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <p className="text-xs text-foreground-muted">Leave empty for no end date</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="destinataire">Recipient/Description</Label>
              <Input
                id="destinataire"
                value={formData.destinataire}
                onChange={(e) => setFormData({ ...formData, destinataire: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 rounded border-border bg-surface text-primary focus:ring-primary"
              />
              <span className="text-sm">Active</span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingTemplate ? 'Update' : 'Create'}
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
