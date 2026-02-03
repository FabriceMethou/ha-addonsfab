import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { accountsAPI, currenciesAPI, settingsAPI } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import {
  accountSchema,
  bankSchema,
  ownerSchema,
  type AccountFormData,
  type BankFormData,
  type OwnerFormData,
} from '../lib/validations';
import { formatCurrency as formatCurrencyUtil } from '../lib/utils';
import { sumMoney, roundMoney } from '../lib/money';
import {
  Card,
  Button,
  Badge,
  Input,
  Label,
  Spinner,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  FormField,
  AccountsSkeleton,
} from '../components/shadcn';
import {
  Plus,
  Edit2,
  Trash2,
  Building2,
  User,
  Wallet,
  CheckCircle,
  History,
  AlertTriangle,
  RefreshCw,
  Users,
  Landmark,
} from 'lucide-react';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  if (value !== index) return null;
  return <div className="pt-4">{children}</div>;
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
    <Card className="relative overflow-hidden p-4 sm:p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
      {/* Background gradient effect */}
      <div className={`absolute top-0 right-0 w-32 h-32 ${iconColor} opacity-5 blur-3xl rounded-full`} />

      <div className="relative">
        <div className="flex items-start justify-between mb-2 sm:mb-4">
          <div className={`p-2 sm:p-3 rounded-lg ${iconColor} bg-opacity-10 [&>svg]:w-5 [&>svg]:h-5 sm:[&>svg]:w-6 sm:[&>svg]:h-6`}>
            {icon}
          </div>
        </div>

        <div>
          <p className="text-xs sm:text-sm text-foreground-muted mb-0.5 sm:mb-1">{title}</p>
          {loading ? (
            <div className="h-6 sm:h-8 flex items-center">
              <Spinner className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          ) : (
            <>
              <p className="text-lg sm:text-2xl font-bold text-foreground truncate">{value}</p>
              {subtitle && (
                <p className="text-[10px] sm:text-xs text-foreground-muted mt-0.5 sm:mt-1 hidden sm:block">{subtitle}</p>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function AccountsPage() {
  const [tabValue, setTabValue] = useState(0);
  const [accountDialog, setAccountDialog] = useState(false);
  const [bankDialog, setBankDialog] = useState(false);
  const [ownerDialog, setOwnerDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [validationDialog, setValidationDialog] = useState(false);
  const [validatingAccount, setValidatingAccount] = useState<any>(null);
  const [validationForm, setValidationForm] = useState({
    actual_balance: '',
    notes: '',
  });
  const [validationHistory, setValidationHistory] = useState<any[]>([]);

  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await accountsAPI.getAll();
      return response.data.accounts;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settingsAPI.getAll();
      return response.data.settings || {};
    },
  });

  const { data: banksData } = useQuery({
    queryKey: ['banks'],
    queryFn: async () => {
      const response = await accountsAPI.getBanks();
      return response.data.banks;
    },
  });

  const { data: ownersData } = useQuery({
    queryKey: ['owners'],
    queryFn: async () => {
      const response = await accountsAPI.getOwners();
      return response.data.owners;
    },
  });

  const { data: summaryData } = useQuery({
    queryKey: ['accounts-summary'],
    queryFn: async () => {
      const response = await accountsAPI.getSummary();
      return response.data.summary;
    },
  });

  const { data: currenciesData } = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => {
      const response = await currenciesAPI.getAll();
      return response.data.currencies;
    },
  });

  const { data: accountTypesData } = useQuery({
    queryKey: ['account-types'],
    queryFn: async () => {
      const response = await currenciesAPI.getAccountTypes();
      return response.data.account_types;
    },
  });

  // Account form with validation
  const {
    control: accountControl,
    register: accountRegister,
    handleSubmit: handleAccountSubmit,
    formState: { errors: accountErrors, isValid: isAccountValid },
    reset: resetAccountForm,
    watch: watchAccount,
    setValue: setAccountValue,
    trigger: triggerAccountForm,
  } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      bank_id: '',
      owner_id: '',
      account_type: '',
      balance: '',
      currency: 'EUR',
      opening_date: '',
      opening_balance: '',
      linked_account_id: '',
    },
  });

  // Bank form with validation
  const {
    register: bankRegister,
    handleSubmit: handleBankSubmit,
    formState: { errors: bankErrors, isValid: isBankValid },
    reset: resetBankForm,
    trigger: triggerBankForm,
  } = useForm<BankFormData>({
    resolver: zodResolver(bankSchema),
    mode: 'onChange',
    defaultValues: { name: '' },
  });

  // Owner form with validation
  const {
    register: ownerRegister,
    handleSubmit: handleOwnerSubmit,
    formState: { errors: ownerErrors, isValid: isOwnerValid },
    reset: resetOwnerForm,
    trigger: triggerOwnerForm,
  } = useForm<OwnerFormData>({
    resolver: zodResolver(ownerSchema),
    mode: 'onChange',
    defaultValues: { name: '' },
  });

  const [editingBank, setEditingBank] = useState<any>(null);
  const [editingOwner, setEditingOwner] = useState<any>(null);
  const [deleteBankConfirm, setDeleteBankConfirm] = useState<any>(null);
  const [deleteOwnerConfirm, setDeleteOwnerConfirm] = useState<any>(null);

  // Mutations
  const createAccountMutation = useMutation({
    mutationFn: (data: any) => accountsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      setAccountDialog(false);
      resetAccountForm();
      toast.success('Account created successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to create account:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to create account: ${errorMessage}`);
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: ({ id, data }: any) => accountsAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      setAccountDialog(false);
      resetAccountForm();
      setEditingItem(null);
      toast.success('Account updated successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to update account:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to update account: ${errorMessage}`);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (id: number) => accountsAPI.delete(id),
    onMutate: async (deletedId: number) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['accounts'] });

      // Snapshot the previous value
      const previousAccounts = queryClient.getQueryData(['accounts']);

      // Optimistically remove from the list
      queryClient.setQueryData(['accounts'], (old: any[] | undefined) => {
        if (!old) return old;
        return old.filter((a: any) => a.id !== deletedId);
      });

      // Close UI elements immediately for better UX
      setDeleteConfirm(null);

      // Return context with the previous value
      return { previousAccounts };
    },
    onError: (error: any, _deletedId, context) => {
      // Rollback to previous state on error
      if (context?.previousAccounts) {
        queryClient.setQueryData(['accounts'], context.previousAccounts);
      }
      console.error('Failed to delete account:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to delete account: ${errorMessage}`);
    },
    onSuccess: () => {
      toast.success('Account deleted successfully!');
    },
    onSettled: () => {
      // Always refetch after error or success to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
    },
  });

  const handleEditAccount = (account: any) => {
    setEditingItem(account);
    resetAccountForm({
      name: account.name || '',
      bank_id: account.bank_id.toString(),
      owner_id: account.owner_id.toString(),
      account_type: account.account_type,
      balance: account.balance.toString(),
      currency: account.currency,
      opening_date: account.opening_date || '',
      opening_balance: account.opening_balance?.toString() || '',
      linked_account_id: account.linked_account_id?.toString() || '',
    });
    setAccountDialog(true);
    setTimeout(() => triggerAccountForm(), 0);
  };

  const onAccountSubmit = (formData: AccountFormData) => {
    const name = formData.name?.trim() || '';
    const data: any = {
      name,
      bank_id: parseInt(formData.bank_id),
      owner_id: parseInt(formData.owner_id),
      account_type: formData.account_type,
      balance: parseFloat(formData.balance),
      currency: formData.currency,
    };

    if (formData.opening_date) data.opening_date = formData.opening_date;
    if (formData.opening_balance) data.opening_balance = parseFloat(formData.opening_balance);
    if (formData.linked_account_id) data.linked_account_id = parseInt(formData.linked_account_id);

    if (editingItem) {
      updateAccountMutation.mutate({ id: editingItem.id, data });
    } else {
      createAccountMutation.mutate(data);
    }
  };

  // Bank mutations
  const createBankMutation = useMutation({
    mutationFn: (data: any) => accountsAPI.createBank(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      setBankDialog(false);
      resetBankForm();
      setEditingBank(null);
      toast.success('Bank created successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to create bank:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to create bank: ${errorMessage}`);
    },
  });

  const updateBankMutation = useMutation({
    mutationFn: ({ id, data }: any) => accountsAPI.updateBank(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setBankDialog(false);
      resetBankForm();
      setEditingBank(null);
      toast.success('Bank updated successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to update bank:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to update bank: ${errorMessage}`);
    },
  });

  const deleteBankMutation = useMutation({
    mutationFn: (id: number) => accountsAPI.deleteBank(id),
    onMutate: async (deletedId: number) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['banks'] });

      // Snapshot the previous value
      const previousBanks = queryClient.getQueryData(['banks']);

      // Optimistically remove from the list
      queryClient.setQueryData(['banks'], (old: any[] | undefined) => {
        if (!old) return old;
        return old.filter((b: any) => b.id !== deletedId);
      });

      // Close UI elements immediately for better UX
      setDeleteBankConfirm(null);

      // Return context with the previous value
      return { previousBanks };
    },
    onError: (error: any, _deletedId, context) => {
      // Rollback to previous state on error
      if (context?.previousBanks) {
        queryClient.setQueryData(['banks'], context.previousBanks);
      }
      console.error('Failed to delete bank:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to delete bank: ${errorMessage}`);
    },
    onSuccess: () => {
      toast.success('Bank deleted successfully!');
    },
    onSettled: () => {
      // Always refetch after error or success to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['banks'] });
    },
  });

  // Owner mutations
  const createOwnerMutation = useMutation({
    mutationFn: (data: any) => accountsAPI.createOwner(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owners'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      setOwnerDialog(false);
      resetOwnerForm();
      setEditingOwner(null);
      toast.success('Owner created successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to create owner:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to create owner: ${errorMessage}`);
    },
  });

  const updateOwnerMutation = useMutation({
    mutationFn: ({ id, data }: any) => accountsAPI.updateOwner(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owners'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      setOwnerDialog(false);
      resetOwnerForm();
      setEditingOwner(null);
      toast.success('Owner updated successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to update owner:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to update owner: ${errorMessage}`);
    },
  });

  const deleteOwnerMutation = useMutation({
    mutationFn: (id: number) => accountsAPI.deleteOwner(id),
    onMutate: async (deletedId: number) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['owners'] });

      // Snapshot the previous value
      const previousOwners = queryClient.getQueryData(['owners']);

      // Optimistically remove from the list
      queryClient.setQueryData(['owners'], (old: any[] | undefined) => {
        if (!old) return old;
        return old.filter((o: any) => o.id !== deletedId);
      });

      // Close UI elements immediately for better UX
      setDeleteOwnerConfirm(null);

      // Return context with the previous value
      return { previousOwners };
    },
    onError: (error: any, _deletedId, context) => {
      // Rollback to previous state on error
      if (context?.previousOwners) {
        queryClient.setQueryData(['owners'], context.previousOwners);
      }
      console.error('Failed to delete owner:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to delete owner: ${errorMessage}`);
    },
    onSuccess: () => {
      toast.success('Owner deleted successfully!');
    },
    onSettled: () => {
      // Always refetch after error or success to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ['owners'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
    },
  });

  const handleEditBank = (bank: any) => {
    setEditingBank(bank);
    resetBankForm({ name: bank.name });
    setBankDialog(true);
    setTimeout(() => triggerBankForm(), 0);
  };

  const onBankSubmit = (formData: BankFormData) => {
    if (editingBank) {
      updateBankMutation.mutate({ id: editingBank.id, data: formData });
    } else {
      createBankMutation.mutate(formData);
    }
  };

  const handleEditOwner = (owner: any) => {
    setEditingOwner(owner);
    resetOwnerForm({ name: owner.name });
    setOwnerDialog(true);
    setTimeout(() => triggerOwnerForm(), 0);
  };

  const onOwnerSubmit = (formData: OwnerFormData) => {
    if (editingOwner) {
      updateOwnerMutation.mutate({ id: editingOwner.id, data: formData });
    } else {
      createOwnerMutation.mutate(formData);
    }
  };

  const handleOpenValidation = async (account: any) => {
    setValidatingAccount(account);

    // Round balance to 2 decimal places for non-investment accounts
    // This avoids floating-point precision issues like 1234.5600000000001
    const isInvestment = account.account_type === 'investment';
    const formattedBalance = isInvestment
      ? account.balance.toString()
      : parseFloat(account.balance).toFixed(2);

    setValidationForm({
      actual_balance: formattedBalance,
      notes: '',
    });
    setValidationDialog(true);

    try {
      const response = await accountsAPI.getValidations(account.id, 5);
      setValidationHistory(response.data.validations || []);
    } catch {
      setValidationHistory([]);
    }
  };

  const createValidationMutation = useMutation({
    mutationFn: (data: any) => accountsAPI.createValidation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setValidationDialog(false);
      setValidationForm({ actual_balance: '', notes: '' });
      setValidatingAccount(null);
      toast.success('Balance validation saved!');
    },
  });

  const recalculateBalancesMutation = useMutation({
    mutationFn: () => accountsAPI.recalculateBalances(),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      const { updated_count, updates } = response.data;
      if (updated_count > 0) {
        const updateList = updates.map((u: any) =>
          `${u.name}: ${u.old_balance.toFixed(2)} → ${u.new_balance.toFixed(2)}`
        ).join(', ');
        toast.success(`Successfully recalculated ${updated_count} account balance${updated_count !== 1 ? 's' : ''}: ${updateList}`);
      } else {
        toast.success('All account balances are already correct!');
      }
    },
    onError: (error: any) => {
      console.error('Failed to recalculate balances:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to recalculate balances: ${errorMessage}`);
    },
  });

  // Optional: Auto-recalculate balances on page load (when debug setting is enabled)
  useEffect(() => {
    const autoRecalculate = settings?.debug_auto_recalculate === true;
    if (autoRecalculate && accountsData) {
      console.log('[DEBUG] Auto-recalculating balances on page load...');
      accountsAPI.recalculateBalances()
        .then((response) => {
          const { updated_count } = response.data;
          if (updated_count > 0) {
            console.log(`[DEBUG] Auto-recalculated ${updated_count} account balances`);
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
          }
        })
        .catch((error) => {
          console.error('[DEBUG] Auto-recalculate failed:', error);
        });
    }
  }, [accountsData, settings, queryClient]);

  const handleSaveValidation = () => {
    if (!validatingAccount) return;

    const data = {
      account_id: validatingAccount.id,
      validation_date: new Date().toISOString().split('T')[0],
      actual_balance: parseFloat(validationForm.actual_balance),
      notes: validationForm.notes || null,
    };

    createValidationMutation.mutate(data);
  };

  const formatCurrency = (amount: number, currency: string = 'EUR') => {
    return formatCurrencyUtil(amount, currency);
  };

  // Format balance to 2 decimal places (except for investment accounts)
  const formatBalanceInput = (value: string, isInvestment: boolean = false): string => {
    if (!value) return value;
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    // Investment accounts can have more precision
    if (isInvestment) return value;
    // Round to 2 decimal places using precise decimal arithmetic
    return roundMoney(num).toString();
  };

  // Watch account form values
  const accountFormValues = watchAccount();

  // Format balance on blur (when user leaves field)
  const handleBalanceBlur = (field: 'balance' | 'opening_balance') => {
    const value = accountFormValues[field];
    if (!value) return;
    const isInvestment = accountFormValues.account_type === 'investment';
    const formatted = formatBalanceInput(value, isInvestment);
    setAccountValue(field, formatted);
  };

  // Calculate summary metrics using precise decimal arithmetic
  // Use summaryData for total balance - it's already converted to display currency by the backend
  const displayCurrency = settings?.display_currency || 'EUR';
  const totalBalance = sumMoney(summaryData || [], (owner: any) => owner.total_balance);
  const totalAccounts = accountsData?.length || 0;
  const totalBanks = banksData?.length || 0;
  const totalOwners = ownersData?.length || 0;

  if (accountsLoading) {
    return <AccountsSkeleton />;
  }

  const tabs = [
    { label: 'Accounts', icon: Wallet },
    { label: 'Banks', icon: Building2 },
    { label: 'Owners', icon: User },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Accounts Management</h1>
        <p className="text-foreground-muted">
          {totalAccounts} account{totalAccounts !== 1 ? 's' : ''} across {totalBanks} bank{totalBanks !== 1 ? 's' : ''} • Manage your financial accounts
        </p>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <KPICard
          title="Total Balance"
          value={formatCurrency(totalBalance, displayCurrency)}
          subtitle={`All accounts in ${displayCurrency}`}
          icon={<Wallet size={24} className="text-blue-500" />}
          iconColor="bg-blue-500"
          loading={accountsLoading}
        />
        <KPICard
          title="Total Accounts"
          value={totalAccounts.toString()}
          subtitle="Active accounts"
          icon={<Landmark size={24} className="text-emerald-500" />}
          iconColor="bg-emerald-500"
          loading={accountsLoading}
        />
        <KPICard
          title="Total Banks"
          value={totalBanks.toString()}
          subtitle="Financial institutions"
          icon={<Building2 size={24} className="text-violet-500" />}
          iconColor="bg-violet-500"
        />
        <KPICard
          title="Total Owners"
          value={totalOwners.toString()}
          subtitle="Account holders"
          icon={<Users size={24} className="text-amber-500" />}
          iconColor="bg-amber-500"
        />
      </div>

      {/* Owner Summary Cards */}
      {summaryData && summaryData.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">Balances by Owner</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {summaryData.map((owner: any) => (
              <Card key={owner.owner_id} className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-5 h-5 text-primary" />
                  <span className="text-lg font-semibold text-foreground">{owner.owner_name}</span>
                </div>
                <p className="text-2xl font-bold text-primary">{formatCurrency(owner.total_balance)}</p>
                <p className="text-sm text-foreground-muted">{owner.account_count} account{owner.account_count !== 1 ? 's' : ''}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Card className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
        <div className="border-b border-border bg-surface/30">
          <div className="flex">
            {tabs.map((tab, index) => {
              const Icon = tab.icon;
              return (
                <button
                  key={index}
                  onClick={() => setTabValue(index)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-all ${
                    tabValue === index
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-transparent text-foreground-muted hover:text-foreground hover:bg-surface-hover'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Accounts Tab */}
        <TabPanel value={tabValue} index={0}>
          <div className="p-6">
            <div className="flex justify-end gap-2 mb-4">
              <Button
                variant="outline"
                onClick={() => recalculateBalancesMutation.mutate()}
                disabled={recalculateBalancesMutation.isPending}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${recalculateBalancesMutation.isPending ? 'animate-spin' : ''}`} />
                {recalculateBalancesMutation.isPending ? 'Recalculating...' : 'Recalculate Balances'}
              </Button>
              <Button onClick={() => {
                setEditingItem(null);
                resetAccountForm();
                setAccountDialog(true);
              }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Account
              </Button>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Opened</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountsData && accountsData.length > 0 ? (
                    accountsData.map((account: any) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.name || '-'}</TableCell>
                        <TableCell>{account.bank_name}</TableCell>
                        <TableCell>{account.owner_name}</TableCell>
                        <TableCell>
                          <Badge variant="default" size="sm">{account.account_type}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {formatCurrency(account.balance, account.currency)}
                        </TableCell>
                        <TableCell>{account.currency}</TableCell>
                        <TableCell>
                          {account.opening_date ? new Date(account.opening_date).toLocaleDateString('de-DE') : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenValidation(account)} title="Validate Balance">
                              <CheckCircle className="w-4 h-4 text-success" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleEditAccount(account)}>
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm({ type: 'account', item: account })}>
                              <Trash2 className="w-4 h-4 text-error" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12">
                        <div className="flex flex-col items-center justify-center text-foreground-muted">
                          <Wallet className="h-12 w-12 mb-2 opacity-50" />
                          <p>No accounts found</p>
                          <Button onClick={() => {
                            setEditingItem(null);
                            resetAccountForm();
                            setAccountDialog(true);
                          }} className="mt-4" size="sm">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Your First Account
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabPanel>

        {/* Banks Tab */}
        <TabPanel value={tabValue} index={1}>
          <div className="p-6">
            <div className="flex justify-end mb-4">
              <Button onClick={() => {
                setEditingBank(null);
                resetBankForm();
                setBankDialog(true);
              }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Bank
              </Button>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bank Name</TableHead>
                    <TableHead className="text-right">Accounts</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {banksData && banksData.length > 0 ? (
                    banksData.map((bank: any) => {
                      const bankAccountCount = accountsData?.filter((a: any) => a.bank_id === bank.id).length || 0;
                      return (
                        <TableRow key={bank.id}>
                          <TableCell className="font-medium">{bank.name}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="default" size="sm">{bankAccountCount}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => handleEditBank(bank)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteBankConfirm(bank)}
                                disabled={bankAccountCount > 0}
                                title={bankAccountCount > 0 ? 'Cannot delete bank with accounts' : 'Delete bank'}
                              >
                                <Trash2 className="w-4 h-4 text-error" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-12">
                        <div className="flex flex-col items-center justify-center text-foreground-muted">
                          <Building2 className="h-12 w-12 mb-2 opacity-50" />
                          <p>No banks found</p>
                          <Button onClick={() => {
                            setEditingBank(null);
                            resetBankForm();
                            setBankDialog(true);
                          }} className="mt-4" size="sm">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Your First Bank
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabPanel>

        {/* Owners Tab */}
        <TabPanel value={tabValue} index={2}>
          <div className="p-6">
            <div className="flex justify-end mb-4">
              <Button onClick={() => {
                setEditingOwner(null);
                resetOwnerForm();
                setOwnerDialog(true);
              }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Owner
              </Button>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Owner Name</TableHead>
                    <TableHead className="text-right">Accounts</TableHead>
                    <TableHead className="text-right">Total Balance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownersData && ownersData.length > 0 ? (
                    ownersData.map((owner: any) => {
                      const ownerAccounts = accountsData?.filter((a: any) => a.owner_id === owner.id) || [];
                      // Use summaryData for total balance - it's already converted to display currency
                      const ownerSummary = summaryData?.find((s: any) => s.owner_id === owner.id);
                      const ownerTotalBalance = ownerSummary?.total_balance || 0;

                      return (
                        <TableRow key={owner.id}>
                          <TableCell className="font-medium">{owner.name}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="default" size="sm">{ownerAccounts.length}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(ownerTotalBalance, displayCurrency)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => handleEditOwner(owner)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteOwnerConfirm(owner)}
                                disabled={ownerAccounts.length > 0}
                                title={ownerAccounts.length > 0 ? 'Cannot delete owner with accounts' : 'Delete owner'}
                              >
                                <Trash2 className="w-4 h-4 text-error" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12">
                        <div className="flex flex-col items-center justify-center text-foreground-muted">
                          <Users className="h-12 w-12 mb-2 opacity-50" />
                          <p>No owners found</p>
                          <Button onClick={() => {
                            setEditingOwner(null);
                            resetOwnerForm();
                            setOwnerDialog(true);
                          }} className="mt-4" size="sm">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Your First Owner
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabPanel>
      </Card>

      {/* Account Dialog */}
      <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Account' : 'Add Account'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Update the account details below.' : 'Enter the details for your new account.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAccountSubmit(onAccountSubmit)}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
              <FormField label="Account Name" className="sm:col-span-2">
                <Input
                  {...accountRegister('name')}
                  placeholder="e.g., Main Checking"
                />
              </FormField>
              <FormField label="Bank" error={accountErrors.bank_id?.message} required className="sm:col-span-2">
                <Controller
                  name="bank_id"
                  control={accountControl}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                      <SelectContent>
                        {banksData?.map((bank: any) => (
                          <SelectItem key={bank.id} value={bank.id.toString()}>{bank.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label="Owner" error={accountErrors.owner_id?.message} required className="sm:col-span-2">
                <Controller
                  name="owner_id"
                  control={accountControl}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                      <SelectContent>
                        {ownersData?.map((owner: any) => (
                          <SelectItem key={owner.id} value={owner.id.toString()}>{owner.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label="Account Type" error={accountErrors.account_type?.message} required>
                <Controller
                  name="account_type"
                  control={accountControl}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {accountTypesData?.map((type: string) => (
                          <SelectItem key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label="Currency" error={accountErrors.currency?.message} required>
                <Controller
                  name="currency"
                  control={accountControl}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
                      <SelectContent>
                        {currenciesData?.map((currency: any) => (
                          <SelectItem key={currency.code} value={currency.code}>
                            {currency.code} - {currency.name} ({currency.symbol})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField
                label="Current Balance"
                error={accountErrors.balance?.message}
                required
                helperText={accountFormValues.account_type !== 'investment' ? 'Limited to 2 decimal places' : undefined}
              >
                <Input
                  type="number"
                  step={accountFormValues.account_type === 'investment' ? 'any' : '0.01'}
                  {...accountRegister('balance')}
                  onBlur={() => handleBalanceBlur('balance')}
                />
              </FormField>
              <FormField label="Opening Balance" error={accountErrors.opening_balance?.message}>
                <Input
                  type="number"
                  step={accountFormValues.account_type === 'investment' ? 'any' : '0.01'}
                  {...accountRegister('opening_balance')}
                  onBlur={() => handleBalanceBlur('opening_balance')}
                  placeholder="Initial balance"
                />
              </FormField>
              <FormField label="Opening Date">
                <Input type="date" {...accountRegister('opening_date')} />
              </FormField>
              <FormField label="Linked Account (for investments)">
                <Controller
                  name="linked_account_id"
                  control={accountControl}
                  render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {accountsData?.filter((a: any) => a.account_type !== 'investment' && a.id !== editingItem?.id).map((account: any) => (
                          <SelectItem key={account.id} value={account.id.toString()}>
                            {account.name || `${account.bank_name} - ${account.account_type}`} ({account.currency})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setAccountDialog(false)}>Cancel</Button>
              <Button
                type="submit"
                loading={createAccountMutation.isPending || updateAccountMutation.isPending}
                disabled={!isAccountValid}
              >
                {editingItem ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bank Dialog */}
      <Dialog open={bankDialog} onOpenChange={setBankDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{editingBank ? 'Edit Bank' : 'Add Bank'}</DialogTitle>
            <DialogDescription>
              {editingBank ? 'Update the bank name.' : 'Add a new bank to organize your accounts.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBankSubmit(onBankSubmit)}>
            <div className="py-4">
              <FormField label="Bank Name" error={bankErrors.name?.message} required>
                <Input {...bankRegister('name')} placeholder="e.g., Chase Bank" />
              </FormField>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => { setBankDialog(false); setEditingBank(null); resetBankForm(); }}>Cancel</Button>
              <Button type="submit" loading={createBankMutation.isPending || updateBankMutation.isPending} disabled={!isBankValid}>
                {editingBank ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Owner Dialog */}
      <Dialog open={ownerDialog} onOpenChange={setOwnerDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{editingOwner ? 'Edit Owner' : 'Add Owner'}</DialogTitle>
            <DialogDescription>
              {editingOwner ? 'Update the owner name.' : 'Add a new owner to assign to accounts.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleOwnerSubmit(onOwnerSubmit)}>
            <div className="py-4">
              <FormField label="Owner Name" error={ownerErrors.name?.message} required>
                <Input {...ownerRegister('name')} placeholder="e.g., John Doe" />
              </FormField>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => { setOwnerDialog(false); setEditingOwner(null); resetOwnerForm(); }}>Cancel</Button>
              <Button type="submit" loading={createOwnerMutation.isPending || updateOwnerMutation.isPending} disabled={!isOwnerValid}>
                {editingOwner ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Bank Confirmation */}
      <Dialog open={!!deleteBankConfirm} onOpenChange={() => setDeleteBankConfirm(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete Bank</DialogTitle>
            <DialogDescription className="sr-only">
              Confirm deletion of this bank from your account list.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">Are you sure you want to delete "{deleteBankConfirm?.name}"?</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBankConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteBankMutation.mutate(deleteBankConfirm.id)} loading={deleteBankMutation.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Owner Confirmation */}
      <Dialog open={!!deleteOwnerConfirm} onOpenChange={() => setDeleteOwnerConfirm(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete Owner</DialogTitle>
            <DialogDescription className="sr-only">
              Confirm deletion of this owner from your account list.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">Are you sure you want to delete "{deleteOwnerConfirm?.name}"?</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOwnerConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteOwnerMutation.mutate(deleteOwnerConfirm.id)} loading={deleteOwnerMutation.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription className="sr-only">
              Confirm deletion of this account and its associated data.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">Are you sure you want to delete this {deleteConfirm?.type}?</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteConfirm.type === 'account') deleteAccountMutation.mutate(deleteConfirm.item.id); }} loading={deleteAccountMutation.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Balance Validation Dialog */}
      <Dialog open={validationDialog} onOpenChange={setValidationDialog}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              Validate Account Balance: {validatingAccount?.name ? `${validatingAccount.name} (${validatingAccount.bank_name})` : `${validatingAccount?.bank_name} - ${validatingAccount?.account_type}`}
            </DialogTitle>
            <DialogDescription>
              Compare the system balance with your actual account balance to identify discrepancies.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-info/10 border border-info/20 min-w-0">
                <p className="text-sm text-foreground-muted mb-1">System Balance:</p>
                <p className="text-xl font-bold text-foreground truncate">
                  {validatingAccount && formatCurrency(validatingAccount.balance, validatingAccount.currency)}
                </p>
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label htmlFor="validation-actual-balance">Actual Balance (from bank statement)</Label>
                <Input
                  id="validation-actual-balance"
                  type="number"
                  step={validatingAccount?.account_type === 'investment' ? 'any' : '0.01'}
                  value={validationForm.actual_balance}
                  onChange={(e) => setValidationForm({ ...validationForm, actual_balance: e.target.value })}
                  onBlur={() => {
                    if (!validationForm.actual_balance) return;
                    const isInvestment = validatingAccount?.account_type === 'investment';
                    const formatted = formatBalanceInput(validationForm.actual_balance, isInvestment);
                    setValidationForm({ ...validationForm, actual_balance: formatted });
                  }}
                  className="w-full"
                />
                {validatingAccount?.account_type !== 'investment' && (
                  <p className="text-xs text-foreground-muted mt-1">Limited to 2 decimal places</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="validation-notes">Notes (optional)</Label>
              <Textarea
                id="validation-notes"
                value={validationForm.notes}
                onChange={(e) => setValidationForm({ ...validationForm, notes: e.target.value })}
                placeholder="Add any notes about this validation..."
                rows={3}
              />
            </div>

            {validationHistory.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4" />
                  <span className="font-semibold">Recent Validations</span>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">System</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Difference</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validationHistory.map((val: any) => (
                        <TableRow key={val.id}>
                          <TableCell>{new Date(val.validation_date).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">{formatCurrency(val.system_balance, validatingAccount?.currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(val.actual_balance, validatingAccount?.currency)}</TableCell>
                          <TableCell className={`text-right ${val.is_match ? 'text-success' : 'text-error'}`}>
                            {formatCurrency(Math.abs(val.difference), validatingAccount?.currency)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={val.is_match ? 'success' : 'error'} size="sm">
                              {val.is_match ? 'Match' : 'Mismatch'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidationDialog(false)}>Cancel</Button>
            <Button variant="success" onClick={handleSaveValidation} loading={createValidationMutation.isPending} disabled={!validationForm.actual_balance}>
              Save Validation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
