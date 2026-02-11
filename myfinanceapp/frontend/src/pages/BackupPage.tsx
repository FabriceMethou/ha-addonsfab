// Backup & Restore Page
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import {
  Card,
  Button,
  Input,
  Badge,
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
  DialogDescription,
  DialogFooter,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  StatSkeleton,
  TableSkeleton,
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
  Download,
  Upload,
  Cloud,
  CloudUpload,
  RefreshCw,
} from 'lucide-react';
import { backupsAPI } from '../services/api';
import { format } from 'date-fns';

export default function BackupPage() {
  const toast = useToast();
  const [tabValue, setTabValue] = useState('create');
  const [description, setDescription] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [backupSettings, setBackupSettings] = useState({
    auto_backup_enabled: true,
    retention_days: 30,
    max_backups: 50,
    compress_backups: true,
  });
  const [cloudConfig, setCloudConfig] = useState({
    webdav_url: '',
    username: '',
    remote_path: '/backups/',
    enabled: false,
  });
  const [cloudBackups, setCloudBackups] = useState<string[]>([]);

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
      toast.success('Backup created successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to create backup:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to create backup: ${errorMessage}`);
    },
  });

  // Upload backup mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => backupsAPI.upload(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      setSelectedFile(null);
      toast.success('Backup imported successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to upload backup:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to upload backup: ${errorMessage}`);
    },
  });

  // Restore backup mutation
  const restoreMutation = useMutation({
    mutationFn: (id: string) => backupsAPI.restore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      setRestoreConfirm(null);
      toast.success('Backup restored successfully! Please refresh the page.');
    },
    onError: (error: any) => {
      console.error('Failed to restore backup:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to restore backup: ${errorMessage}`);
    },
  });

  // Delete backup mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => backupsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      setDeleteConfirm(null);
      toast.success('Backup deleted successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to delete backup:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to delete backup: ${errorMessage}`);
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
      toast.success('Backup settings updated successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to update backup settings:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to update backup settings: ${errorMessage}`);
    },
  });

  // Cleanup mutation
  const cleanupMutation = useMutation({
    mutationFn: () => backupsAPI.cleanup(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
      toast.success('Backup cleanup completed!');
    },
    onError: (error: any) => {
      console.error('Failed to cleanup backups:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to cleanup backups: ${errorMessage}`);
    },
  });

  // Fetch cloud config
  useQuery({
    queryKey: ['cloud-config'],
    queryFn: async () => {
      const response = await backupsAPI.getCloudConfig();
      setCloudConfig(response.data);
      return response.data;
    },
  });

  // Update cloud config mutation
  const updateCloudConfigMutation = useMutation({
    mutationFn: (data: any) => backupsAPI.updateCloudConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-config'] });
      toast.success('Cloud backup configuration updated successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to update cloud config:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to update cloud config: ${errorMessage}`);
    },
  });

  // List cloud backups mutation
  const listCloudBackupsMutation = useMutation({
    mutationFn: () => backupsAPI.listCloudBackups(),
    onSuccess: (response) => {
      setCloudBackups(response.data.backups || []);
      toast.success('Cloud backups loaded successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to list cloud backups:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to list cloud backups: ${errorMessage}`);
    },
  });

  // Sync to cloud mutation
  const syncToCloudMutation = useMutation({
    mutationFn: (backupId: string) => backupsAPI.syncToCloud(backupId),
    onSuccess: () => {
      toast.success('Backup synced to cloud successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to sync to cloud:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to sync to cloud: ${errorMessage}`);
    },
  });

  const handleCreateBackup = () => {
    createMutation.mutate({
      backup_type: 'manual',
      description: description || 'Manual backup',
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file extension
      if (file.name.endsWith('.db') || file.name.endsWith('.db.gz')) {
        setSelectedFile(file);
      } else {
        toast.error('Invalid file type. Please select a .db or .db.gz file.');
        event.target.value = '';
      }
    }
  };

  const handleUploadBackup = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
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

  const handleDownloadBackup = async (backup: any) => {
    try {
      const response = await backupsAPI.download(backup.id);

      // Create a blob from the response data
      const blob = new Blob([response.data], { type: 'application/octet-stream' });

      // Create a temporary URL for the blob
      const url = window.URL.createObjectURL(blob);

      // Create a temporary anchor element and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_${backup.id}_${formatDate(backup.timestamp).replace(/[,:]/g, '-')}.db${backup.compressed ? '.gz' : ''}`;
      document.body.appendChild(link);
      link.click();

      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Failed to download backup:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to download backup: ${errorMessage}`);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <TableSkeleton rows={5} columns={6} />
        </div>
      </div>
    );
  }

  // Calculate KPI metrics
  const totalBackups = backupsData?.length || 0;
  const totalSize = backupsData?.reduce((sum: number, b: any) => sum + b.size_bytes, 0) || 0;
  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
  const autoBackups = backupsData?.filter((b: any) => b.type === 'auto').length || 0;
  const manualBackups = backupsData?.filter((b: any) => b.type === 'manual').length || 0;
  const latestBackup = backupsData && backupsData.length > 0
    ? formatDate(backupsData[0].timestamp)
    : 'N/A';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Backup & Restore</h1>
        <p className="text-foreground-muted">
          {totalBackups} backup{totalBackups !== 1 ? 's' : ''}, {totalSizeMB} MB total • Protect your financial data
        </p>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Total Backups */}
        <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 opacity-5 blur-3xl rounded-full" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-blue-500 bg-opacity-10">
                <Archive className="h-6 w-6 text-blue-500" />
              </div>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">Total Backups</p>
              <p className="text-2xl font-bold text-foreground">{totalBackups}</p>
            </div>
          </div>
        </Card>

        {/* Total Size */}
        <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500 opacity-5 blur-3xl rounded-full" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-violet-500 bg-opacity-10">
                <HardDrive className="h-6 w-6 text-violet-500" />
              </div>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">Total Size</p>
              <p className="text-2xl font-bold text-foreground">{totalSizeMB} MB</p>
            </div>
          </div>
        </Card>

        {/* Auto Backups */}
        <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 opacity-5 blur-3xl rounded-full" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-emerald-500 bg-opacity-10">
                <CheckCircle className="h-6 w-6 text-emerald-500" />
              </div>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">Auto / Manual</p>
              <p className="text-2xl font-bold text-foreground">{autoBackups} / {manualBackups}</p>
            </div>
          </div>
        </Card>

        {/* Latest Backup */}
        <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500 opacity-5 blur-3xl rounded-full" />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-cyan-500 bg-opacity-10">
                <Download className="h-6 w-6 text-cyan-500" />
              </div>
            </div>
            <div>
              <p className="text-sm text-foreground-muted mb-1">Latest Backup</p>
              <p className="text-sm font-semibold text-foreground truncate">{latestBackup}</p>
            </div>
          </div>
        </Card>
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
          <TabsTrigger value="cloud" className="flex items-center gap-2">
            <Cloud className="w-4 h-4" />
            Cloud Backup
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

          <Card className="p-6 mt-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">Import Backup</h2>
            <p className="text-sm text-foreground-muted mb-6">
              Upload an existing backup file (.db or .db.gz) to import it into your backup list.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Select Backup File
                </label>
                <input
                  type="file"
                  accept=".db,.db.gz"
                  onChange={handleFileSelect}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                />
                {selectedFile && (
                  <p className="text-sm text-foreground-muted mt-2">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>
              <div className="flex items-start">
                <Button
                  onClick={handleUploadBackup}
                  disabled={!selectedFile || uploadMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploadMutation.isPending ? 'Uploading...' : 'Import Backup'}
                </Button>
              </div>
            </div>

            {uploadMutation.isSuccess && (
              <div className="mt-4 p-4 rounded-lg bg-success/10 border border-success/20">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-semibold">Backup Imported Successfully!</span>
                </div>
                <p className="text-sm text-foreground-muted mt-1">
                  Your backup has been imported and is available in the Backup History tab.
                </p>
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
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadBackup(backup)}
                            >
                              <Download className="w-4 h-4 mr-1" />
                              Download
                            </Button>
                            <Button
                              size="sm"
                              variant="warning"
                              onClick={() => setRestoreConfirm(backup)}
                            >
                              <RotateCcw className="w-4 h-4 mr-1" />
                              Restore
                            </Button>
                          </div>
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
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDownloadBackup(backup)}
                              className="text-primary hover:text-primary hover:bg-primary/10"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteConfirm(backup)}
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

        {/* Cloud Backup Tab */}
        <TabsContent value="cloud">
          <div className="mt-4 space-y-6">
            {/* Cloud Configuration */}
            <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-foreground mb-2">WebDAV Cloud Configuration</h2>
              <p className="text-sm text-foreground-muted mb-6">
                Configure WebDAV settings to sync your backups to cloud storage (Nextcloud, ownCloud, etc.)
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    WebDAV URL
                  </label>
                  <Input
                    type="url"
                    placeholder="https://cloud.example.com/remote.php/dav/files/username/"
                    value={cloudConfig.webdav_url}
                    onChange={(e) =>
                      setCloudConfig({
                        ...cloudConfig,
                        webdav_url: e.target.value,
                      })
                    }
                  />
                  <p className="text-xs text-foreground-muted mt-1">
                    Full WebDAV endpoint URL
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Username
                  </label>
                  <Input
                    type="text"
                    placeholder="username"
                    value={cloudConfig.username}
                    onChange={(e) =>
                      setCloudConfig({
                        ...cloudConfig,
                        username: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Remote Path
                  </label>
                  <Input
                    type="text"
                    placeholder="/backups/"
                    value={cloudConfig.remote_path}
                    onChange={(e) =>
                      setCloudConfig({
                        ...cloudConfig,
                        remote_path: e.target.value,
                      })
                    }
                  />
                  <p className="text-xs text-foreground-muted mt-1">
                    Folder path on the WebDAV server
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Enable Cloud Backup
                  </label>
                  <Select
                    value={cloudConfig.enabled ? 'yes' : 'no'}
                    onValueChange={(value) =>
                      setCloudConfig({
                        ...cloudConfig,
                        enabled: value === 'yes',
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
              </div>

              <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-sm text-foreground">
                  <strong>Security Note:</strong> The password must be set via the <code className="bg-background px-2 py-1 rounded">WEBDAV_PASSWORD</code> environment variable on the backend server. This ensures credentials are never stored in the database.
                </p>
              </div>

              <Button
                onClick={() => updateCloudConfigMutation.mutate(cloudConfig)}
                disabled={updateCloudConfigMutation.isPending}
                className="w-full mt-4"
              >
                <Cloud className="w-4 h-4 mr-2" />
                Save Cloud Configuration
              </Button>
            </Card>

            {/* Cloud Backup Actions */}
            <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-foreground mb-2">Cloud Backup Operations</h2>
              <p className="text-sm text-foreground-muted mb-6">
                View remote backups and sync local backups to the cloud
              </p>

              <div className="flex gap-4 mb-6">
                <Button
                  onClick={() => listCloudBackupsMutation.mutate()}
                  disabled={listCloudBackupsMutation.isPending || !cloudConfig.enabled}
                  variant="outline"
                  className="flex-1"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${listCloudBackupsMutation.isPending ? 'animate-spin' : ''}`} />
                  {listCloudBackupsMutation.isPending ? 'Loading...' : 'List Remote Backups'}
                </Button>
              </div>

              {cloudBackups.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">Remote Backups:</h3>
                  <div className="space-y-2">
                    {cloudBackups.map((backup: string, index: number) => (
                      <div key={index} className="p-3 rounded-lg bg-background border border-border flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Cloud className="w-4 h-4 text-primary" />
                          <span className="text-sm text-foreground font-medium">{backup}</span>
                        </div>
                        <Badge variant="outline">Remote</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {cloudBackups.length === 0 && listCloudBackupsMutation.isSuccess && (
                <div className="text-center py-8">
                  <Cloud className="w-16 h-16 text-foreground-muted mx-auto mb-3" />
                  <p className="text-sm text-foreground-muted">No remote backups found</p>
                </div>
              )}
            </Card>

            {/* Sync Local Backups */}
            {backupsData && backupsData.length > 0 && (
              <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                <h2 className="text-lg font-semibold text-foreground mb-2">Sync Local Backups to Cloud</h2>
                <p className="text-sm text-foreground-muted mb-6">
                  Upload your local backups to the configured WebDAV server
                </p>

                <div className="space-y-2">
                  {backupsData.slice(0, 10).map((backup: any) => (
                    <div key={backup.id} className="p-3 rounded-lg bg-background border border-border flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Archive className="w-4 h-4 text-foreground-muted" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Backup #{backup.id} - {formatDate(backup.timestamp)}
                          </p>
                          <p className="text-xs text-foreground-muted">
                            {formatSize(backup.size_bytes)} • {backup.type}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => syncToCloudMutation.mutate(backup.id.toString())}
                        disabled={syncToCloudMutation.isPending || !cloudConfig.enabled}
                      >
                        <CloudUpload className="w-4 h-4 mr-1" />
                        Sync to Cloud
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <div className="mt-4 space-y-6">
            {/* Automation Settings */}
            <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
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
              <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
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
            <DialogDescription>
              Review the backup details before restoring your database.
            </DialogDescription>
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
            <DialogDescription className="sr-only">
              Confirm deletion of this backup file.
            </DialogDescription>
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
