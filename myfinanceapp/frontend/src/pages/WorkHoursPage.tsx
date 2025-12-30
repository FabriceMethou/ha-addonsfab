// Work Hours Calculator Page
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import {
  Plus,
  Pencil,
  Trash2,
  Clock,
  Calculator,
  AlertTriangle,
  Info,
  TrendingUp,
  TrendingDown,
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
import { workProfilesAPI, accountsAPI } from '../services/api';

export default function WorkHoursPage() {
  const toast = useToast();
  const [tabValue, setTabValue] = useState<number | string>(0);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [calculatorAmount, setCalculatorAmount] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState<number | null>(null);
  const [calculationResult, setCalculationResult] = useState<any>(null);

  const [formData, setFormData] = useState({
    owner_id: '',
    monthly_salary: '',
    working_hours_per_month: '',
    currency: 'EUR',
    tax_rate: '0',
  });

  const queryClient = useQueryClient();

  // Fetch work profiles
  const { data: profilesData, isLoading } = useQuery({
    queryKey: ['work-profiles'],
    queryFn: async () => {
      const response = await workProfilesAPI.getAll();
      return response.data.work_profiles;
    },
  });

  // Fetch owners (from accounts API)
  const { data: ownersData } = useQuery({
    queryKey: ['owners'],
    queryFn: async () => {
      const response = await accountsAPI.getOwners();
      return response.data.owners;
    },
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: (data: any) => workProfilesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-profiles'] });
      setOpenDialog(false);
      resetForm();
      setEditingProfile(null);
      toast.success(editingProfile ? 'Work profile updated successfully!' : 'Work profile created successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to save work profile:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to save work profile: ${errorMessage}`);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (ownerId: number) => workProfilesAPI.delete(ownerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-profiles'] });
      setDeleteConfirm(null);
      toast.success('Work profile deleted successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to delete work profile:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to delete work profile: ${errorMessage}`);
    },
  });

  const resetForm = () => {
    setFormData({
      owner_id: '',
      monthly_salary: '',
      working_hours_per_month: '',
      currency: 'EUR',
      tax_rate: '0',
    });
  };

  const handleEdit = (profile: any) => {
    setEditingProfile(profile);
    setFormData({
      owner_id: profile.owner_id.toString(),
      monthly_salary: profile.monthly_salary.toString(),
      working_hours_per_month: profile.working_hours_per_month.toString(),
      currency: profile.currency || 'EUR',
      tax_rate: profile.tax_rate?.toString() || '0',
    });
    setOpenDialog(true);
  };

  const handleSubmit = () => {
    const data = {
      owner_id: parseInt(formData.owner_id),
      monthly_salary: parseFloat(formData.monthly_salary),
      working_hours_per_month: parseFloat(formData.working_hours_per_month),
      currency: formData.currency,
      tax_rate: parseFloat(formData.tax_rate),
    };
    saveMutation.mutate(data);
  };

  const handleCalculate = async () => {
    if (!calculatorAmount || !selectedOwnerId) return;

    try {
      const amount = parseFloat(calculatorAmount);
      const response = await workProfilesAPI.calculate(amount, selectedOwnerId);
      setCalculationResult(response.data);
    } catch (error) {
      console.error('Calculation failed:', error);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'EUR') => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  // Calculate KPI metrics
  const totalProfiles = profilesData?.length || 0;
  const avgHourlyRate =
    totalProfiles > 0
      ? profilesData.reduce((sum: number, p: any) => sum + p.hourly_rate, 0) / totalProfiles
      : 0;
  const highestRate =
    totalProfiles > 0 ? Math.max(...profilesData.map((p: any) => p.hourly_rate)) : 0;
  const lowestRate =
    totalProfiles > 0 ? Math.min(...profilesData.map((p: any) => p.hourly_rate)) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Work Hours Calculator</h1>
        <p className="text-foreground-muted">
          {totalProfiles} profile{totalProfiles !== 1 ? 's' : ''} • Calculate the cost of purchases in working time
        </p>
      </div>

      {/* KPI Summary Cards */}
      {totalProfiles > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Total Profiles */}
          <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 opacity-5 blur-3xl rounded-full" />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-lg bg-blue-500 bg-opacity-10">
                  <Clock className="h-6 w-6 text-blue-500" />
                </div>
              </div>
              <div>
                <p className="text-sm text-foreground-muted mb-1">Total Profiles</p>
                <p className="text-2xl font-bold text-foreground">{totalProfiles}</p>
              </div>
            </div>
          </Card>

          {/* Average Hourly Rate */}
          <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500 opacity-5 blur-3xl rounded-full" />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-lg bg-cyan-500 bg-opacity-10">
                  <Calculator className="h-6 w-6 text-cyan-500" />
                </div>
              </div>
              <div>
                <p className="text-sm text-foreground-muted mb-1">Average Rate</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(avgHourlyRate)}/h</p>
              </div>
            </div>
          </Card>

          {/* Highest Rate */}
          <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 opacity-5 blur-3xl rounded-full" />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-lg bg-emerald-500 bg-opacity-10">
                  <TrendingUp className="h-6 w-6 text-emerald-500" />
                </div>
              </div>
              <div>
                <p className="text-sm text-foreground-muted mb-1">Highest Rate</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(highestRate)}/h</p>
              </div>
            </div>
          </Card>

          {/* Lowest Rate */}
          <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500 opacity-5 blur-3xl rounded-full" />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-lg bg-violet-500 bg-opacity-10">
                  <TrendingDown className="h-6 w-6 text-violet-500" />
                </div>
              </div>
              <div>
                <p className="text-sm text-foreground-muted mb-1">Lowest Rate</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(lowestRate)}/h</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Info Alert */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/10 text-primary">
        <Info className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <p className="text-sm">
          Calculate how many work hours your expenses cost you. Set up your work profile to see the
          real cost of any purchase in working time.
        </p>
      </div>

      <Tabs value={tabValue} onValueChange={setTabValue}>
        <TabsList>
          <TabsTrigger value={0}>
            <Calculator className="h-4 w-4 mr-2" />
            Calculator
          </TabsTrigger>
          <TabsTrigger value={1}>
            <Clock className="h-4 w-4 mr-2" />
            Work Profiles
          </TabsTrigger>
        </TabsList>

        {/* Calculator Tab */}
        <TabsContent value={0}>
          {profilesData && profilesData.length > 0 ? (
            <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Select Owner</Label>
                  <Select
                    value={selectedOwnerId?.toString() || ''}
                    onValueChange={(value) => {
                      setSelectedOwnerId(Number(value));
                      setCalculationResult(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {profilesData.map((profile: any) => (
                        <SelectItem key={profile.owner_id} value={profile.owner_id.toString()}>
                          {profile.owner_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedOwnerId && (
                  <>
                    <div className="md:col-span-2">
                      <div className="flex gap-2 flex-wrap">
                        {(() => {
                          const profile = profilesData.find((p: any) => p.owner_id === selectedOwnerId);
                          return (
                            <>
                              <Badge variant="default">
                                Monthly Salary: {formatCurrency(profile?.monthly_salary, profile?.currency)}
                              </Badge>
                              <Badge variant="secondary">
                                Working Hours/Month: {profile?.working_hours_per_month}h
                              </Badge>
                              <Badge variant="success">
                                Hourly Rate: {formatCurrency(profile?.hourly_rate, profile?.currency)}
                              </Badge>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-3 space-y-2">
                        <Label htmlFor="amount">Amount</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted">
                            EUR
                          </span>
                          <Input
                            id="amount"
                            type="number"
                            value={calculatorAmount}
                            onChange={(e) => setCalculatorAmount(e.target.value)}
                            placeholder="1500.00"
                            className="pl-12"
                          />
                        </div>
                      </div>
                      <div className="flex items-end">
                        <Button
                          onClick={handleCalculate}
                          disabled={!calculatorAmount}
                          className="w-full"
                        >
                          Calculate
                        </Button>
                      </div>
                    </div>

                    {calculationResult && (
                      <div className="md:col-span-2">
                        <Card className="p-6 bg-success/20 border-success">
                          <h3 className="text-lg font-semibold text-foreground mb-4">Results</h3>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div>
                              <p className="text-sm text-foreground-muted">Work Hours</p>
                              <p className="text-2xl font-bold text-foreground">
                                {calculationResult.work_hours.toFixed(1)}h
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-foreground-muted">Work Days</p>
                              <p className="text-2xl font-bold text-foreground">
                                {calculationResult.work_days.toFixed(1)} days
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-foreground-muted">Work Weeks</p>
                              <p className="text-2xl font-bold text-foreground">
                                {calculationResult.work_weeks.toFixed(2)} weeks
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-foreground-muted">Minutes</p>
                              <p className="text-2xl font-bold text-foreground">
                                {calculationResult.minutes.toFixed(0)} min
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 p-3 rounded-lg bg-background/50">
                            <p className="text-sm">
                              {calculationResult.work_hours < 1
                                ? `This costs you ${calculationResult.minutes.toFixed(0)} minutes of work`
                                : calculationResult.work_hours < 8
                                ? `This costs you ${calculationResult.work_hours.toFixed(
                                    1
                                  )} hours - That's ${((calculationResult.work_hours / 8) * 100).toFixed(
                                    0
                                  )}% of a workday`
                                : calculationResult.work_days < 5
                                ? `This costs you ${calculationResult.work_days.toFixed(
                                    1
                                  )} workdays - Almost ${calculationResult.work_weeks.toFixed(1)} weeks of work`
                                : `This costs you ${calculationResult.work_weeks.toFixed(1)} weeks of work`}
                            </p>
                          </div>
                        </Card>
                      </div>
                    )}

                    {/* Quick Reference */}
                    <div className="md:col-span-2">
                      <h3 className="text-lg font-semibold text-foreground mb-3">Quick Reference</h3>
                      <div className="flex gap-2 flex-wrap">
                        {[100, 500, 1000, 5000].map((amt) => {
                          const profile = profilesData.find((p: any) => p.owner_id === selectedOwnerId);
                          const hours = amt / (profile?.hourly_rate || 1);
                          return (
                            <Badge key={amt} variant="outline">
                              {formatCurrency(amt, profile?.currency)} = {hours.toFixed(1)}h
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
              <Clock className="h-20 w-20 text-foreground-muted mb-4" />
              <h3 className="text-lg font-semibold text-foreground-muted mb-2">
                No Work Profiles Configured
              </h3>
              <p className="text-foreground-muted mb-4">
                Set up your work profile in the 'Work Profiles' tab first
              </p>
              <Button onClick={() => setTabValue(1)}>Go to Work Profiles</Button>
            </div>
          )}
        </TabsContent>

        {/* Work Profiles Tab */}
        <TabsContent value={1}>
          <div className="mb-4 flex justify-end">
            <Button
              onClick={() => {
                setEditingProfile(null);
                resetForm();
                setOpenDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Profile
            </Button>
          </div>

          {profilesData && profilesData.length > 0 ? (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-right">Monthly Salary</TableHead>
                    <TableHead className="text-right">Hours/Month</TableHead>
                    <TableHead className="text-right">Hourly Rate</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profilesData.map((profile: any) => (
                    <TableRow key={profile.owner_id}>
                      <TableCell className="font-medium">{profile.owner_name}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(profile.monthly_salary, profile.currency)}
                      </TableCell>
                      <TableCell className="text-right">{profile.working_hours_per_month}h</TableCell>
                      <TableCell className="text-right text-success font-bold">
                        {formatCurrency(profile.hourly_rate, profile.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(profile)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirm(profile)}
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
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[200px] text-center">
              <p className="text-foreground-muted">
                No work profiles yet. Create your first profile to start calculating work hours.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog
        open={openDialog}
        onOpenChange={(open) => {
          setOpenDialog(open);
          if (!open) {
            setEditingProfile(null);
            resetForm();
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editingProfile ? 'Edit Work Profile' : 'Add Work Profile'}</DialogTitle>
            <DialogDescription>
              {editingProfile
                ? 'Update your work profile details.'
                : 'Create a new work profile to calculate work hours.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select
                value={formData.owner_id}
                onValueChange={(value) => setFormData({ ...formData, owner_id: value })}
                disabled={!!editingProfile}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {ownersData?.map((owner: any) => (
                    <SelectItem key={owner.id} value={owner.id.toString()}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="salary">Monthly Salary (Net)</Label>
                <Input
                  id="salary"
                  type="number"
                  step="0.01"
                  value={formData.monthly_salary}
                  onChange={(e) => setFormData({ ...formData, monthly_salary: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hours">Working Hours/Month</Label>
                <Input
                  id="hours"
                  type="number"
                  value={formData.working_hours_per_month}
                  onChange={(e) => setFormData({ ...formData, working_hours_per_month: e.target.value })}
                />
                <p className="text-xs text-foreground-muted">e.g., 160 hours</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['EUR', 'USD', 'GBP', 'DKK', 'SEK', 'CHF'].map((curr) => (
                      <SelectItem key={curr} value={curr}>
                        {curr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxRate">Tax Rate % (Optional)</Label>
                <Input
                  id="taxRate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={formData.tax_rate}
                  onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpenDialog(false);
                setEditingProfile(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saveMutation.isPending}>
              {editingProfile ? 'Update' : 'Create'}
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
                Are you sure you want to delete the work profile for "{deleteConfirm?.owner_name}"?
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(deleteConfirm.owner_id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
