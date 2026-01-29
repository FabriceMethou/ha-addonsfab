import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsAPI, currenciesAPI, settingsAPI } from '../services/api';
import { useToast } from '../contexts/ToastContext';
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

  const [accountForm, setAccountForm] = useState({
    name: '',
    bank_id: '',
    owner_id: '',
    account_type: '',
    balance: '',
    currency: 'EUR',
    opening_date: '',
    opening_balance: '',
    linked_account_id: '',
  });

  const [bankForm, setBankForm] = useState({ name: '' });
  const [ownerForm, setOwnerForm] = useState({ name: '' });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      setDeleteConfirm(null);
      toast.success('Account deleted successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to delete account:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to delete account: ${errorMessage}`);
    },
  });

  const resetAccountForm = () => {
    setAccountForm({
      name: '',
      bank_id: '',
      owner_id: '',
      account_type: '',
      balance: '',
      currency: 'EUR',
      opening_date: '',
      opening_balance: '',
      linked_account_id: '',
    });
  };

  const handleEditAccount = (account: any) => {
    setEditingItem(account);
    setAccountForm({
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
  };

  const handleSaveAccount = () => {
    const name = accountForm.name.trim();
    const data: any = {
      name,
      bank_id: parseInt(accountForm.bank_id),
      owner_id: parseInt(accountForm.owner_id),
      account_type: accountForm.account_type,
      balance: parseFloat(accountForm.balance),
      currency: accountForm.currency,
    };

    if (accountForm.opening_date) data.opening_date = accountForm.opening_date;
    if (accountForm.opening_balance) data.opening_balance = parseFloat(accountForm.opening_balance);
    if (accountForm.linked_account_id) data.linked_account_id = parseInt(accountForm.linked_account_id);

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
      setBankForm({ name: '' });
      setEditingBank(null);
      toast.success('Bank created successfully!');
    },
  });

  const updateBankMutation = useMutation({
    mutationFn: ({ id, data }: any) => accountsAPI.updateBank(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setBankDialog(false);
      setBankForm({ name: '' });
      setEditingBank(null);
      toast.success('Bank updated successfully!');
    },
  });

  const deleteBankMutation = useMutation({
    mutationFn: (id: number) => accountsAPI.deleteBank(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      setDeleteBankConfirm(null);
      toast.success('Bank deleted successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to delete bank:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to delete bank: ${errorMessage}`);
    },
  });

  // Owner mutations
  const createOwnerMutation = useMutation({
    mutationFn: (data: any) => accountsAPI.createOwner(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owners'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      setOwnerDialog(false);
      setOwnerForm({ name: '' });
      setEditingOwner(null);
      toast.success('Owner created successfully!');
    },
  });

  const updateOwnerMutation = useMutation({
    mutationFn: ({ id, data }: any) => accountsAPI.updateOwner(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owners'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      setOwnerDialog(false);
      setOwnerForm({ name: '' });
      setEditingOwner(null);
      toast.success('Owner updated successfully!');
    },
  });

  const deleteOwnerMutation = useMutation({
    mutationFn: (id: number) => accountsAPI.deleteOwner(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owners'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-summary'] });
      setDeleteOwnerConfirm(null);
      toast.success('Owner deleted successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to delete owner:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to delete owner: ${errorMessage}`);
    },
  });

  const handleEditBank = (bank: any) => {
    setEditingBank(bank);
    setBankForm({ name: bank.name });
    setBankDialog(true);
  };

  const handleSaveBank = () => {
    if (editingBank) {
      updateBankMutation.mutate({ id: editingBank.id, data: bankForm });
    } else {
      createBankMutation.mutate(bankForm);
    }
  };

  const handleEditOwner = (owner: any) => {
    setEditingOwner(owner);
    setOwnerForm({ name: owner.name });
    setOwnerDialog(true);
  };

  const handleSaveOwner = () => {
    if (editingOwner) {
      updateOwnerMutation.mutate({ id: editingOwner.id, data: ownerForm });
    } else {
      createOwnerMutation.mutate(ownerForm);
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
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  // Format balance to 2 decimal places (except for investment accounts)
  const formatBalanceInput = (value: string, isInvestment: boolean = false): string => {
    if (!value) return value;
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    // Investment accounts can have more precision
    if (isInvestment) return value;
    // Round to 2 decimal places
    return num.toFixed(2);
  };

  // Handle balance change with decimal limit
  const handleBalanceChange = (value: string, field: 'balance' | 'opening_balance') => {
    // Allow typing (don't format on every keystroke)
    setAccountForm({ ...accountForm, [field]: value });
  };

  // Format balance on blur (when user leaves field)
  const handleBalanceBlur = (field: 'balance' | 'opening_balance') => {
    const value = accountForm[field];
    if (!value) return;
    const isInvestment = accountForm.account_type === 'investment';
    const formatted = formatBalanceInput(value, isInvestment);
    setAccountForm({ ...accountForm, [field]: formatted });
  };

  // Calculate summary metrics
  const totalBalance = accountsData?.reduce((sum: number, a: any) => sum + a.balance, 0) || 0;
  const totalAccounts = accountsData?.length || 0;
  const totalBanks = banksData?.length || 0;
  const totalOwners = ownersData?.length || 0;

  if (accountsLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Total Balance"
          value={formatCurrency(totalBalance)}
          subtitle="All accounts combined"
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
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-all ${tabValue === index
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
                setBankForm({ name: '' });
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
                            setBankForm({ name: '' });
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
                setOwnerForm({ name: '' });
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
                      const totalBalance = ownerAccounts.reduce((sum: number, a: any) => sum + a.balance, 0);

                      return (
                        <TableRow key={owner.id}>
                          <TableCell className="font-medium">{owner.name}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="default" size="sm">{ownerAccounts.length}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(totalBalance)}
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
                            setOwnerForm({ name: '' });
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
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Account Name</Label>
              <Input
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                placeholder="e.g., Main Checking"
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Bank</Label>
              <Select value={accountForm.bank_id} onValueChange={(value) => setAccountForm({ ...accountForm, bank_id: value })}>
                <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                <SelectContent>
                  {banksData?.map((bank: any) => (
                    <SelectItem key={bank.id} value={bank.id.toString()}>{bank.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Owner</Label>
              <Select value={accountForm.owner_id} onValueChange={(value) => setAccountForm({ ...accountForm, owner_id: value })}>
                <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                <SelectContent>
                  {ownersData?.map((owner: any) => (
                    <SelectItem key={owner.id} value={owner.id.toString()}>{owner.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Account Type</Label>
              <Select value={accountForm.account_type} onValueChange={(value) => setAccountForm({ ...accountForm, account_type: value })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {accountTypesData?.map((type: string) => (
                    <SelectItem key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={accountForm.currency} onValueChange={(value) => setAccountForm({ ...accountForm, currency: value })}>
                <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
                <SelectContent>
                  {currenciesData?.map((currency: any) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} - {currency.name} ({currency.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Current Balance</Label>
              <Input
                type="number"
                step={accountForm.account_type === 'investment' ? 'any' : '0.01'}
                value={accountForm.balance}
                onChange={(e) => handleBalanceChange(e.target.value, 'balance')}
                onBlur={() => handleBalanceBlur('balance')}
              />
              {accountForm.account_type !== 'investment' && (
                <p className="text-xs text-foreground-muted mt-1">Limited to 2 decimal places</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Opening Balance</Label>
              <Input
                type="number"
                step={accountForm.account_type === 'investment' ? 'any' : '0.01'}
                value={accountForm.opening_balance}
                onChange={(e) => handleBalanceChange(e.target.value, 'opening_balance')}
                onBlur={() => handleBalanceBlur('opening_balance')}
                placeholder="Initial balance"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Opening Date</Label>
              <Input type="date" value={accountForm.opening_date} onChange={(e) => setAccountForm({ ...accountForm, opening_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Linked Account (for investments)</Label>
              <Select value={accountForm.linked_account_id} onValueChange={(value) => setAccountForm({ ...accountForm, linked_account_id: value })}>
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveAccount} loading={createAccountMutation.isPending || updateAccountMutation.isPending}>
              {editingItem ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bank Dialog */}
      <Dialog open={bankDialog} onOpenChange={setBankDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{editingBank ? 'Edit Bank' : 'Add Bank'}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-1.5">
            <Label>Bank Name</Label>
            <Input value={bankForm.name} onChange={(e) => setBankForm({ name: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBankDialog(false); setEditingBank(null); setBankForm({ name: '' }); }}>Cancel</Button>
            <Button onClick={handleSaveBank} loading={createBankMutation.isPending || updateBankMutation.isPending} disabled={!bankForm.name}>
              {editingBank ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Owner Dialog */}
      <Dialog open={ownerDialog} onOpenChange={setOwnerDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{editingOwner ? 'Edit Owner' : 'Add Owner'}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-1.5">
            <Label>Owner Name</Label>
            <Input value={ownerForm.name} onChange={(e) => setOwnerForm({ name: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOwnerDialog(false); setEditingOwner(null); setOwnerForm({ name: '' }); }}>Cancel</Button>
            <Button onClick={handleSaveOwner} loading={createOwnerMutation.isPending || updateOwnerMutation.isPending} disabled={!ownerForm.name}>
              {editingOwner ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Bank Confirmation */}
      <Dialog open={!!deleteBankConfirm} onOpenChange={() => setDeleteBankConfirm(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete Bank</DialogTitle>
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
                <Label>Actual Balance (from bank statement)</Label>
                <Input
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
              <Label>Notes (optional)</Label>
              <Textarea
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
