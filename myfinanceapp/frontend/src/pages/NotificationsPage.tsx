// Notifications Settings Page
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  Button,
  Input,
  Badge,
  Spinner,
  Switch,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../components/shadcn';
import {
  Mail,
  Bell,
  Send,
  History,
  Shield,
  Eye,
  EyeOff,
} from 'lucide-react';
import { alertsAPI } from '../services/api';
import { format } from 'date-fns';

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [testEmail, setTestEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Fetch alert configuration
  const { data: config, isLoading } = useQuery({
    queryKey: ['alert-config'],
    queryFn: async () => {
      const response = await alertsAPI.getConfig();
      return response.data;
    },
  });

  // Fetch alert history
  const { data: historyData } = useQuery({
    queryKey: ['alert-history'],
    queryFn: async () => {
      const response = await alertsAPI.getHistory(50);
      return response.data.history;
    },
  });

  // Email settings form state
  const [emailForm, setEmailForm] = useState({
    smtp_server: '',
    smtp_port: 587,
    username: '',
    password: '',
    from_email: '',
    to_email: '',
  });

  // Threshold form state
  const [thresholdForm, setThresholdForm] = useState({
    daily_spending: 0,
    budget_percentage: 90,
    anomaly_detection: true,
  });

  // Initialize forms when config loads
  useEffect(() => {
    if (config) {
      setEmailForm({
        smtp_server: config.email?.smtp_server || '',
        smtp_port: config.email?.smtp_port || 587,
        username: config.email?.username || '',
        password: '', // Don't populate password
        from_email: config.email?.from_email || '',
        to_email: config.email?.to_email || '',
      });
      setThresholdForm({
        daily_spending: config.thresholds?.daily_spending || 0,
        budget_percentage: config.thresholds?.budget_percentage || 90,
        anomaly_detection: config.thresholds?.anomaly_detection ?? true,
      });
      setTestEmail(config.email?.to_email || '');
    }
  }, [config]);

  // Update email settings mutation
  const updateEmailMutation = useMutation({
    mutationFn: (data: any) => alertsAPI.updateEmailSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-config'] });
    },
  });

  // Update thresholds mutation
  const updateThresholdsMutation = useMutation({
    mutationFn: (data: any) => alertsAPI.updateThresholds(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-config'] });
    },
  });

  // Test email mutation
  const testEmailMutation = useMutation({
    mutationFn: (email: string) => alertsAPI.sendTestEmail(email),
  });

  // Disable email mutation
  const disableEmailMutation = useMutation({
    mutationFn: () => alertsAPI.disableEmail(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-config'] });
    },
  });

  const handleSaveEmailSettings = () => {
    updateEmailMutation.mutate(emailForm);
  };

  const handleSaveThresholds = () => {
    updateThresholdsMutation.mutate(thresholdForm);
  };

  const handleTestEmail = () => {
    if (testEmail.trim()) {
      testEmailMutation.mutate(testEmail);
    }
  };

  const handleDisableEmail = () => {
    if (window.confirm('Are you sure you want to disable email notifications?')) {
      disableEmailMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const emailEnabled = config?.email?.enabled || false;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Notification Settings</h1>
          <p className="text-sm text-foreground-muted">
            Configure email alerts and notification preferences
          </p>
        </div>
        <Badge variant={emailEnabled ? 'success' : 'outline'} className="flex items-center gap-1">
          <Bell className="w-3 h-3" />
          {emailEnabled ? 'Notifications Enabled' : 'Notifications Disabled'}
        </Badge>
      </div>

      {/* Email Configuration */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Email Configuration</h2>
        </div>

        {updateEmailMutation.isSuccess && (
          <div className="mb-4 p-4 rounded-lg bg-success/10 border border-success/20">
            <p className="text-success">Email settings saved successfully!</p>
          </div>
        )}
        {updateEmailMutation.isError && (
          <div className="mb-4 p-4 rounded-lg bg-error/10 border border-error/20">
            <p className="text-error">Failed to save email settings. Please check your configuration.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-3">
            <label className="text-sm font-medium text-foreground mb-2 block">SMTP Server</label>
            <Input
              value={emailForm.smtp_server}
              onChange={(e) => setEmailForm({ ...emailForm, smtp_server: e.target.value })}
              placeholder="smtp.gmail.com"
            />
            <p className="text-xs text-foreground-muted mt-1">Your email provider's SMTP server address</p>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">SMTP Port</label>
            <Input
              type="number"
              value={emailForm.smtp_port}
              onChange={(e) => setEmailForm({ ...emailForm, smtp_port: parseInt(e.target.value) })}
            />
            <p className="text-xs text-foreground-muted mt-1">Usually 587 or 465</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Username</label>
            <Input
              value={emailForm.username}
              onChange={(e) => setEmailForm({ ...emailForm, username: e.target.value })}
              placeholder="your-email@example.com"
            />
            <p className="text-xs text-foreground-muted mt-1">Your email account username</p>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Password</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={emailForm.password}
                onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
                className="pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-foreground-muted mt-1">App password or account password</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">From Email</label>
            <Input
              value={emailForm.from_email}
              onChange={(e) => setEmailForm({ ...emailForm, from_email: e.target.value })}
              placeholder="finance-tracker@example.com"
            />
            <p className="text-xs text-foreground-muted mt-1">Email address to send from</p>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">To Email</label>
            <Input
              value={emailForm.to_email}
              onChange={(e) => setEmailForm({ ...emailForm, to_email: e.target.value })}
              placeholder="your-email@example.com"
            />
            <p className="text-xs text-foreground-muted mt-1">Email address to receive alerts</p>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <Button
            onClick={handleSaveEmailSettings}
            disabled={updateEmailMutation.isPending}
          >
            {updateEmailMutation.isPending ? 'Saving...' : 'Save Email Settings'}
          </Button>
          {emailEnabled && (
            <Button
              variant="outline"
              onClick={handleDisableEmail}
              disabled={disableEmailMutation.isPending}
              className="text-error border-error hover:bg-error/10"
            >
              Disable Notifications
            </Button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Alert Thresholds */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Alert Thresholds</h2>
          </div>

          {updateThresholdsMutation.isSuccess && (
            <div className="mb-4 p-4 rounded-lg bg-success/10 border border-success/20">
              <p className="text-success">Thresholds updated successfully!</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Daily Spending Limit</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted">€</span>
                <Input
                  type="number"
                  value={thresholdForm.daily_spending}
                  onChange={(e) =>
                    setThresholdForm({ ...thresholdForm, daily_spending: parseFloat(e.target.value) })
                  }
                  className="pl-8"
                />
              </div>
              <p className="text-xs text-foreground-muted mt-1">Alert when daily spending exceeds this amount (0 = disabled)</p>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Budget Warning Percentage</label>
              <div className="relative">
                <Input
                  type="number"
                  value={thresholdForm.budget_percentage}
                  onChange={(e) =>
                    setThresholdForm({ ...thresholdForm, budget_percentage: parseInt(e.target.value) })
                  }
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted">%</span>
              </div>
              <p className="text-xs text-foreground-muted mt-1">Alert when budget reaches this percentage</p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <label className="text-sm font-medium text-foreground">Anomaly Detection</label>
                <p className="text-xs text-foreground-muted">
                  Alert on unusual spending patterns
                </p>
              </div>
              <Switch
                checked={thresholdForm.anomaly_detection}
                onChange={(checked: boolean) =>
                  setThresholdForm({ ...thresholdForm, anomaly_detection: checked })
                }
              />
            </div>
          </div>

          <Button
            onClick={handleSaveThresholds}
            disabled={updateThresholdsMutation.isPending}
            className="w-full mt-4"
          >
            {updateThresholdsMutation.isPending ? 'Saving...' : 'Save Thresholds'}
          </Button>
        </Card>

        {/* Test Email */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Send className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Test Email</h2>
          </div>

          {testEmailMutation.isSuccess && (
            <div className="mb-4 p-4 rounded-lg bg-success/10 border border-success/20">
              <p className="text-success">Test email sent successfully! Check your inbox.</p>
            </div>
          )}
          {testEmailMutation.isError && (
            <div className="mb-4 p-4 rounded-lg bg-error/10 border border-error/20">
              <p className="text-error">Failed to send test email. Please verify your settings.</p>
            </div>
          )}

          <div className="mb-4">
            <label className="text-sm font-medium text-foreground mb-2 block">Test Email Address</label>
            <Input
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@example.com"
            />
            <p className="text-xs text-foreground-muted mt-1">Send a test email to verify your configuration</p>
          </div>

          <Button
            onClick={handleTestEmail}
            disabled={testEmailMutation.isPending || !testEmail.trim()}
            className="w-full"
          >
            <Send className="w-4 h-4 mr-2" />
            {testEmailMutation.isPending ? 'Sending...' : 'Send Test Email'}
          </Button>

          {!emailEnabled && (
            <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm text-foreground">
                Save your email settings above to enable notifications
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Alert History */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Alert History</h2>
        </div>

        {historyData && historyData.length > 0 ? (
          <Card className="overflow-hidden border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyData.map((alert: any, index: number) => (
                  <TableRow key={index}>
                    <TableCell>
                      {format(new Date(alert.timestamp), 'MMM dd, yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" size="sm">{alert.type}</Badge>
                    </TableCell>
                    <TableCell>{alert.message}</TableCell>
                    <TableCell>
                      <Badge
                        variant={alert.status === 'sent' ? 'success' : 'error'}
                        size="sm"
                      >
                        {alert.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-foreground-muted">No alert history available yet</p>
          </div>
        )}
      </Card>

      {/* Help Information */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Email Setup Guide</h2>
        </div>

        <div className="space-y-4">
          <div>
            <p className="font-medium text-foreground mb-2">Gmail Users:</p>
            <div className="text-sm text-foreground-muted space-y-1 pl-4">
              <p>1. Enable 2-factor authentication on your Google account</p>
              <p>2. Generate an App Password at: myaccount.google.com/apppasswords</p>
              <p>3. Use <code className="bg-surface px-1 py-0.5 rounded">smtp.gmail.com</code> as the SMTP server with port 587</p>
              <p>4. Use your app password (not your regular password)</p>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="font-medium text-foreground mb-2">Other Providers:</p>
            <p className="text-sm text-foreground-muted">
              Check your email provider's documentation for SMTP settings. Common providers include
              Outlook (smtp-mail.outlook.com:587), Yahoo (smtp.mail.yahoo.com:587), and others.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
