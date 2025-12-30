// Security Page - MFA, User Management, and Audit Logs
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import {
  Card,
  Button,
  Input,
  Badge,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
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
} from '../components/shadcn';
import {
  Shield,
  KeyRound,
  QrCode,
  User,
  History,
  UserPlus,
  Trash2,
} from 'lucide-react';
import { authAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

export default function SecurityPage() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tabValue, setTabValue] = useState('mfa');

  // MFA State
  const [mfaSetupDialog, setMfaSetupDialog] = useState(false);
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaQRCode, setMfaQRCode] = useState('');
  const [mfaVerifyToken, setMfaVerifyToken] = useState('');
  const [disableMfaConfirm, setDisableMfaConfirm] = useState(false);

  // User Management State
  const [userDialog, setUserDialog] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    username: '',
    password: '',
    is_admin: false,
  });
  const [, setDeleteUserConfirm] = useState<any>(null);

  // Fetch users (admin only)
  const { data: usersData = { users: [] } } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      if (!user?.is_admin) return { users: [] };
      const response = await authAPI.listUsers();
      return { users: response.data.users || [] };
    },
    enabled: !!user?.is_admin,
    initialData: { users: [] },
  });

  // Fetch login history
  const { data: loginHistoryData = [] } = useQuery({
    queryKey: ['login-history'],
    queryFn: async () => {
      const response = await authAPI.getLoginHistory();
      return response.data.history || [];
    },
    initialData: [],
  });

  // MFA Setup Mutation
  const setupMFAMutation = useMutation({
    mutationFn: () => authAPI.setupMFA(),
    onSuccess: (response) => {
      setMfaSecret(response.data.secret);
      setMfaQRCode(response.data.qr_code);
      setMfaSetupDialog(true);
    },
  });

  // MFA Enable Mutation
  const enableMFAMutation = useMutation({
    mutationFn: (token: string) => authAPI.enableMFA(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user'] });
      setMfaSetupDialog(false);
      setMfaVerifyToken('');
    },
  });

  // MFA Disable Mutation
  const disableMFAMutation = useMutation({
    mutationFn: () => authAPI.disableMFA(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user'] });
    },
  });

  // Create User Mutation
  const createUserMutation = useMutation({
    mutationFn: (data: any) => authAPI.registerUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setUserDialog(false);
      setNewUserForm({ username: '', password: '', is_admin: false });
    },
  });

  const handleSetupMFA = () => {
    setupMFAMutation.mutate();
  };

  const handleEnableMFA = () => {
    if (mfaVerifyToken.length === 6) {
      enableMFAMutation.mutate(mfaVerifyToken);
    }
  };

  const handleDisableMFA = () => {
    setDisableMfaConfirm(true);
  };

  const confirmDisableMFA = () => {
    disableMFAMutation.mutate();
    setDisableMfaConfirm(false);
  };

  const handleCreateUser = () => {
    if (!newUserForm.username || !newUserForm.password) {
      toast.error('Username and password are required');
      return;
    }
    if (newUserForm.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    createUserMutation.mutate(newUserForm);
  };

  // Calculate KPI metrics
  const totalUsers = usersData?.users?.length || 0;
  const mfaEnabledUsers = usersData?.users?.filter((u: any) => u.mfa_enabled).length || 0;
  const recentLogins = loginHistoryData?.filter((log: any) => {
    const logDate = new Date(log.timestamp);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return logDate >= yesterday;
  }).length || 0;
  const failedLogins = loginHistoryData?.filter((log: any) => !log.success).length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Security & Access Control</h1>
          <p className="text-foreground-muted">
            Manage authentication, user access, and security settings
          </p>
        </div>
        <Badge variant={user?.is_admin ? 'default' : 'outline'} className="flex items-center gap-1">
          <Shield className="w-3 h-3" />
          {user?.is_admin ? 'Administrator' : 'User'}
        </Badge>
      </div>

      {/* KPI Summary Cards */}
      {user?.is_admin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Total Users */}
          <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 opacity-5 blur-3xl rounded-full" />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-lg bg-blue-500 bg-opacity-10">
                  <User className="h-6 w-6 text-blue-500" />
                </div>
              </div>
              <div>
                <p className="text-sm text-foreground-muted mb-1">Total Users</p>
                <p className="text-2xl font-bold text-foreground">{totalUsers}</p>
              </div>
            </div>
          </Card>

          {/* MFA Enabled */}
          <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 opacity-5 blur-3xl rounded-full" />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-lg bg-emerald-500 bg-opacity-10">
                  <Shield className="h-6 w-6 text-emerald-500" />
                </div>
              </div>
              <div>
                <p className="text-sm text-foreground-muted mb-1">MFA Enabled</p>
                <p className="text-2xl font-bold text-foreground">{mfaEnabledUsers}/{totalUsers}</p>
              </div>
            </div>
          </Card>

          {/* Recent Logins */}
          <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500 opacity-5 blur-3xl rounded-full" />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-lg bg-violet-500 bg-opacity-10">
                  <History className="h-6 w-6 text-violet-500" />
                </div>
              </div>
              <div>
                <p className="text-sm text-foreground-muted mb-1">Last 24h Logins</p>
                <p className="text-2xl font-bold text-foreground">{recentLogins}</p>
              </div>
            </div>
          </Card>

          {/* Failed Logins */}
          <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500 opacity-5 blur-3xl rounded-full" />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-lg bg-rose-500 bg-opacity-10">
                  <KeyRound className="h-6 w-6 text-rose-500" />
                </div>
              </div>
              <div>
                <p className="text-sm text-foreground-muted mb-1">Failed Logins</p>
                <p className="text-2xl font-bold text-foreground">{failedLogins}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <Tabs value={tabValue} onValueChange={(value) => setTabValue(value as string)}>
          <div className="border-b border-border p-2">
            <TabsList>
              <TabsTrigger value="mfa" className="flex items-center gap-2">
                <KeyRound className="w-4 h-4" />
                Two-Factor Auth
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="w-4 h-4" />
                Login History
              </TabsTrigger>
              {user?.is_admin && (
                <TabsTrigger value="users" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  User Management
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Two-Factor Authentication Tab */}
          <TabsContent value="mfa" className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <KeyRound className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Two-Factor Authentication (2FA)</h2>
            </div>

            {setupMFAMutation.isSuccess && (
              <div className="mb-4 p-4 rounded-lg bg-success/10 border border-success/20">
                <p className="text-success">MFA setup successful! Scan the QR code with your authenticator app.</p>
              </div>
            )}

            {enableMFAMutation.isSuccess && (
              <div className="mb-4 p-4 rounded-lg bg-success/10 border border-success/20">
                <p className="text-success">Two-Factor Authentication is now enabled for your account!</p>
              </div>
            )}

            {disableMFAMutation.isSuccess && (
              <div className="mb-4 p-4 rounded-lg bg-warning/10 border border-warning/20">
                <p className="text-warning">Two-Factor Authentication has been disabled.</p>
              </div>
            )}

            <p className="text-sm text-foreground-muted mb-6">
              Two-factor authentication adds an extra layer of security to your account by
              requiring a verification code from your mobile device in addition to your password.
            </p>

            <Card className="p-4 border border-border">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-foreground">
                    Status: {user?.mfa_enabled ? 'Enabled' : 'Disabled'}
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {user?.mfa_enabled
                      ? 'Your account is protected with 2FA'
                      : 'Enable 2FA to secure your account'}
                  </p>
                </div>
                <div>
                  {!user?.mfa_enabled ? (
                    <Button
                      onClick={handleSetupMFA}
                      disabled={setupMFAMutation.isPending}
                    >
                      <QrCode className="w-4 h-4 mr-2" />
                      Setup 2FA
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={handleDisableMFA}
                      disabled={disableMFAMutation.isPending}
                      className="text-error border-error hover:bg-error/10"
                    >
                      Disable 2FA
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm text-foreground">
                <strong>Recommended Apps:</strong>
              </p>
              <ul className="text-sm text-foreground-muted mt-2 space-y-1">
                <li>• Google Authenticator (iOS, Android)</li>
                <li>• Microsoft Authenticator (iOS, Android)</li>
                <li>• Authy (iOS, Android, Desktop)</li>
              </ul>
            </div>
          </TabsContent>

          {/* Login History Tab */}
          <TabsContent value="history" className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Login History</h2>
            </div>

            <p className="text-sm text-foreground-muted mb-4">
              View recent login attempts and activity for your account
            </p>

            {Array.isArray(loginHistoryData) && loginHistoryData.length > 0 ? (
              <Card className="overflow-hidden border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(loginHistoryData) && loginHistoryData.map((log: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell>
                          {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                        </TableCell>
                        <TableCell>{log.username}</TableCell>
                        <TableCell>
                          <Badge variant={log.success ? 'success' : 'error'} size="sm">
                            {log.success ? 'Success' : 'Failed'}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.ip_address || 'N/A'}</TableCell>
                        <TableCell>
                          <span className="text-xs text-foreground-muted">
                            {log.failure_reason || log.user_agent || '-'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ) : (
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-foreground-muted">No login history available</p>
              </div>
            )}
          </TabsContent>

          {/* User Management Tab (Admin Only) */}
          {user?.is_admin && (
            <TabsContent value="users" className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">User Management</h2>
                </div>
                <Button onClick={() => setUserDialog(true)}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add User
                </Button>
              </div>

              {createUserMutation.isSuccess && (
                <div className="mb-4 p-4 rounded-lg bg-success/10 border border-success/20">
                  <p className="text-success">User created successfully!</p>
                </div>
              )}

              <p className="text-sm text-foreground-muted mb-4">
                Manage system users and their permissions
              </p>

              {usersData && Array.isArray(usersData.users) && usersData.users.length > 0 ? (
                <Card className="overflow-hidden border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>MFA</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.isArray(usersData.users) && usersData.users.map((u: any) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-semibold">{u.username}</TableCell>
                          <TableCell>{u.email}</TableCell>
                          <TableCell>
                            <Badge variant={u.role === 'admin' ? 'default' : 'outline'} size="sm">
                              {u.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.mfa_enabled ? 'success' : 'outline'} size="sm">
                              {u.mfa_enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.is_active ? 'success' : 'outline'} size="sm">
                              {u.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {u.last_login
                              ? format(new Date(u.last_login), 'MMM dd, HH:mm')
                              : 'Never'}
                          </TableCell>
                          <TableCell className="text-right">
                            {u.username !== 'admin' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteUserConfirm(u)}
                                className="text-error hover:text-error hover:bg-error/10"
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Delete
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              ) : (
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-foreground-muted">No users found</p>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </Card>

      {/* MFA Setup Dialog */}
      <Dialog open={mfaSetupDialog} onOpenChange={() => setMfaSetupDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
          </DialogHeader>

          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 mb-4">
            <p className="text-foreground">Scan this QR code with your authenticator app</p>
          </div>

          {mfaQRCode && (
            <div className="flex flex-col items-center gap-4">
              <img src={mfaQRCode} alt="MFA QR Code" className="max-w-[250px]" />

              <div className="w-full flex items-center gap-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-sm text-foreground-muted">OR</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="w-full">
                <label className="text-xs text-foreground-muted">Manual Entry Code:</label>
                <div className="mt-1 p-2 rounded-lg bg-surface border border-border text-center font-mono text-sm">
                  {mfaSecret}
                </div>
              </div>

              <div className="w-full">
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Verification Code
                </label>
                <Input
                  value={mfaVerifyToken}
                  onChange={(e) => setMfaVerifyToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                />
                <p className="text-xs text-foreground-muted mt-1">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMfaSetupDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEnableMFA}
              disabled={mfaVerifyToken.length !== 6 || enableMFAMutation.isPending}
            >
              {enableMFAMutation.isPending ? 'Verifying...' : 'Enable 2FA'}
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
              <label className="text-sm font-medium text-foreground mb-2 block">Password</label>
              <Input
                type="password"
                value={newUserForm.password}
                onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                placeholder="Enter password"
              />
              <p className="text-xs text-foreground-muted mt-1">Minimum 6 characters</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-foreground">Administrator Privileges</label>
                <p className="text-xs text-foreground-muted">
                  Administrators can manage users and access all system features
                </p>
              </div>
              <Switch
                checked={newUserForm.is_admin}
                onChange={(checked: boolean) => setNewUserForm({ ...newUserForm, is_admin: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={createUserMutation.isPending}
            >
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable MFA Confirmation Dialog */}
      <Dialog open={disableMfaConfirm} onOpenChange={() => setDisableMfaConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <p className="text-foreground-muted">
              Are you sure you want to disable Two-Factor Authentication? This will make your account less secure.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableMfaConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDisableMFA}
              disabled={disableMFAMutation.isPending}
            >
              {disableMFAMutation.isPending ? 'Disabling...' : 'Disable 2FA'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
