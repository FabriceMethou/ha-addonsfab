// Debts Page - Debt Tracking and Payment History
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
} from '../components/shadcn';
import { debtsAPI, accountsAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { useToast } from '../contexts/ToastContext';

interface DebtFormData {
  creditor: string;
  original_amount: string;
  current_balance: string;
  interest_rate: string;
  interest_type: string;
  minimum_payment: string;
  payment_day: string;
  due_date: string;
  status: string;
  notes: string;
  account_id: string;
}

interface PaymentFormData {
  amount: string;
  payment_date: string;
  payment_type: string;
  notes: string;
}

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
  const [editingDebt, setEditingDebt] = useState<any>(null);
  const [selectedDebt, setSelectedDebt] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [showInactive, setShowInactive] = useState(false);

  const [debtForm, setDebtForm] = useState<DebtFormData>({
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
  });

  const [paymentForm, setPaymentForm] = useState<PaymentFormData>({
    amount: '',
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_type: 'monthly',
    notes: '',
  });

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
  });

  // Create debt mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => debtsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debts-summary'] });
      setDebtDialog(false);
      resetDebtForm();
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
      resetDebtForm();
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
      resetPaymentForm();
      toast.success('Payment added successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to add payment:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to add payment: ${errorMessage}`);
    },
  });

  const resetDebtForm = () => {
    setDebtForm({
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
    });
  };

  const resetPaymentForm = () => {
    setPaymentForm({
      amount: '',
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      payment_type: 'monthly',
      notes: '',
    });
  };

  const handleEdit = (debt: any) => {
    setEditingDebt(debt);
    setDebtForm({
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
    });
    setDebtDialog(true);
  };

  const handleSubmitDebt = () => {
    const data: any = {};

    // Always include creditor
    if (debtForm.creditor) {
      data.creditor = debtForm.creditor;
    }

    // Only include original_amount when creating a new debt
    if (!editingDebt && debtForm.original_amount) {
      data.original_amount = parseFloat(debtForm.original_amount);
    }

    // Include current_balance if provided
    if (debtForm.current_balance) {
      const balance = parseFloat(debtForm.current_balance);
      if (!isNaN(balance)) {
        data.current_balance = balance;
      }
    }

    // Include interest_rate if provided
    if (debtForm.interest_rate) {
      const rate = parseFloat(debtForm.interest_rate);
      if (!isNaN(rate)) {
        data.interest_rate = rate;
      }
    }

    // Include interest_type
    if (debtForm.interest_type) {
      data.interest_type = debtForm.interest_type;
    }

    // Include minimum_payment if provided
    if (debtForm.minimum_payment) {
      const payment = parseFloat(debtForm.minimum_payment);
      if (!isNaN(payment)) {
        data.minimum_payment = payment;
      }
    }

    // Include payment_day if provided
    if (debtForm.payment_day) {
      const day = parseInt(debtForm.payment_day);
      if (!isNaN(day)) {
        data.payment_day = day;
      }
    }

    // Include due_date if provided
    if (debtForm.due_date) {
      data.due_date = debtForm.due_date;
    }

    // Include status
    if (debtForm.status) {
      data.status = debtForm.status;
    }

    // Include notes (can be empty string)
    data.notes = debtForm.notes || '';

    // Include linked_account_id if provided
    if (debtForm.account_id) {
      const accountId = parseInt(debtForm.account_id);
      if (!isNaN(accountId)) {
        data.linked_account_id = accountId;
      }
    }

    if (editingDebt) {
      updateMutation.mutate({ id: editingDebt.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleAddPayment = () => {
    if (selectedDebt) {
      const data = {
        debt_id: selectedDebt.id,
        amount: parseFloat(paymentForm.amount),
        payment_date: paymentForm.payment_date,
        payment_type: paymentForm.payment_type,
        notes: paymentForm.notes,
      };
      addPaymentMutation.mutate(data);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
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
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
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
            resetDebtForm();
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
                      <p className="text-lg font-bold text-error">{formatCurrency(debt.current_balance)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-foreground-muted">Original Amount</span>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(debt.original_amount)}</p>
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
                        <p className="text-sm font-semibold">{formatCurrency(debt.minimum_payment)}</p>
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
                                  {formatCurrency(timeline.totalInterest)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedDebt(debt);
                        resetPaymentForm();
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
                        <DebtPayments debtId={debt.id} />
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
                      <p className="text-lg font-bold text-foreground">{formatCurrency(debt.current_balance)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-foreground-muted">Original Amount</span>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(debt.original_amount)}</p>
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
                        <DebtPayments debtId={debt.id} />
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

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="creditor">Debt Name</Label>
              <Input
                id="creditor"
                value={debtForm.creditor}
                onChange={(e) => setDebtForm({ ...debtForm, creditor: e.target.value })}
                placeholder="e.g., Credit Card, Car Loan, Mortgage"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="original">Original Amount</Label>
                <Input
                  id="original"
                  type="number"
                  value={debtForm.original_amount}
                  onChange={(e) => setDebtForm({ ...debtForm, original_amount: e.target.value })}
                  disabled={!!editingDebt}
                />
                {editingDebt && (
                  <p className="text-xs text-foreground-muted">
                    Original amount cannot be modified
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="balance">Current Balance (Optional)</Label>
                <Input
                  id="balance"
                  type="number"
                  value={debtForm.current_balance}
                  onChange={(e) => setDebtForm({ ...debtForm, current_balance: e.target.value })}
                />
                <p className="text-xs text-foreground-muted">
                  Leave empty to default to original amount.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Link to Account (Optional)</Label>
              <Select
                value={debtForm.account_id}
                onValueChange={(value) => setDebtForm({ ...debtForm, account_id: value })}
              >
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
              <p className="text-xs text-foreground-muted">
                Link this debt to an account for tracking purposes.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rate">Interest Rate (%)</Label>
                <Input
                  id="rate"
                  type="number"
                  value={debtForm.interest_rate}
                  onChange={(e) => setDebtForm({ ...debtForm, interest_rate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Interest Type</Label>
                <Select
                  value={debtForm.interest_type}
                  onValueChange={(value) => setDebtForm({ ...debtForm, interest_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">Simple Interest</SelectItem>
                    <SelectItem value="compound">Compound Interest</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-foreground-muted">
                  {debtForm.interest_type === 'simple'
                    ? 'Interest on principal only'
                    : 'Interest on principal + accumulated interest'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="payment">Monthly Payment</Label>
                <Input
                  id="payment"
                  type="number"
                  value={debtForm.minimum_payment}
                  onChange={(e) => setDebtForm({ ...debtForm, minimum_payment: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentDay">Payment Due Day of Month</Label>
                <Input
                  id="paymentDay"
                  type="number"
                  min={1}
                  max={28}
                  value={debtForm.payment_day}
                  onChange={(e) => setDebtForm({ ...debtForm, payment_day: e.target.value })}
                />
                <p className="text-xs text-foreground-muted">Day of month (1-28)</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Start Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={debtForm.due_date}
                onChange={(e) => setDebtForm({ ...debtForm, due_date: e.target.value })}
              />
              <p className="text-xs text-foreground-muted">
                Date when debt starts or first payment is due
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={debtForm.notes}
                onChange={(e) => setDebtForm({ ...debtForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDebtDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitDebt}
              loading={createMutation.isPending || updateMutation.isPending}
              disabled={!debtForm.creditor}
            >
              {editingDebt ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Add Payment to {selectedDebt?.creditor}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paymentAmount">Payment Amount</Label>
                <Input
                  id="paymentAmount"
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentDate">Payment Date</Label>
                <Input
                  id="paymentDate"
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Payment Type</Label>
              <Select
                value={paymentForm.payment_type}
                onValueChange={(value) => setPaymentForm({ ...paymentForm, payment_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly Payment</SelectItem>
                  <SelectItem value="extra">Extra Payment</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-foreground-muted">
                {paymentForm.payment_type === 'monthly'
                  ? 'Regular monthly payment (includes interest + principal)'
                  : 'Extra payment (goes entirely to principal, reduces interest)'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentNotes">Notes (Optional)</Label>
              <Input
                id="paymentNotes"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddPayment}
              loading={addPaymentMutation.isPending}
              disabled={!paymentForm.amount}
            >
              Add Payment
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
    </div>
  );
}

// Debt Payments Component
function DebtPayments({ debtId }: { debtId: number }) {
  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ['debt-payments', debtId],
    queryFn: async () => {
      const response = await debtsAPI.getPayments(debtId);
      return response.data.payments;
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
