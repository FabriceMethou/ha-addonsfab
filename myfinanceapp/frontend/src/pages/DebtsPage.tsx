// Debts Page - Debt Tracking and Payment History
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Plus,
  Pencil,
  Trash2,
  CreditCard,
  Wallet,
  AlertTriangle,
  ExternalLink,
  DollarSign,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
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
  DebtsSkeleton,
} from '../components/shadcn';
import { debtsAPI, accountsAPI, currenciesAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { useToast } from '../contexts/ToastContext';
import { debtSchema, paymentSchema, DebtFormData, PaymentFormData } from '../lib/validations';
import { formatCurrency as formatCurrencyUtil } from '../lib/utils';

// KPI Card Component
interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconColor: string;
  loading?: boolean;
}

function KPICard({ title, value, subtitle, icon, iconColor, loading }: KPICardProps) {
  return (
    <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
      {/* Background gradient effect */}
      <div className={`absolute top-0 right-0 w-32 h-32 ${iconColor} opacity-5 blur-3xl rounded-full`} />

      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-lg ${iconColor} bg-opacity-10`}>
            {icon}
          </div>
        </div>

        <div>
          <p className="text-sm text-foreground-muted mb-1">{title}</p>
          {loading ? (
            <div className="h-8 flex items-center">
              <Spinner className="w-5 h-5" />
            </div>
          ) : (
            <>
              <p className="text-2xl font-bold text-foreground">{value}</p>
              {subtitle && (
                <p className="text-xs text-foreground-muted mt-1">{subtitle}</p>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

// Helper function to safely format dates
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'Invalid Date';
  try {
    const date = parseISO(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return format(date, 'MMM dd, yyyy');
  } catch {
    return 'Invalid Date';
  }
};

export default function DebtsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [debtDialog, setDebtDialog] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [scheduleDialog, setScheduleDialog] = useState(false);
  const [editingDebt, setEditingDebt] = useState<any>(null);
  const [selectedDebt, setSelectedDebt] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [showInactive, setShowInactive] = useState(false);

  const defaultDebtValues: DebtFormData = {
    creditor: '',
    original_amount: '',
    current_balance: '',
    interest_rate: '',
    interest_type: 'simple',
    minimum_payment: '',
    payment_day: '1',
    due_date: format(new Date(), 'yyyy-MM-dd'),
    status: 'active',
    notes: '',
    account_id: '',
    currency: 'EUR',
  };

  const {
    control: debtControl,
    register: debtRegister,
    handleSubmit: handleDebtSubmit,
    formState: { errors: debtErrors, isValid: isDebtValid },
    reset: resetDebtForm,
    watch: watchDebt,
  } = useForm<DebtFormData>({
    resolver: zodResolver(debtSchema),
    mode: 'onChange',
    defaultValues: defaultDebtValues,
  });

  const watchDebtInterestType = watchDebt('interest_type');

  const defaultPaymentValues: PaymentFormData = {
    amount: '',
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_type: 'monthly',
    notes: '',
  };

  const {
    control: paymentControl,
    register: paymentRegister,
    handleSubmit: handlePaymentSubmit,
    formState: { errors: paymentErrors, isValid: isPaymentValid },
    reset: resetPaymentForm,
    watch: watchPayment,
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    mode: 'onChange',
    defaultValues: defaultPaymentValues,
  });

  const watchPaymentType = watchPayment('payment_type');

  const queryClient = useQueryClient();

  // Fetch debts
  const { data: debtsData, isLoading: debtsLoading } = useQuery({
    queryKey: ['debts', showInactive],
    queryFn: async () => {
      const response = await debtsAPI.getAll(showInactive);
      return response.data.debts;
    },
  });

  // Fetch summary
  const { data: summaryData } = useQuery({
    queryKey: ['debts-summary'],
    queryFn: async () => {
      const response = await debtsAPI.getSummary();
      return response.data;
    },
  });

  // Fetch accounts for linking
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await accountsAPI.getAll();
      return response.data.accounts;
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

  // Create debt mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => debtsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debts-summary'] });
      setDebtDialog(false);
      resetDebtForm(defaultDebtValues);
      toast.success('Debt created successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to create debt:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to create debt: ${errorMessage}`);
    },
  });

  // Update debt mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => debtsAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debts-summary'] });
      setDebtDialog(false);
      resetDebtForm(defaultDebtValues);
      setEditingDebt(null);
      toast.success('Debt updated successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to update debt:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to update debt: ${errorMessage}`);
    },
  });

  // Delete debt mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => debtsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debts-summary'] });
      setDeleteConfirm(null);
      toast.success('Debt deleted successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to delete debt:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to delete debt: ${errorMessage}`);
    },
  });

  // Add payment mutation
  const addPaymentMutation = useMutation({
    mutationFn: (data: any) => debtsAPI.addPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debts-summary'] });
      queryClient.invalidateQueries({ queryKey: ['debt-payments', selectedDebt?.id] });
      setPaymentDialog(false);
      resetPaymentForm(defaultPaymentValues);
      toast.success('Payment added successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to add payment:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to add payment: ${errorMessage}`);
    },
  });


  const handleEdit = (debt: any) => {
    setEditingDebt(debt);
    resetDebtForm({
      creditor: debt.creditor,
      original_amount: debt.original_amount.toString(),
      current_balance: debt.current_balance.toString(),
      interest_rate: debt.interest_rate?.toString() || '0',
      interest_type: debt.interest_type || 'simple',
      minimum_payment: debt.minimum_payment?.toString() || '0',
      payment_day: debt.payment_day?.toString() || '1',
      due_date: debt.due_date || format(new Date(), 'yyyy-MM-dd'),
      status: debt.status,
      notes: debt.notes || '',
      account_id: debt.account_id?.toString() || '',
      currency: debt.currency || 'EUR',
    });
    setDebtDialog(true);
  };

  const onSubmitDebt = (formData: DebtFormData) => {
    const data: any = {};

    // Always include creditor
    if (formData.creditor) {
      data.creditor = formData.creditor;
    }

    // Only include original_amount when creating a new debt
    if (!editingDebt && formData.original_amount) {
      data.original_amount = parseFloat(formData.original_amount);
    }

    // Include current_balance if provided
    if (formData.current_balance) {
      const balance = parseFloat(formData.current_balance);
      if (!isNaN(balance)) {
        data.current_balance = balance;
      }
    }

    // Include interest_rate if provided
    if (formData.interest_rate) {
      const rate = parseFloat(formData.interest_rate);
      if (!isNaN(rate)) {
        data.interest_rate = rate;
      }
    }

    // Include interest_type
    if (formData.interest_type) {
      data.interest_type = formData.interest_type;
    }

    // Include minimum_payment if provided
    if (formData.minimum_payment) {
      const payment = parseFloat(formData.minimum_payment);
      if (!isNaN(payment)) {
        data.minimum_payment = payment;
      }
    }

    // Include payment_day if provided
    if (formData.payment_day) {
      const day = parseInt(formData.payment_day);
      if (!isNaN(day)) {
        data.payment_day = day;
      }
    }

    // Include due_date if provided
    if (formData.due_date) {
      data.due_date = formData.due_date;
    }

    // Include status
    if (formData.status) {
      data.status = formData.status;
    }

    // Include notes (can be empty string)
    data.notes = formData.notes || '';

    // Include linked_account_id if provided
    if (formData.account_id) {
      const accountId = parseInt(formData.account_id);
      if (!isNaN(accountId)) {
        data.linked_account_id = accountId;
      }
    }

    // Include currency
    if (formData.currency) {
      data.currency = formData.currency;
    }

    if (editingDebt) {
      updateMutation.mutate({ id: editingDebt.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const onSubmitPayment = (formData: PaymentFormData) => {
    if (selectedDebt) {
      const data = {
        debt_id: selectedDebt.id,
        amount: parseFloat(formData.amount),
        payment_date: formData.payment_date,
        payment_type: formData.payment_type,
        notes: formData.notes,
      };
      addPaymentMutation.mutate(data);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'EUR') => {
    return formatCurrencyUtil(amount, currency);
  };

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'error' | 'default' => {
    switch (status) {
      case 'paid_off':
        return 'success';
      case 'active':
        return 'warning';
      case 'defaulted':
        return 'error';
      default:
        return 'default';
    }
  };

  if (debtsLoading) {
    return <DebtsSkeleton />;
  }

  // Calculate statistics
  const totalDebt = summaryData?.total_debt || 0;
  const totalOriginal = summaryData?.total_original_amount || 0;
  const totalPaid = totalOriginal - totalDebt;
  const payoffProgress = totalOriginal > 0 ? (totalPaid / totalOriginal) * 100 : 0;

  // Calculate payoff timeline
  const calculatePayoffTimeline = (debt: any) => {
    // Use minimum_payment (API returns it as this, not monthly_payment)
    const monthlyPayment = debt.minimum_payment || 0;

    if (!monthlyPayment || monthlyPayment <= 0 || debt.current_balance <= 0) {
      return { months: null, payoffDate: null, totalInterest: 0 };
    }

    const monthlyRate = (debt.interest_rate || 0) / 100 / 12;
    let balance = debt.current_balance;
    let months = 0;
    let totalInterest = 0;
    const maxMonths = 600;

    while (balance > 0 && months < maxMonths) {
      const interestPayment = balance * monthlyRate;
      const principalPayment = Math.min(monthlyPayment - interestPayment, balance);

      if (principalPayment <= 0) {
        return { months: null, payoffDate: null, totalInterest: 0 };
      }

      totalInterest += interestPayment;
      balance -= principalPayment;
      months++;
    }

    if (balance > 0) {
      return { months: null, payoffDate: null, totalInterest: 0 };
    }

    const payoffDate = new Date();
    payoffDate.setMonth(payoffDate.getMonth() + months);

    return { months, payoffDate, totalInterest };
  };

  // Separate active and inactive debts
  const activeDebts = debtsData?.filter((d: any) => d.is_active === 1) || [];
  const inactiveDebts = debtsData?.filter((d: any) => d.is_active === 0) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Debt Management</h1>
        <p className="text-foreground-muted">
          {activeDebts.length} active debt{activeDebts.length !== 1 ? 's' : ''} • Track payments and payoff progress
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        <KPICard
          title="Total Debt"
          value={formatCurrency(totalDebt)}
          subtitle="Current balance"
          icon={<CreditCard size={24} className="text-rose-500" />}
          iconColor="bg-rose-500"
          loading={debtsLoading}
        />
        <KPICard
          title="Total Paid"
          value={formatCurrency(totalPaid)}
          subtitle="Principal paid off"
          icon={<DollarSign size={24} className="text-emerald-500" />}
          iconColor="bg-emerald-500"
          loading={debtsLoading}
        />
        <KPICard
          title="Payoff Progress"
          value={`${payoffProgress.toFixed(1)}%`}
          subtitle="Overall completion"
          icon={<TrendingUp size={24} className="text-cyan-500" />}
          iconColor="bg-cyan-500"
          loading={debtsLoading}
        />
        <KPICard
          title="Active Debts"
          value={activeDebts.length.toString()}
          subtitle="Requiring payments"
          icon={<AlertTriangle size={24} className="text-amber-500" />}
          iconColor="bg-amber-500"
          loading={debtsLoading}
        />
      </div>

      {/* Action Bar */}
      <div className="flex justify-end items-center gap-3">
        <Button
          variant={showInactive ? 'outline' : 'ghost'}
          size="sm"
          onClick={() => setShowInactive(!showInactive)}
        >
          {showInactive ? 'Hide' : 'Show'} Closed Debts ({inactiveDebts.length})
        </Button>
        <Button
          onClick={() => {
            setEditingDebt(null);
            resetDebtForm(defaultDebtValues);
            setDebtDialog(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Debt
        </Button>
      </div>

      {/* Overall Progress */}
      {totalOriginal > 0 && (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold text-foreground">Overall Payoff Progress</h2>
            <span className="text-lg font-bold text-primary">{payoffProgress.toFixed(1)}%</span>
          </div>
          <Progress value={Math.min(payoffProgress, 100)} className="h-3" />
          <div className="flex justify-between mt-2">
            <span className="text-xs text-foreground-muted">Paid: {formatCurrency(totalPaid)}</span>
            <span className="text-xs text-foreground-muted">Remaining: {formatCurrency(totalDebt)}</span>
          </div>
        </Card>
      )}

      {/* Active Debts List */}
      {activeDebts && activeDebts.length > 0 ? (
        <>
          <h2 className="text-lg font-semibold text-foreground">Active Debts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {activeDebts.map((debt: any) => {
              const progress = debt.original_amount > 0
                ? ((debt.original_amount - debt.current_balance) / debt.original_amount) * 100
                : 0;

              return (
                <Card key={debt.id} className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-foreground">{debt.creditor}</h3>
                      {debt.notes && (
                        <p className="text-sm text-foreground-muted mt-1">{debt.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusBadgeVariant(debt.status)} size="sm">
                        {debt.status.replace('_', ' ')}
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(debt)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirm(debt)}
                        className="text-error hover:text-error"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <span className="text-xs text-foreground-muted">Current Balance</span>
                      <p className="text-lg font-bold text-error">{formatCurrency(debt.current_balance, debt.currency)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-foreground-muted">Original Amount</span>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(debt.original_amount, debt.currency)}</p>
                    </div>
                  </div>

                  {/* Linked Account */}
                  {debt.account_id && (() => {
                    const linkedAccount = accountsData?.find((a: any) => a.id === debt.account_id);
                    if (linkedAccount) {
                      return (
                        <div className="mb-4 p-2 rounded-lg bg-surface flex items-center justify-between">
                          <span className="text-xs text-foreground-muted">Linked Account:</span>
                          <button
                            onClick={() => navigate('/accounts')}
                            className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                          >
                            {linkedAccount.bank_name} - {linkedAccount.account_type}
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div className="mb-4">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-foreground-muted">Progress</span>
                      <span className="text-xs font-semibold">{progress.toFixed(1)}%</span>
                    </div>
                    <Progress
                      value={Math.min(progress, 100)}
                      variant={progress >= 75 ? 'success' : progress >= 50 ? 'info' : 'warning'}
                      className="h-2"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {debt.interest_rate > 0 && (
                      <div>
                        <span className="text-xs text-foreground-muted">Interest Rate</span>
                        <p className="text-sm font-semibold">{debt.interest_rate}%</p>
                      </div>
                    )}
                    {debt.minimum_payment > 0 && (
                      <div>
                        <span className="text-xs text-foreground-muted">Min. Payment</span>
                        <p className="text-sm font-semibold">{formatCurrency(debt.minimum_payment, debt.currency)}</p>
                      </div>
                    )}
                    {debt.due_date && (
                      <div>
                        <span className="text-xs text-foreground-muted">Due Date</span>
                        <p className="text-sm font-semibold">{format(parseISO(debt.due_date), 'MMM dd, yyyy')}</p>
                      </div>
                    )}
                  </div>

                  {/* Payoff Timeline */}
                  {(() => {
                    const timeline = calculatePayoffTimeline(debt);
                    if (timeline.months && timeline.payoffDate) {
                      const years = Math.floor(timeline.months / 12);
                      const remainingMonths = timeline.months % 12;
                      const timeDisplay = years > 0
                        ? `${years}y ${remainingMonths}m`
                        : `${remainingMonths} months`;

                      return (
                        <div className="mb-4 p-3 rounded-lg bg-surface border-l-4 border-info">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-xs text-foreground-muted">Payments Left</span>
                              <p className="text-lg font-bold text-info">
                                {timeline.months} {timeline.months === 1 ? 'payment' : 'payments'}
                              </p>
                              <p className="text-xs text-foreground-muted mt-0.5">({timeDisplay})</p>
                            </div>
                            <div>
                              <span className="text-xs text-foreground-muted">Final Payment</span>
                              <p className="text-lg font-bold text-success">
                                {format(timeline.payoffDate, 'MMM dd, yyyy')}
                              </p>
                              <p className="text-xs text-foreground-muted mt-0.5">
                                {format(timeline.payoffDate, 'EEEE')}
                              </p>
                            </div>
                            {timeline.totalInterest > 0 && (
                              <div className="col-span-2 pt-2 border-t border-border">
                                <span className="text-xs text-foreground-muted">
                                  Total Interest to Pay:
                                </span>
                                <span className="text-xs font-semibold text-warning ml-2">
                                  {formatCurrency(timeline.totalInterest, debt.currency)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedDebt(debt);
                        setScheduleDialog(true);
                      }}
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      View Schedule
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedDebt(debt);
                        resetPaymentForm(defaultPaymentValues);
                        setPaymentDialog(true);
                      }}
                      disabled={debt.status === 'paid_off'}
                    >
                      <Wallet className="h-4 w-4 mr-2" />
                      Add Payment
                    </Button>
                  </div>

                  {/* Payment History Accordion */}
                  <Accordion className="mt-4">
                    <AccordionItem className="border-0 bg-transparent">
                      <AccordionTrigger className="px-0 py-2 hover:bg-transparent">
                        <span className="text-sm text-foreground-muted">Payment History</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-0">
                        <DebtPayments debtId={debt.id} currency={debt.currency} />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        !showInactive && (
          <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <div className="flex flex-col items-center justify-center min-h-[300px]">
              <CreditCard className="h-20 w-20 text-foreground-muted mb-4 opacity-50" />
              <h2 className="text-xl font-semibold text-foreground-muted mb-2">No Active Debts</h2>
              <p className="text-sm text-foreground-muted mb-6">
                Add your first debt to start tracking payments
              </p>
              <Button
                onClick={() => {
                  setEditingDebt(null);
                  resetDebtForm();
                  setDebtDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Debt
              </Button>
            </div>
          </Card>
        )
      )}

      {/* Inactive/Closed Debts List */}
      {showInactive && inactiveDebts && inactiveDebts.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-foreground mt-8">Closed/Paid Off Debts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {inactiveDebts.map((debt: any) => {
              const progress = debt.original_amount > 0
                ? ((debt.original_amount - debt.current_balance) / debt.original_amount) * 100
                : 0;

              return (
                <Card key={debt.id} className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm opacity-70">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-foreground">{debt.creditor}</h3>
                      {debt.notes && (
                        <p className="text-sm text-foreground-muted mt-1">{debt.notes}</p>
                      )}
                    </div>
                    <Badge variant={debt.current_balance <= 0 ? 'success' : 'outline'} size="sm">
                      {debt.current_balance <= 0 ? 'PAID OFF' : 'INACTIVE'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <span className="text-xs text-foreground-muted">Final Balance</span>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(debt.current_balance, debt.currency)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-foreground-muted">Original Amount</span>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(debt.original_amount, debt.currency)}</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-foreground-muted">Progress</span>
                      <span className="text-xs font-semibold">{progress.toFixed(1)}%</span>
                    </div>
                    <Progress value={Math.min(progress, 100)} variant="success" className="h-2" />
                  </div>

                  {/* Payment History Accordion */}
                  <Accordion className="mt-4">
                    <AccordionItem className="border-0 bg-transparent">
                      <AccordionTrigger className="px-0 py-2 hover:bg-transparent">
                        <span className="text-sm text-foreground-muted">Payment History</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-0">
                        <DebtPayments debtId={debt.id} currency={debt.currency} />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Add/Edit Debt Dialog */}
      <Dialog open={debtDialog} onOpenChange={setDebtDialog}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editingDebt ? 'Edit Debt' : 'Add Debt'}</DialogTitle>
            <DialogDescription>
              {editingDebt ? 'Update debt details below.' : 'Enter the details for your new debt.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleDebtSubmit(onSubmitDebt)}>
            <div className="space-y-4 py-4">
              <FormField label="Debt Name" error={debtErrors.creditor?.message} required>
                <Input
                  {...debtRegister('creditor')}
                  placeholder="e.g., Credit Card, Car Loan, Mortgage"
                />
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Original Amount" error={debtErrors.original_amount?.message} required={!editingDebt}>
                  <Input
                    {...debtRegister('original_amount')}
                    type="number"
                    step="0.01"
                    disabled={!!editingDebt}
                  />
                  {editingDebt && (
                    <p className="text-xs text-foreground-muted mt-1">
                      Original amount cannot be modified
                    </p>
                  )}
                </FormField>
                <FormField label="Current Balance (Optional)" error={debtErrors.current_balance?.message}>
                  <Input
                    {...debtRegister('current_balance')}
                    type="number"
                    step="0.01"
                  />
                  <p className="text-xs text-foreground-muted mt-1">
                    Leave empty to default to original amount.
                  </p>
                </FormField>
              </div>

              <FormField label="Currency" error={debtErrors.currency?.message} required>
                <Controller
                  name="currency"
                  control={debtControl}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {currenciesData?.map((currency: any) => (
                          <SelectItem key={currency.code} value={currency.code}>
                            {currency.code} - {currency.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>

              <FormField label="Link to Account (Optional)" error={debtErrors.account_id?.message}>
                <Controller
                  name="account_id"
                  control={debtControl}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an account" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {accountsData?.map((account: any) => (
                          <SelectItem key={account.id} value={account.id.toString()}>
                            {account.name} - {account.bank_name} ({account.currency})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-foreground-muted mt-1">
                  Link this debt to an account for tracking purposes.
                </p>
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Interest Rate (%)" error={debtErrors.interest_rate?.message}>
                  <Input
                    {...debtRegister('interest_rate')}
                    type="number"
                    step="0.01"
                  />
                </FormField>
                <FormField label="Interest Type" error={debtErrors.interest_type?.message}>
                  <Controller
                    name="interest_type"
                    control={debtControl}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="simple">Simple Interest</SelectItem>
                          <SelectItem value="compound">Compound Interest</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <p className="text-xs text-foreground-muted mt-1">
                    {watchDebtInterestType === 'simple'
                      ? 'Interest on principal only'
                      : 'Interest on principal + accumulated interest'}
                  </p>
                </FormField>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Monthly Payment" error={debtErrors.minimum_payment?.message}>
                  <Input
                    {...debtRegister('minimum_payment')}
                    type="number"
                    step="0.01"
                  />
                </FormField>
                <FormField label="Payment Due Day of Month" error={debtErrors.payment_day?.message}>
                  <Input
                    {...debtRegister('payment_day')}
                    type="number"
                    min={1}
                    max={28}
                  />
                  <p className="text-xs text-foreground-muted mt-1">Day of month (1-28)</p>
                </FormField>
              </div>

              <FormField label="Start Date" error={debtErrors.due_date?.message} required>
                <Input
                  {...debtRegister('due_date')}
                  type="date"
                />
                <p className="text-xs text-foreground-muted mt-1">
                  Date when debt starts or first payment is due
                </p>
              </FormField>

              <FormField label="Notes (Optional)" error={debtErrors.notes?.message}>
                <Textarea
                  {...debtRegister('notes')}
                  rows={2}
                />
              </FormField>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setDebtDialog(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={createMutation.isPending || updateMutation.isPending}
                disabled={!isDebtValid}
              >
                {editingDebt ? 'Update' : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Add Payment to {selectedDebt?.creditor}</DialogTitle>
            <DialogDescription>
              Record a payment toward this debt to update the balance.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePaymentSubmit(onSubmitPayment)}>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Payment Amount" error={paymentErrors.amount?.message} required>
                  <Input
                    {...paymentRegister('amount')}
                    type="number"
                    step="0.01"
                  />
                </FormField>
                <FormField label="Payment Date" error={paymentErrors.payment_date?.message} required>
                  <Input
                    {...paymentRegister('payment_date')}
                    type="date"
                  />
                </FormField>
              </div>

              <FormField label="Payment Type" error={paymentErrors.payment_type?.message}>
                <Controller
                  name="payment_type"
                  control={paymentControl}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly Payment</SelectItem>
                        <SelectItem value="extra">Extra Payment</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-foreground-muted mt-1">
                  {watchPaymentType === 'monthly'
                    ? 'Regular monthly payment (includes interest + principal)'
                    : 'Extra payment (goes entirely to principal, reduces interest)'}
                </p>
              </FormField>

              <FormField label="Notes (Optional)" error={paymentErrors.notes?.message}>
                <Input
                  {...paymentRegister('notes')}
                />
              </FormField>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setPaymentDialog(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={addPaymentMutation.isPending}
                disabled={!isPaymentValid}
              >
                Add Payment
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
              Confirm deletion of this debt and all associated payment history.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 text-warning border border-warning/20">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">
                Are you sure you want to delete the debt "{deleteConfirm?.creditor}"? This will also
                delete all payment history for this debt.
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
              loading={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Amortization Schedule Dialog */}
      <Dialog open={scheduleDialog} onOpenChange={setScheduleDialog}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Amortization Schedule - {selectedDebt?.creditor}</DialogTitle>
            <DialogDescription>
              Month-by-month breakdown of payments, interest, and principal.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <AmortizationSchedule debtId={selectedDebt?.id} currency={selectedDebt?.currency} />
          </div>

          <DialogFooter>
            <Button onClick={() => setScheduleDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Debt Payments Component
function DebtPayments({ debtId, currency = 'EUR' }: { debtId: number; currency?: string }) {
  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ['debt-payments', debtId],
    queryFn: async () => {
      const response = await debtsAPI.getPayments(debtId);
      return response.data.payments;
    },
  });

  const formatCurrency = (amount: number) => {
    return formatCurrencyUtil(amount, currency);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Spinner size="sm" />
      </div>
    );
  }

  if (!paymentsData || paymentsData.length === 0) {
    return (
      <p className="text-sm text-foreground-muted text-center py-4">No payments yet</p>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paymentsData.map((payment: any) => (
            <TableRow key={payment.id}>
              <TableCell className="text-sm">{formatDate(payment.payment_date)}</TableCell>
              <TableCell className="font-semibold text-success">
                {formatCurrency(payment.amount)}
              </TableCell>
              <TableCell className="text-sm">{payment.notes || '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Amortization Schedule Component
function AmortizationSchedule({ debtId, currency = 'EUR' }: { debtId: number | undefined; currency?: string }) {
  const { data: scheduleData, isLoading, error } = useQuery({
    queryKey: ['debt-schedule', debtId],
    queryFn: async () => {
      if (!debtId) return null;
      const response = await debtsAPI.getSchedule(debtId);
      return response.data.schedule;
    },
    enabled: !!debtId,
  });

  const formatCurrency = (amount: number) => {
    return formatCurrencyUtil(amount, currency);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-error/10 text-error border border-error/20">
        <p className="text-sm">Failed to load amortization schedule. Please try again.</p>
      </div>
    );
  }

  if (!scheduleData || scheduleData.length === 0) {
    return (
      <p className="text-sm text-foreground-muted text-center py-8">No payment schedule available</p>
    );
  }

  // Calculate totals
  const totalPayment = scheduleData.reduce((sum: number, item: any) => sum + item.payment, 0);
  const totalPrincipal = scheduleData.reduce((sum: number, item: any) => sum + item.principal, 0);
  const totalInterest = scheduleData.reduce((sum: number, item: any) => sum + item.interest, 0);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 rounded-lg border border-border bg-card/50">
          <span className="text-xs text-foreground-muted">Total Payments</span>
          <p className="text-lg font-bold text-foreground mt-1">{formatCurrency(totalPayment)}</p>
        </Card>
        <Card className="p-4 rounded-lg border border-border bg-card/50">
          <span className="text-xs text-foreground-muted">Total Principal</span>
          <p className="text-lg font-bold text-success mt-1">{formatCurrency(totalPrincipal)}</p>
        </Card>
        <Card className="p-4 rounded-lg border border-border bg-card/50">
          <span className="text-xs text-foreground-muted">Total Interest</span>
          <p className="text-lg font-bold text-warning mt-1">{formatCurrency(totalInterest)}</p>
        </Card>
      </div>

      {/* Schedule Table */}
      <div className="rounded-lg border border-border overflow-hidden max-h-[500px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-surface z-10">
            <TableRow>
              <TableHead className="text-center">#</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Payment</TableHead>
              <TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">Interest</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scheduleData.map((item: any) => (
              <TableRow key={item.payment_number}>
                <TableCell className="text-center text-sm text-foreground-muted">
                  {item.payment_number}
                </TableCell>
                <TableCell className="text-sm">{formatDate(item.date)}</TableCell>
                <TableCell className="text-right font-semibold">
                  {formatCurrency(item.payment)}
                </TableCell>
                <TableCell className="text-right text-success">
                  {formatCurrency(item.principal)}
                </TableCell>
                <TableCell className="text-right text-warning">
                  {formatCurrency(item.interest)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatCurrency(item.balance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
