// Settings Page - User Preferences and Account Management
import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  Button,
  Input,
  Badge,
  Spinner,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Switch,
  Label,
} from '../components/shadcn';
import {
  Save,
  Lock,
  HardDrive,
  Download,
  Plus,
  Pencil,
  Trash2,
  Euro,
  Brain,
  CheckCircle,
  AlertTriangle,
  LogOut,
  Users,
  Shield,
  Bug,
  Terminal,
} from 'lucide-react';
import { authAPI, backupsAPI, currenciesAPI, transactionsAPI, settingsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [currencyForm, setCurrencyForm] = useState({
    code: '',
    name: '',
    symbol: '',
    exchange_rate_to_eur: '1.0',
  });

  const [backupDialog, setBackupDialog] = useState(false);
  const [currencyDialog, setCurrencyDialog] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<any>(null);
  const [deleteCurrencyConfirm, setDeleteCurrencyConfirm] = useState<any>(null);
  const [userDialog, setUserDialog] = useState(false);
  const [editUserDialog, setEditUserDialog] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    username: '',
    email: '',
    password: '',
    is_admin: false,
  });
  const [editUserForm, setEditUserForm] = useState({
    id: 0,
    email: '',
    is_admin: false,
  });
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<any>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [displayCurrency, setDisplayCurrency] = useState('EUR');

  // Fetch settings
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settingsAPI.getAll();
      return response.data.settings || {};
    },
  });

  // Update display currency when settings change
  useEffect(() => {
    if (settings && (settings as any).display_currency) {
      setDisplayCurrency((settings as any).display_currency);
    }
  }, [settings]);

  // Sync debug settings to localStorage for API interceptor
  useEffect(() => {
    if (settings) {
      const debugSettings = {
        debug_mode: (settings as any).debug_mode,
        debug_auto_recalculate: (settings as any).debug_auto_recalculate,
        debug_show_logs: (settings as any).debug_show_logs,
        debug_log_api_calls: (settings as any).debug_log_api_calls,
        debug_log_transactions: (settings as any).debug_log_transactions,
      };
      localStorage.setItem('debug_settings', JSON.stringify(debugSettings));
    }
  }, [settings]);

  // Fetch currencies
  const { data: currenciesData = [], isLoading: currenciesLoading } = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => {
      const response = await currenciesAPI.getAll(false); // Get all including inactive
      return response.data.currencies || [];
    },
    initialData: [],
  });

  // Fetch users (admin only)
  const { data: usersData = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      if (!user?.is_admin) return [];
      const response = await authAPI.listUsers();
      return response.data.users || [];
    },
    enabled: !!user?.is_admin,
    initialData: [],
  });

  // Fetch categorizer status
  const { data: categorizerStatus, refetch: refetchCategorizerStatus } = useQuery({
    queryKey: ['categorizer-status'],
    queryFn: async () => {
      const response = await transactionsAPI.getCategorizerStatus();
      return response.data;
    },
  });

  // Update display currency mutation
  const updateDisplayCurrencyMutation = useMutation({
    mutationFn: (currency: string) => settingsAPI.update('display_currency', currency),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSuccessMessage('Display currency updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: (error: any) => {
      setErrorMessage(error.response?.data?.detail || 'Failed to update display currency');
      setTimeout(() => setErrorMessage(''), 3000);
    },
  });

  // Update debug setting mutation
  const updateDebugSettingMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: boolean }) =>
      settingsAPI.update(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: any) => {
      setErrorMessage(error.response?.data?.detail || 'Failed to update debug setting');
      setTimeout(() => setErrorMessage(''), 3000);
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: ({ oldPassword, newPassword }: any) => authAPI.changePassword(oldPassword, newPassword),
    onSuccess: () => {
      setSuccessMessage('Password changed successfully!');
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: (error: any) => {
      console.error('Failed to change password:', error);
      let errorMsg = 'Failed to change password';

      // Handle Pydantic validation errors (422) which return an array
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (Array.isArray(detail)) {
          // Extract error messages from Pydantic validation errors
          errorMsg = detail.map((err: any) => err.msg || err.message || 'Validation error').join(', ');
        } else if (typeof detail === 'string') {
          errorMsg = detail;
        }
      } else if (error.message) {
        errorMsg = error.message;
      }

      setErrorMessage(errorMsg);
      setTimeout(() => setErrorMessage(''), 3000);
    },
  });

  // Backup mutation
  const createBackupMutation = useMutation({
    mutationFn: (data: any) => backupsAPI.create(data),
    onSuccess: () => {
      setSuccessMessage('Backup created successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: () => {
      setErrorMessage('Failed to create backup');
      setTimeout(() => setErrorMessage(''), 3000);
    },
  });

  // Train categorizer mutation
  const trainCategorizerMutation = useMutation({
    mutationFn: () => transactionsAPI.trainCategorizer(),
    onSuccess: (data: any) => {
      setSuccessMessage(`Model trained successfully with ${data.data.training_samples} transactions!`);
      refetchCategorizerStatus();
      setTimeout(() => setSuccessMessage(''), 5000);
    },
    onError: (error: any) => {
      setErrorMessage(error.response?.data?.detail || 'Failed to train model');
      setTimeout(() => setErrorMessage(''), 5000);
    },
  });

  // Currency mutations
  const createCurrencyMutation = useMutation({
    mutationFn: (data: any) => currenciesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currencies'] });
      setSuccessMessage('Currency added successfully!');
      setCurrencyDialog(false);
      resetCurrencyForm();
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: (error: any) => {
      setErrorMessage(error.response?.data?.detail || 'Failed to add currency');
      setTimeout(() => setErrorMessage(''), 3000);
    },
  });

  const updateCurrencyMutation = useMutation({
    mutationFn: ({ code, data }: any) => currenciesAPI.update(code, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currencies'] });
      setSuccessMessage('Currency updated successfully!');
      setCurrencyDialog(false);
      resetCurrencyForm();
      setEditingCurrency(null);
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: (error: any) => {
      setErrorMessage(error.response?.data?.detail || 'Failed to update currency');
      setTimeout(() => setErrorMessage(''), 3000);
    },
  });

  const deleteCurrencyMutation = useMutation({
    mutationFn: (code: string) => currenciesAPI.delete(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currencies'] });
      setSuccessMessage('Currency deleted successfully!');
      setDeleteCurrencyConfirm(null);
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: (error: any) => {
      setErrorMessage(error.response?.data?.detail || 'Failed to delete currency. It may be in use by accounts.');
      setTimeout(() => setErrorMessage(''), 5000);
    },
  });

  // User mutations
  const createUserMutation = useMutation({
    mutationFn: (data: any) => authAPI.registerUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSuccessMessage('User created successfully!');
      setUserDialog(false);
      setNewUserForm({ username: '', email: '', password: '', is_admin: false });
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: (error: any) => {
      setErrorMessage(error.response?.data?.detail || 'Failed to create user');
      setTimeout(() => setErrorMessage(''), 3000);
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, data }: any) => authAPI.updateUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSuccessMessage('User updated successfully!');
      setEditUserDialog(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: (error: any) => {
      setErrorMessage(error.response?.data?.detail || 'Failed to update user');
      setTimeout(() => setErrorMessage(''), 3000);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => authAPI.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSuccessMessage('User deleted successfully!');
      setDeleteUserConfirm(null);
      setTimeout(() => setSuccessMessage(''), 3000);
    },
    onError: (error: any) => {
      setErrorMessage(error.response?.data?.detail || 'Failed to delete user');
      setTimeout(() => setErrorMessage(''), 3000);
    },
  });

  const handlePasswordChange = () => {
    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setErrorMessage('All password fields are required');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setErrorMessage('New passwords do not match');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setErrorMessage('New password must be at least 6 characters');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }

    changePasswordMutation.mutate({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    });
  };

  const handleCreateBackup = () => {
    createBackupMutation.mutate({
      backup_type: 'manual',
      description: 'Manual backup from settings'
    });
    setBackupDialog(false);
  };

  const handleDownloadBackup = async () => {
    try {
      const response = await backupsAPI.getAll();
      const blob = new Blob([response.data], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_${new Date().toISOString().split('T')[0]}.db`;
      link.click();
      window.URL.revokeObjectURL(url);
      setSuccessMessage('Backup downloaded successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setErrorMessage('Failed to download backup');
      setTimeout(() => setErrorMessage(''), 3000);
    }
  };

  const resetCurrencyForm = () => {
    setCurrencyForm({
      code: '',
      name: '',
      symbol: '',
      exchange_rate_to_eur: '1.0',
    });
  };

  const handleEditCurrency = (currency: any) => {
    setEditingCurrency(currency);
    setCurrencyForm({
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol || '',
      exchange_rate_to_eur: currency.exchange_rate_to_eur.toString(),
    });
    setCurrencyDialog(true);
  };

  const handleSubmitCurrency = () => {
    if (!currencyForm.code || !currencyForm.name || !currencyForm.exchange_rate_to_eur) {
      setErrorMessage('Code, Name, and Exchange Rate are required');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }

    const data = {
      code: currencyForm.code.toUpperCase(),
      name: currencyForm.name,
      symbol: currencyForm.symbol,
      exchange_rate_to_eur: parseFloat(currencyForm.exchange_rate_to_eur),
    };

    if (editingCurrency) {
      updateCurrencyMutation.mutate({ code: editingCurrency.code, data });
    } else {
      createCurrencyMutation.mutate(data);
    }
  };

  const handleSubmitUser = () => {
    if (!newUserForm.username || !newUserForm.password) {
      setErrorMessage('Username and Password are required');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }

    if (newUserForm.password.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }

    // Email is optional, will use default if empty
    const userData = {
      username: newUserForm.username,
      password: newUserForm.password,
      is_admin: newUserForm.is_admin,
      ...(newUserForm.email && { email: newUserForm.email })
    };

    createUserMutation.mutate(userData);
  };

  const handleEditUser = (userData: any) => {
    setEditUserForm({
      id: userData.id,
      email: userData.email,
      is_admin: userData.role === 'admin',
    });
    setEditUserDialog(true);
  };

  const handleSubmitUserUpdate = () => {
    if (!editUserForm.email) {
      setErrorMessage('Email is required');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }

    updateUserMutation.mutate({
      userId: editUserForm.id,
      data: {
        email: editUserForm.email,
        is_admin: editUserForm.is_admin,
      }
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>

      {successMessage && (
        <div className="p-4 rounded-lg bg-success/10 border border-success/20">
          <p className="text-success">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-lg bg-error/10 border border-error/20">
          <p className="text-error">{errorMessage}</p>
        </div>
      )}

      {/* Account Information */}
      <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-foreground mb-4">Account Information</h2>
        <div className="border-t border-border pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-foreground-muted">Username</p>
              <p className="font-semibold text-foreground">{user?.username}</p>
            </div>
            <div>
              <p className="text-sm text-foreground-muted">Role</p>
              <p className="font-semibold text-foreground">{user?.is_admin ? 'Administrator' : 'User'}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Display Currency Preference */}
      <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <Euro className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Display Currency</h2>
        </div>
        <div className="border-t border-border pt-4">
          <p className="text-sm text-foreground-muted mb-4">
            Select the currency to use for displaying all amounts in the dashboard and reports.
            All amounts will be automatically converted from their original currency to your selected display currency.
          </p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground mb-2 block">Display Currency</label>
              <select
                value={displayCurrency}
                onChange={(e) => setDisplayCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {currenciesData
                  .filter((c: any) => c.is_active)
                  .map((currency: any) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} - {currency.name} {currency.symbol ? `(${currency.symbol})` : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div className="pt-7">
              <Button
                onClick={() => updateDisplayCurrencyMutation.mutate(displayCurrency)}
                disabled={updateDisplayCurrencyMutation.isPending || displayCurrency === (settings as any)?.display_currency}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateDisplayCurrencyMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* User Management (Admin Only) */}
      {user?.is_admin && (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">User Management</h2>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setNewUserForm({ username: '', email: '', password: '', is_admin: false });
                setUserDialog(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-sm text-foreground-muted mb-4">
              Manage user accounts and their roles
            </p>

            {usersLoading ? (
              <div className="flex justify-center p-6">
                <Spinner />
              </div>
            ) : (
              <Card className="overflow-hidden border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">MFA</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(usersData) && usersData.map((userData: any) => (
                      <TableRow key={userData.id}>
                        <TableCell className="font-semibold">{userData.username}</TableCell>
                        <TableCell>{userData.email}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {userData.role === 'admin' && <Shield className="w-3 h-3 text-primary" />}
                            <span className={userData.role === 'admin' ? 'text-primary font-semibold' : ''}>
                              {userData.role === 'admin' ? 'Administrator' : 'User'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={userData.is_active ? 'success' : 'outline'} size="sm">
                            {userData.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={userData.mfa_enabled ? 'success' : 'outline'} size="sm">
                            {userData.mfa_enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {userData.last_login
                            ? new Date(userData.last_login).toLocaleString()
                            : 'Never'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditUser(userData)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteUserConfirm(userData)}
                              disabled={userData.username === user?.username}
                              className="text-error hover:text-error hover:bg-error/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        </Card>
      )}

      {/* Change Password */}
      <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Change Password</h2>
        </div>
        <div className="border-t border-border pt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Current Password</label>
            <Input
              type="password"
              value={passwordForm.oldPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">New Password</label>
              <Input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Confirm New Password</label>
              <Input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              />
            </div>
          </div>
          <Button
            onClick={handlePasswordChange}
            disabled={changePasswordMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            Change Password
          </Button>
        </div>
      </Card>

      {/* Backup & Data Management */}
      <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Backup & Data Management</h2>
        </div>
        <div className="border-t border-border pt-4">
          <p className="text-sm text-foreground-muted mb-4">
            Manage your financial data backups and exports
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => setBackupDialog(true)}
              disabled={createBackupMutation.isPending}
            >
              <HardDrive className="w-4 h-4 mr-2" />
              Create Backup
            </Button>
            <Button variant="outline" onClick={handleDownloadBackup}>
              <Download className="w-4 h-4 mr-2" />
              Download Backup
            </Button>
          </div>
        </div>
      </Card>

      {/* Currency Management */}
      <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Euro className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Currency Management</h2>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingCurrency(null);
              resetCurrencyForm();
              setCurrencyDialog(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Currency
          </Button>
        </div>
        <div className="border-t border-border pt-4">
          <p className="text-sm text-foreground-muted mb-4">
            Manage currencies and their exchange rates against EUR
          </p>

          {currenciesLoading ? (
            <div className="flex justify-center p-6">
              <Spinner />
            </div>
          ) : (
            <Card className="overflow-hidden border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Exchange Rate</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.isArray(currenciesData) && currenciesData.map((currency: any) => (
                    <TableRow key={currency.code}>
                      <TableCell className="font-semibold">{currency.code}</TableCell>
                      <TableCell>{currency.name}</TableCell>
                      <TableCell>{currency.symbol || '-'}</TableCell>
                      <TableCell className="text-right">
                        1 € = {currency.exchange_rate_to_eur === 1
                          ? '1.00'
                          : (1 / currency.exchange_rate_to_eur).toFixed(4)} {currency.code}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={currency.is_active ? 'success' : 'outline'} size="sm">
                          {currency.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditCurrency(currency)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteCurrencyConfirm(currency)}
                            disabled={currency.code === 'EUR'}
                            className="text-error hover:text-error hover:bg-error/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-sm text-foreground">
              <strong>Note:</strong> Exchange rates represent how many units of EUR equal 1 unit of the currency.
              For example, if 1 € = 7.5 DKK, the exchange rate is 0.134 (1/7.5).
            </p>
          </div>
        </div>
      </Card>

      {/* ML Model Training */}
      <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Auto-Categorization ML Model</h2>
        </div>
        <div className="border-t border-border pt-4">
          {categorizerStatus && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-sm text-foreground-muted">Model Status:</p>
                  <div className="flex items-center gap-1">
                    {categorizerStatus.is_trained ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-success" />
                        <span className="font-semibold text-success">Trained</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-warning" />
                        <span className="font-semibold text-warning">Not Trained</span>
                      </>
                    )}
                  </div>
                </div>

                {categorizerStatus.last_trained && (
                  <div>
                    <p className="text-sm text-foreground-muted">Last Trained:</p>
                    <p className="font-semibold text-foreground">
                      {new Date(categorizerStatus.last_trained).toLocaleString()}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-foreground-muted">Total Transactions:</p>
                  <p className="font-semibold text-foreground">{categorizerStatus.total_transactions}</p>
                </div>

                <div>
                  <p className="text-sm text-foreground-muted">Categorized:</p>
                  <p className="font-semibold text-foreground">{categorizerStatus.categorized_transactions}</p>
                </div>
              </div>

              <div className={`p-4 rounded-lg mb-4 ${
                categorizerStatus.ready_to_train
                  ? 'bg-primary/10 border border-primary/20'
                  : 'bg-warning/10 border border-warning/20'
              }`}>
                <p className="text-sm text-foreground">
                  {categorizerStatus.ready_to_train
                    ? 'You have enough categorized transactions to train the model. Training will use your existing transaction categorizations to learn and suggest categories for new transactions.'
                    : `You need at least 10 categorized transactions to train the model (currently ${categorizerStatus.categorized_transactions}). Add more transactions with categories first.`}
                </p>
              </div>

              <Button
                onClick={() => trainCategorizerMutation.mutate()}
                disabled={!categorizerStatus.ready_to_train || trainCategorizerMutation.isPending}
                className="w-full"
              >
                <Brain className="w-4 h-4 mr-2" />
                {trainCategorizerMutation.isPending
                  ? 'Training Model...'
                  : categorizerStatus.is_trained
                  ? 'Retrain Model'
                  : 'Train Model'}
              </Button>
            </>
          )}
        </div>
      </Card>

      {/* Application Information */}
      <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-foreground mb-4">Application Information</h2>
        <div className="border-t border-border pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-foreground-muted">Version</p>
              <p className="font-semibold text-foreground">2.0.0 (React + FastAPI)</p>
            </div>
            <div>
              <p className="text-sm text-foreground-muted">Database</p>
              <p className="font-semibold text-foreground">SQLite</p>
            </div>
            <div>
              <p className="text-sm text-foreground-muted">Frontend</p>
              <p className="font-semibold text-foreground">React 18 + Shadcn + TypeScript</p>
            </div>
            <div>
              <p className="text-sm text-foreground-muted">Backend</p>
              <p className="font-semibold text-foreground">FastAPI + Python</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Debug Settings */}
      <Card className="p-6 rounded-xl border border-warning/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <Bug className="w-5 h-5 text-warning" />
          <h2 className="text-lg font-semibold text-foreground">Debug Settings</h2>
          <Badge variant="outline" className="ml-auto border-warning text-warning">Development</Badge>
        </div>
        <div className="border-t border-border pt-4 space-y-4">
          <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
            <p className="text-sm text-foreground-muted">
              Debug settings are intended for development and troubleshooting.
              Enable the master debug mode to access individual debug options.
            </p>
          </div>

          {/* Master Debug Toggle */}
          <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-card hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <Terminal className="w-5 h-5 text-warning" />
              <div>
                <Label className="text-base font-medium text-foreground">Enable Debug Mode</Label>
                <p className="text-sm text-foreground-muted">Master toggle for all debug features</p>
              </div>
            </div>
            <Switch
              checked={!!settings?.debug_mode}
              onChange={(checked) => {
                updateDebugSettingMutation.mutate({ key: 'debug_mode', value: checked });
              }}
            />
          </div>

          {/* Debug Options - Only visible when debug mode is enabled */}
          {settings?.debug_mode && (
            <div className="ml-4 pl-4 border-l-2 border-warning/30 space-y-3">
              {/* Auto-recalculate balances */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label className="text-sm font-medium text-foreground">Auto-Recalculate Balances</Label>
                  <p className="text-xs text-foreground-muted">Automatically recalculate account balances on page load</p>
                </div>
                <Switch
                  checked={!!settings?.debug_auto_recalculate}
                  onChange={(checked) => {
                    updateDebugSettingMutation.mutate({ key: 'debug_auto_recalculate', value: checked });
                  }}
                />
              </div>

              {/* Show debug logs */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label className="text-sm font-medium text-foreground">Show Debug Logs</Label>
                  <p className="text-xs text-foreground-muted">Display debug information in browser console</p>
                </div>
                <Switch
                  checked={!!settings?.debug_show_logs}
                  onChange={(checked) => {
                    updateDebugSettingMutation.mutate({ key: 'debug_show_logs', value: checked });
                  }}
                />
              </div>

              {/* Log API calls */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label className="text-sm font-medium text-foreground">Log API Calls</Label>
                  <p className="text-xs text-foreground-muted">Log all API requests and responses to console</p>
                </div>
                <Switch
                  checked={!!settings?.debug_log_api_calls}
                  onChange={(checked) => {
                    updateDebugSettingMutation.mutate({ key: 'debug_log_api_calls', value: checked });
                  }}
                />
              </div>

              {/* Log transaction operations */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label className="text-sm font-medium text-foreground">Log Transaction Operations</Label>
                  <p className="text-xs text-foreground-muted">Log transaction create/update/delete operations</p>
                </div>
                <Switch
                  checked={!!settings?.debug_log_transactions}
                  onChange={(checked) => {
                    updateDebugSettingMutation.mutate({ key: 'debug_log_transactions', value: checked });
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Session Management */}
      <div className="flex justify-center">
        <Button variant="outline" size="lg" onClick={logout} className="text-error border-error hover:bg-error/10">
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>

      {/* Backup Confirmation Dialog */}
      <Dialog open={backupDialog} onOpenChange={() => setBackupDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Backup</DialogTitle>
          </DialogHeader>

          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 mb-4">
            <p className="text-foreground">
              This will create a backup of your entire financial database including all transactions,
              accounts, and settings.
            </p>
          </div>
          <p className="text-sm text-foreground-muted">
            The backup will be stored securely and can be used to restore your data if needed.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBackupDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreateBackup}
              disabled={createBackupMutation.isPending}
            >
              Create Backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Currency Dialog */}
      <Dialog
        open={currencyDialog}
        onOpenChange={() => {
          setCurrencyDialog(false);
          setEditingCurrency(null);
          resetCurrencyForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCurrency ? 'Edit Currency' : 'Add Currency'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Currency Code</label>
                <Input
                  value={currencyForm.code}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, code: e.target.value.toUpperCase() })}
                  placeholder="e.g., USD, GBP"
                  disabled={!!editingCurrency}
                  maxLength={3}
                />
                <p className="text-xs text-foreground-muted mt-1">3-letter ISO code</p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Symbol</label>
                <Input
                  value={currencyForm.symbol}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, symbol: e.target.value })}
                  placeholder="e.g., $, £, kr"
                />
                <p className="text-xs text-foreground-muted mt-1">Currency symbol (optional)</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Currency Name</label>
              <Input
                value={currencyForm.name}
                onChange={(e) => setCurrencyForm({ ...currencyForm, name: e.target.value })}
                placeholder="e.g., US Dollar, British Pound"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Exchange Rate to EUR</label>
              <Input
                type="number"
                value={currencyForm.exchange_rate_to_eur}
                onChange={(e) => setCurrencyForm({ ...currencyForm, exchange_rate_to_eur: e.target.value })}
                step="0.0001"
                min="0"
              />
              <p className="text-xs text-foreground-muted mt-1">
                How many EUR equals 1 unit of this currency (e.g., 0.134 means 1 DKK = 0.134 EUR)
              </p>
            </div>
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-xs text-foreground">
                <strong>Example:</strong> If 1 € = 7.5 DKK, then 1 DKK = 0.134 EUR<br />
                So the exchange rate should be: {currencyForm.exchange_rate_to_eur !== ''
                  ? `1 € = ${(1 / parseFloat(currencyForm.exchange_rate_to_eur || '1')).toFixed(4)} ${currencyForm.code || 'XXX'}`
                  : 'Enter rate to see conversion'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCurrencyDialog(false);
                setEditingCurrency(null);
                resetCurrencyForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitCurrency}
              disabled={createCurrencyMutation.isPending || updateCurrencyMutation.isPending}
            >
              {editingCurrency ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Currency Confirmation Dialog */}
      <Dialog open={!!deleteCurrencyConfirm} onOpenChange={() => setDeleteCurrencyConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Currency</DialogTitle>
          </DialogHeader>

          <div className="p-4 rounded-lg bg-warning/10 border border-warning/20 mb-4">
            <p className="text-foreground">
              Are you sure you want to delete <strong>{deleteCurrencyConfirm?.code}</strong> - {deleteCurrencyConfirm?.name}?
            </p>
          </div>
          <p className="text-sm text-foreground-muted">
            This currency will be deactivated and no longer available for new accounts. Existing accounts
            using this currency will not be affected.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCurrencyConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteCurrencyMutation.mutate(deleteCurrencyConfirm.code)}
              disabled={deleteCurrencyMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={userDialog} onOpenChange={() => setUserDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Username</label>
              <Input
                value={newUserForm.username}
                onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                placeholder="Enter username"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Email</label>
              <Input
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                placeholder="user@example.com (optional)"
              />
              <p className="text-xs text-foreground-muted mt-1">Optional - defaults to username@local.app</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Password</label>
              <Input
                type="password"
                value={newUserForm.password}
                onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                placeholder="Enter password (min 6 characters)"
              />
              <p className="text-xs text-foreground-muted mt-1">Minimum 6 characters</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_admin"
                checked={newUserForm.is_admin}
                onChange={(e) => setNewUserForm({ ...newUserForm, is_admin: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="is_admin" className="text-sm font-medium text-foreground cursor-pointer">
                Administrator Role
              </label>
            </div>
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-xs text-foreground">
                <strong>Note:</strong> Administrators can manage users, currencies, and all application settings.
                Regular users can only manage their own data and change their password.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialog(false)}>Cancel</Button>
            <Button
              onClick={handleSubmitUser}
              disabled={createUserMutation.isPending}
            >
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editUserDialog} onOpenChange={() => setEditUserDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Email</label>
              <Input
                type="email"
                value={editUserForm.email}
                onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                placeholder="user@example.com"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit_is_admin"
                checked={editUserForm.is_admin}
                onChange={(e) => setEditUserForm({ ...editUserForm, is_admin: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="edit_is_admin" className="text-sm font-medium text-foreground cursor-pointer">
                Administrator Role
              </label>
            </div>
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-xs text-foreground">
                <strong>Note:</strong> You cannot edit the username. To change passwords, users must use the "Change Password" section.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserDialog(false)}>Cancel</Button>
            <Button
              onClick={handleSubmitUserUpdate}
              disabled={updateUserMutation.isPending}
            >
              Update User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog open={!!deleteUserConfirm} onOpenChange={() => setDeleteUserConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
          </DialogHeader>

          <div className="p-4 rounded-lg bg-warning/10 border border-warning/20 mb-4">
            <p className="text-foreground">
              Are you sure you want to delete user <strong>{deleteUserConfirm?.username}</strong>?
            </p>
          </div>
          <p className="text-sm text-foreground-muted">
            This action cannot be undone. All user data and sessions will be permanently removed.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUserConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteUserMutation.mutate(deleteUserConfirm.id)}
              disabled={deleteUserMutation.isPending}
            >
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
