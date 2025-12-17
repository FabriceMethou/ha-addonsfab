// Backup & Restore Page
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  Button,
  Input,
  Badge,
  Spinner,
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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../components/shadcn';
import {
  Archive,
  RotateCcw,
  Trash2,
  HardDrive,
  Settings,
  Sparkles,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { backupsAPI } from '../services/api';
import { format } from 'date-fns';

export default function BackupPage() {
  const [tabValue, setTabValue] = useState('create');
  const [description, setDescription] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [backupSettings, setBackupSettings] = useState({
    auto_backup_enabled: true,
    retention_days: 30,
    max_backups: 50,
    compress_backups: true,
  });

  const queryClient = useQueryClient();

  // Fetch backups
  const { data: backupsData, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: async () => {
      const response = await backupsAPI.getAll();
      return response.data.backups;
    },
  });

  // Create backup mutation
  const createMutation = useMutation({
    mutationFn: (data: { backup_type: string; description: string }) => backupsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      setDescription('');
    },
  });

  // Restore backup mutation
  const restoreMutation = useMutation({
    mutationFn: (id: string) => backupsAPI.restore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      setRestoreConfirm(null);
      alert('Backup restored successfully! Please refresh the page.');
    },
  });

  // Delete backup mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => backupsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      setDeleteConfirm(null);
    },
  });

  // Fetch backup settings
  const { data: settingsData } = useQuery({
    queryKey: ['backup-settings'],
    queryFn: async () => {
      const response = await backupsAPI.getSettings();
      setBackupSettings(response.data.settings);
      return response.data;
    },
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: (data: any) => backupsAPI.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
      alert('Backup settings updated successfully!');
    },
  });

  // Cleanup mutation
  const cleanupMutation = useMutation({
    mutationFn: () => backupsAPI.cleanup(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
      alert('Backup cleanup completed!');
    },
  });

  const handleCreateBackup = () => {
    createMutation.mutate({
      backup_type: 'manual',
      description: description || 'Manual backup',
    });
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm:ss');
    } catch {
      return dateString;
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-foreground">Backup & Restore</h1>
      </div>

      <Tabs value={tabValue} onValueChange={(value) => setTabValue(value as string)}>
        <TabsList>
          <TabsTrigger value="create" className="flex items-center gap-2">
            <Archive className="w-4 h-4" />
            Create Backup
          </TabsTrigger>
          <TabsTrigger value="restore" className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Restore
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            Backup History
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Create Backup Tab */}
        <TabsContent value="create">
          <Card className="p-6 mt-4">
            <h2 className="text-lg font-semibold text-foreground mb-2">Create New Backup</h2>
            <p className="text-sm text-foreground-muted mb-6">
              Create a backup of your entire database including all transactions, accounts, and settings.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Backup Description (Optional)
                </label>
                <textarea
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Before major update"
                  rows={3}
                />
              </div>
              <div className="flex items-start">
                <Button
                  onClick={handleCreateBackup}
                  disabled={createMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  <Archive className="w-4 h-4 mr-2" />
                  {createMutation.isPending ? 'Creating...' : 'Create Backup'}
                </Button>
              </div>
            </div>

            {createMutation.isSuccess && (
              <div className="mt-4 p-4 rounded-lg bg-success/10 border border-success/20">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-semibold">Backup Created Successfully!</span>
                </div>
                <p className="text-sm text-foreground-muted mt-1">
                  Your backup has been created and is available in the Backup History tab.
                </p>
              </div>
            )}

            {createMutation.isError && (
              <div className="mt-4 p-4 rounded-lg bg-error/10 border border-error/20">
                <p className="text-error">Failed to create backup. Please try again.</p>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Restore Tab */}
        <TabsContent value="restore">
          <div className="mt-4 space-y-4">
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-semibold">Warning: Restoring a backup will replace your current database.</span>
              </div>
              <p className="text-sm text-foreground-muted mt-1">
                A pre-restore backup will be automatically created before restoration.
              </p>
            </div>

            {backupsData && backupsData.length > 0 ? (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backupsData.map((backup: any) => (
                      <TableRow key={backup.id}>
                        <TableCell>
                          <Badge variant="outline">#{backup.id}</Badge>
                        </TableCell>
                        <TableCell>{formatDate(backup.timestamp)}</TableCell>
                        <TableCell>
                          <Badge variant={backup.type === 'manual' ? 'default' : 'info'}>
                            {backup.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatSize(backup.size_bytes)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-foreground-muted truncate max-w-[200px] block">
                            {backup.description || '-'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="warning"
                            onClick={() => setRestoreConfirm(backup)}
                          >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            Restore
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ) : (
              <div className="text-center py-16">
                <HardDrive className="w-20 h-20 text-foreground-muted mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground-muted mb-2">No Backups Available</h3>
                <p className="text-sm text-foreground-muted">
                  Create your first backup in the 'Create Backup' tab
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Backup History Tab */}
        <TabsContent value="history">
          <div className="mt-4">
            {backupsData && backupsData.length > 0 ? (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Transactions</TableHead>
                      <TableHead>Accounts</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backupsData.map((backup: any) => (
                      <TableRow key={backup.id}>
                        <TableCell>
                          <Badge variant="outline">#{backup.id}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(backup.timestamp)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={backup.type === 'manual' ? 'default' : 'info'}
                            className="flex items-center gap-1 w-fit"
                          >
                            {backup.type === 'auto' && <CheckCircle className="w-3 h-3" />}
                            {backup.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{formatSize(backup.size_bytes)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{backup.stats?.transactions || '?'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{backup.stats?.accounts || '?'}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-foreground-muted truncate max-w-[200px] block">
                            {backup.description || '-'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteConfirm(backup)}
                            className="text-error hover:text-error hover:bg-error/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ) : (
              <div className="text-center py-16">
                <HardDrive className="w-20 h-20 text-foreground-muted mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground-muted mb-2">No Backup History</h3>
                <p className="text-sm text-foreground-muted mb-6">
                  Your backup history will appear here after creating backups
                </p>
                <Button onClick={() => setTabValue('create')}>Create First Backup</Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <div className="mt-4 space-y-6">
            {/* Automation Settings */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Backup Automation Settings</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Auto Backup Enabled
                  </label>
                  <Select
                    value={backupSettings.auto_backup_enabled ? 'yes' : 'no'}
                    onValueChange={(value) =>
                      setBackupSettings({
                        ...backupSettings,
                        auto_backup_enabled: value === 'yes',
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Enabled</SelectItem>
                      <SelectItem value="no">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Retention Days
                  </label>
                  <Input
                    type="number"
                    value={backupSettings.retention_days}
                    onChange={(e) =>
                      setBackupSettings({
                        ...backupSettings,
                        retention_days: parseInt(e.target.value) || 30,
                      })
                    }
                  />
                  <p className="text-xs text-foreground-muted mt-1">
                    Delete auto backups older than this many days
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Max Backups
                  </label>
                  <Input
                    type="number"
                    value={backupSettings.max_backups}
                    onChange={(e) =>
                      setBackupSettings({
                        ...backupSettings,
                        max_backups: parseInt(e.target.value) || 50,
                      })
                    }
                  />
                  <p className="text-xs text-foreground-muted mt-1">
                    Maximum number of backups to keep
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Compress Backups
                  </label>
                  <Select
                    value={backupSettings.compress_backups ? 'yes' : 'no'}
                    onValueChange={(value) =>
                      setBackupSettings({
                        ...backupSettings,
                        compress_backups: value === 'yes',
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Enabled (Gzip)</SelectItem>
                      <SelectItem value="no">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-sm text-foreground">
                  <strong>Auto-Backup Schedule:</strong> Automatic backups run every 24 hours when enabled.
                  Manual backups and pre-restore backups are never deleted automatically.
                </p>
              </div>

              <Button
                onClick={() => updateSettingsMutation.mutate(backupSettings)}
                disabled={updateSettingsMutation.isPending}
                className="w-full mt-4"
              >
                Save Settings
              </Button>
            </Card>

            {/* Statistics */}
            {settingsData?.statistics && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Backup Statistics</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cleanupMutation.mutate()}
                    disabled={cleanupMutation.isPending}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Run Cleanup Now
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  <div>
                    <p className="text-sm text-foreground-muted">Total Backups</p>
                    <p className="text-xl font-bold text-foreground">
                      {settingsData.statistics.total_backups}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-foreground-muted">Total Size</p>
                    <p className="text-xl font-bold text-foreground">
                      {settingsData.statistics.total_size_mb} MB
                    </p>
                  </div>

                  {settingsData.statistics.by_type && (
                    <>
                      <div>
                        <p className="text-sm text-foreground-muted">Manual</p>
                        <p className="text-xl font-bold text-foreground">
                          {settingsData.statistics.by_type.manual || 0}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-foreground-muted">Auto</p>
                        <p className="text-xl font-bold text-foreground">
                          {settingsData.statistics.by_type.auto || 0}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-foreground-muted">Pre-Restore</p>
                        <p className="text-xl font-bold text-foreground">
                          {settingsData.statistics.by_type.pre_restore || 0}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {settingsData.statistics.oldest_backup && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-sm text-foreground-muted">
                      Oldest Backup: {format(new Date(settingsData.statistics.oldest_backup), 'MMM dd, yyyy HH:mm')}
                    </p>
                    <p className="text-sm text-foreground-muted">
                      Newest Backup: {format(new Date(settingsData.statistics.newest_backup), 'MMM dd, yyyy HH:mm')}
                    </p>
                  </div>
                )}
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Restore Confirmation Dialog */}
      <Dialog open={!!restoreConfirm} onOpenChange={() => setRestoreConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Confirm Restore
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
              <p className="font-semibold text-warning">
                This action will replace your current database!
              </p>
              <p className="text-sm text-foreground-muted mt-1">
                A pre-restore backup will be automatically created before proceeding.
              </p>
            </div>

            {restoreConfirm && (
              <div>
                <p className="font-medium text-foreground mb-2">Backup Details:</p>
                <ul className="text-sm text-foreground-muted space-y-1 pl-4">
                  <li>ID: #{restoreConfirm.id}</li>
                  <li>Date: {formatDate(restoreConfirm.timestamp)}</li>
                  <li>Type: {restoreConfirm.type}</li>
                  <li>Size: {formatSize(restoreConfirm.size_bytes)}</li>
                  {restoreConfirm.description && (
                    <li>Description: {restoreConfirm.description}</li>
                  )}
                </ul>
              </div>
            )}

            <p className="text-error font-semibold">Are you sure you want to proceed?</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="warning"
              onClick={() => restoreMutation.mutate(restoreConfirm.id)}
              disabled={restoreMutation.isPending}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {restoreMutation.isPending ? 'Restoring...' : 'Restore Backup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Backup</DialogTitle>
          </DialogHeader>

          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-foreground">
              Are you sure you want to delete backup #{deleteConfirm?.id}?
            </p>
            <p className="text-sm text-foreground-muted mt-1">
              {deleteConfirm?.description || formatDate(deleteConfirm?.timestamp)}
            </p>
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
