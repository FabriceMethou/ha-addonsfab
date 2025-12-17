// Investments Page - Portfolio Tracking and Real-Time Prices
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  LineChart,
  Landmark,
  RefreshCw,
  AlertTriangle,
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '../components/shadcn';
import { investmentsAPI, accountsAPI } from '../services/api';
import { format, parseISO } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

// Colors for pie charts
const PORTFOLIO_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

interface SecurityFormData {
  symbol: string;
  name: string;
  investment_type: string;
  isin: string;
  exchange: string;
  currency: string;
  sector: string;
  country: string;
  notes: string;
}

interface HoldingFormData {
  security_id: string;
  account_id: string;
  quantity: string;
  purchase_price: string;
  purchase_date: string;
  notes: string;
}

interface TransactionFormData {
  holding_id: string;
  transaction_type: string;
  quantity: string;
  price: string;
  transaction_date: string;
  notes: string;
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

export default function InvestmentsPage() {
  const [tabValue, setTabValue] = useState<number | string>(0);
  const [holdingDialog, setHoldingDialog] = useState(false);
  const [transactionDialog, setTransactionDialog] = useState(false);
  const [securityDialog, setSecurityDialog] = useState(false);
  const [editingHolding, setEditingHolding] = useState<any>(null);
  const [editingSecurity, setEditingSecurity] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);

  const [holdingForm, setHoldingForm] = useState<HoldingFormData>({
    security_id: '',
    account_id: '',
    quantity: '',
    purchase_price: '',
    purchase_date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  });
  
  const [securityForm, setSecurityForm] = useState<SecurityFormData>({
    symbol: '',
    name: '',
    investment_type: 'stock',
    isin: '',
    exchange: '',
    currency: 'EUR',
    sector: '',
    country: '',
    notes: '',
  });
  
  const [lookingUpISIN, setLookingUpISIN] = useState(false);

  const [transactionForm, setTransactionForm] = useState<TransactionFormData>({
    holding_id: '',
    transaction_type: 'buy',
    quantity: '',
    price: '',
    transaction_date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  });

  const handleSecurityISINLookup = async () => {
    const isin = securityForm.isin.trim();
    
    if (!isin) {
      alert('Please enter an ISIN code');
      return;
    }

    // Validate ISIN format (12 alphanumeric characters)
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) {
      alert('Invalid ISIN format. ISIN should be 12 characters: 2 letters + 9 alphanumeric + 1 digit');
      return;
    }

    setLookingUpISIN(true);
    try {
      const response = await investmentsAPI.lookupISIN(isin);
      const data = response.data;

      if (data.success && data.symbol) {
        setSecurityForm({
          ...securityForm,
          symbol: data.symbol || securityForm.symbol,
          name: data.name || securityForm.name,
          investment_type: data.investment_type || securityForm.investment_type,
          exchange: data.exchange || securityForm.exchange,
          currency: data.currency || securityForm.currency,
        });
        alert('✅ ISIN lookup successful! Security details have been filled in.');
      } else {
        alert('❌ ISIN lookup failed: No data found for this ISIN');
      }
    } catch (error: any) {
      console.error('ISIN lookup failed:', error);
      
      // Provide more specific error messages
      if (error.response?.status === 400) {
        alert('❌ ISIN lookup failed: ' + (error.response?.data?.detail || 'Invalid ISIN or API error'));
      } else if (error.response?.status === 401) {
        alert('❌ ISIN lookup failed: Authentication required. Please login.');
      } else if (error.response?.status === 429) {
        alert('❌ ISIN lookup failed: API rate limit exceeded. Please try again later.');
      } else {
        alert('❌ ISIN lookup failed: ' + (error.response?.data?.detail || 'Unknown error occurred'));
      }
    } finally {
      setLookingUpISIN(false);
    }
  };

  const queryClient = useQueryClient();

  // Fetch securities
  const { data: securitiesData } = useQuery({
    queryKey: ['investments-securities'],
    queryFn: async () => {
      const response = await investmentsAPI.getSecurities();
      return response.data.securities;
    },
  });

  // Fetch investment accounts
  const { data: investmentAccounts, error: accountsError, isLoading: accountsLoading } = useQuery<any, any>({
    queryKey: ['investment-accounts'],
    queryFn: async () => {
      try {
        const response = await accountsAPI.getAll();
        
        if (!response || !response.data || !response.data.accounts) {
          throw new Error('Invalid API response format - missing accounts array');
        }
        
        const allAccounts = response.data.accounts;
        
        if (!Array.isArray(allAccounts)) {
          throw new Error('Accounts data is not an array');
        }
        
        const investmentAccounts = allAccounts.filter(account => 
          account.account_type === 'investment'
        );
        
        return investmentAccounts;
      } catch (error: any) {
        const err = error as any;
        console.error('Detailed error in accounts query:', {
          message: err?.message,
          stack: err?.stack,
          response: err?.response?.data,
          status: err?.response?.status
        });
        throw err;
      }
    },
    retry: 3, // Retry failed requests up to 3 times
  });

  // Fetch holdings
  const { data: holdingsData, isLoading: holdingsLoading } = useQuery({
    queryKey: ['investments-holdings'],
    queryFn: async () => {
      const response = await investmentsAPI.getHoldings();
      return response.data.holdings;
    },
  });

  // Fetch summary
  const { data: summaryData } = useQuery({
    queryKey: ['investments-summary'],
    queryFn: async () => {
      const response = await investmentsAPI.getSummary();
      return response.data;
    },
  });

  // Fetch transactions
  const { data: transactionsData } = useQuery({
    queryKey: ['investments-transactions'],
    queryFn: async () => {
      const response = await investmentsAPI.getTransactions();
      return response.data.transactions;
    },
  });

  // Create security mutation
  const createSecurityMutation = useMutation({
    mutationFn: (data: any) => investmentsAPI.createSecurity(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-securities'] });
      setSecurityDialog(false);
      resetSecurityForm();
    },
  });

  // Update security mutation
  const updateSecurityMutation = useMutation({
    mutationFn: ({ id, data }: any) => investmentsAPI.updateSecurity(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-securities'] });
      queryClient.invalidateQueries({ queryKey: ['investments-holdings'] });
      setSecurityDialog(false);
      resetSecurityForm();
      setEditingSecurity(null);
    },
  });

  // Delete security mutation
  const deleteSecurityMutation = useMutation({
    mutationFn: (id: number) => investmentsAPI.deleteSecurity(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-securities'] });
      setDeleteConfirm(null);
      alert('Security deleted successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to delete security:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      alert(`Failed to delete security: ${errorMessage}`);
    },
  });

  // Create holding mutation
  const createHoldingMutation = useMutation({
    mutationFn: (data: any) => investmentsAPI.createHolding(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['investments-summary'] });
      
      // Show success message
      alert('Holding created successfully!');
      
      setHoldingDialog(false);
      resetHoldingForm();
    },
    onError: (error: any) => {
      console.error('Failed to create holding:', error);
      alert(`Failed to create holding: ${error?.response?.data?.detail || error?.message || 'Unknown error'}`);
    }
  });

  // Update holding mutation
  const updateHoldingMutation = useMutation({
    mutationFn: ({ id, data }: any) => investmentsAPI.updateHolding(id, data),
    onSuccess: () => {
      // Invalidate and refetch the queries
      queryClient.invalidateQueries({ queryKey: ['investments-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['investments-summary'] });
      
      // Show success message
      alert('Holding updated successfully!');
      
      // Give a brief moment for the data to refresh before closing
      setTimeout(() => {
        setHoldingDialog(false);
        resetHoldingForm();
        setEditingHolding(null);
      }, 300);
    },
    onError: (error: any) => {
      console.error('Failed to update holding:', error);
      alert(`Failed to update holding: ${error?.response?.data?.detail || error?.message || 'Unknown error'}`);
    }
  });

  // Delete holding mutation
  const deleteHoldingMutation = useMutation({
    mutationFn: (id: number) => investmentsAPI.deleteHolding(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['investments-summary'] });
      setDeleteConfirm(null);
      alert('Holding deleted successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to delete holding:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      alert(`Failed to delete holding: ${errorMessage}`);
    },
  });

  // Create transaction mutation
  const createTransactionMutation = useMutation({
    mutationFn: (data: any) => investmentsAPI.createTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['investments-summary'] });
      queryClient.invalidateQueries({ queryKey: ['investments-transactions'] });
      setTransactionDialog(false);
      resetTransactionForm();
    },
  });

  // Update single holding price mutation
  const updateHoldingPriceMutation = useMutation({
    mutationFn: (holdingId: number) => investmentsAPI.updateHoldingPrice(holdingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['investments-summary'] });
    },
  });

  // Update all prices mutation
  const updateAllPricesMutation = useMutation({
    mutationFn: () => investmentsAPI.updateAllPrices(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['investments-summary'] });
    },
  });

  const resetSecurityForm = () => {
    setSecurityForm({
      symbol: '',
      name: '',
      investment_type: 'stock',
      isin: '',
      exchange: '',
      currency: 'EUR',
      sector: '',
      country: '',
      notes: '',
    });
  };

  const resetHoldingForm = () => {
    setHoldingForm({
      security_id: '',
      account_id: '',
      quantity: '',
      purchase_price: '',
      purchase_date: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    });
  };

  const resetTransactionForm = () => {
    setTransactionForm({
      holding_id: '',
      transaction_type: 'buy',
      quantity: '',
      price: '',
      transaction_date: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    });
  };

  const handleEditSecurity = (security: any) => {
    setEditingSecurity(security);
    setSecurityForm({
      symbol: security.symbol,
      name: security.name,
      investment_type: security.investment_type,
      isin: security.isin || '',
      exchange: security.exchange || '',
      currency: security.currency || 'EUR',
      sector: security.sector || '',
      country: security.country || '',
      notes: security.notes || '',
    });
    setSecurityDialog(true);
  };

  const handleEditHolding = (holding: any) => {
    setEditingHolding(holding);
    setHoldingForm({
      security_id: holding.security_id.toString(),
      account_id: holding.account_id.toString(),
      quantity: holding.quantity.toString(),
      purchase_price: holding.average_cost.toString(),
      purchase_date: holding.purchase_date || format(new Date(), 'yyyy-MM-dd'),
      notes: holding.notes || '',
    });
    setHoldingDialog(true);
  };

  const handleSubmitSecurity = () => {
    const data = {
      symbol: securityForm.symbol,
      name: securityForm.name,
      investment_type: securityForm.investment_type,
      isin: securityForm.isin || undefined,
      exchange: securityForm.exchange || undefined,
      currency: securityForm.currency,
      sector: securityForm.sector || undefined,
      country: securityForm.country || undefined,
      notes: securityForm.notes || undefined,
    };

    if (editingSecurity) {
      updateSecurityMutation.mutate({ id: editingSecurity.id, data });
    } else {
      createSecurityMutation.mutate(data);
    }
  };

  const handleSubmitHolding = () => {
    // Validate required fields
    if (!holdingForm.account_id) {
      alert('Please select an investment account');
      return;
    }
    
    if (!holdingForm.security_id) {
      alert('Please select a security');
      return;
    }
    
    if (!holdingForm.quantity || isNaN(parseFloat(holdingForm.quantity))) {
      alert('Please enter a valid quantity');
      return;
    }
    
    if (!holdingForm.purchase_price || isNaN(parseFloat(holdingForm.purchase_price))) {
      alert('Please enter a valid purchase price');
      return;
    }
    
    if (!holdingForm.purchase_date) {
      alert('Please enter a purchase date');
      return;
    }

    const data = {
      security_id: parseInt(holdingForm.security_id),
      account_id: parseInt(holdingForm.account_id),
      quantity: parseFloat(holdingForm.quantity),
      purchase_price: parseFloat(holdingForm.purchase_price),
      purchase_date: holdingForm.purchase_date,
      notes: holdingForm.notes,
    };

    console.log('Submitting holding data:', data);

    if (editingHolding) {
      console.log('Updating holding ID:', editingHolding.id);
      updateHoldingMutation.mutate({ id: editingHolding.id, data });
    } else {
      console.log('Creating new holding');
      createHoldingMutation.mutate(data);
    }
  };

  const handleSubmitTransaction = () => {
    const data = {
      holding_id: parseInt(transactionForm.holding_id),
      transaction_type: transactionForm.transaction_type,
      quantity: parseFloat(transactionForm.quantity),
      price: parseFloat(transactionForm.price),
      transaction_date: transactionForm.transaction_date,
      notes: transactionForm.notes,
    };

    createTransactionMutation.mutate(data);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  if (holdingsLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const totalValue = summaryData?.total_value || 0;
  const totalCost = summaryData?.total_cost || 0;
  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-foreground">Investment Portfolio</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => updateAllPricesMutation.mutate()}
            disabled={updateAllPricesMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${updateAllPricesMutation.isPending ? 'animate-spin' : ''}`} />
            {updateAllPricesMutation.isPending ? 'Updating...' : 'Update All Prices'}
          </Button>
          <Button
            onClick={() => {
              setEditingHolding(null);
              resetHoldingForm();
              setHoldingDialog(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Holding
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Landmark className="h-5 w-5 text-primary" />
            <span className="text-sm text-foreground-muted">Total Value</span>
          </div>
          <p className="text-xl font-bold text-primary">{formatCurrency(totalValue)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <LineChart className="h-5 w-5 text-info" />
            <span className="text-sm text-foreground-muted">Total Cost</span>
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(totalCost)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            {totalGainLoss >= 0 ? (
              <TrendingUp className="h-5 w-5 text-success" />
            ) : (
              <TrendingDown className="h-5 w-5 text-error" />
            )}
            <span className="text-sm text-foreground-muted">Gain/Loss</span>
          </div>
          <p className={`text-xl font-bold ${totalGainLoss >= 0 ? 'text-success' : 'text-error'}`}>
            {formatCurrency(totalGainLoss)}
          </p>
          <span className="text-xs text-foreground-muted">
            {totalGainLossPercent >= 0 ? '+' : ''}
            {totalGainLossPercent.toFixed(2)}%
          </span>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <LineChart className="h-5 w-5 text-foreground-muted" />
            <span className="text-sm text-foreground-muted">Holdings</span>
          </div>
          <p className="text-xl font-bold text-foreground">
            {summaryData?.holdings_count || holdingsData?.length || 0}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-success" />
            <span className="text-sm text-foreground-muted">Total Dividends</span>
          </div>
          <p className="text-xl font-bold text-success">{formatCurrency(summaryData?.total_dividends || 0)}</p>
          <span className="text-xs text-foreground-muted">
            12M: {formatCurrency(summaryData?.recent_dividends_12m || 0)}
          </span>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Landmark className="h-5 w-5 text-info" />
            <span className="text-sm text-foreground-muted">Dividend Yield</span>
          </div>
          <p className="text-xl font-bold text-info">{(summaryData?.dividend_yield || 0).toFixed(2)}%</p>
          <span className="text-xs text-foreground-muted">Annual yield</span>
        </Card>
      </div>

      {/* Portfolio Allocation Charts */}
      {holdingsData && holdingsData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Allocation by Symbol</h2>
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={holdingsData.map((holding: any, index: number) => ({
                    key: `pie-data-${index}`,
                    name: holding.symbol,
                    value: holding.current_value || (holding.quantity * (holding.current_price || holding.average_cost || 0)),
                  }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(entry) => `${entry.name}: ${((entry.value / totalValue) * 100).toFixed(1)}%`}
                >
                  {holdingsData.map((_holding: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatCurrency(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Allocation by Type</h2>
            {summaryData?.allocation_by_type && summaryData.allocation_by_type.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={summaryData.allocation_by_type}
                    dataKey="value"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry) => `${entry.type}: ${entry.percentage.toFixed(1)}%`}
                  >
                    {summaryData.allocation_by_type.map((_item: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-foreground-muted">No allocation data available</p>
            )}
          </Card>
        </div>
      )}

      {/* Top Holdings */}
      {holdingsData && holdingsData.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Top Holdings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {holdingsData
              .sort((a: any, b: any) => {
                const aValue = a.current_value || (a.quantity * (a.current_price || a.average_cost || 0));
                const bValue = b.current_value || (b.quantity * (b.current_price || b.average_cost || 0));
                return bValue - aValue;
              })
              .slice(0, 10)
              .map((holding: any) => {
                const currentValue = holding.current_value || (holding.quantity * (holding.current_price || holding.average_cost || 0));
                const costBasis = holding.quantity * (holding.average_cost || 0);
                const gainLoss = currentValue - costBasis;
                const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
                const percentage = (currentValue / totalValue) * 100;

                return (
                  <div key={holding.id} className="p-4 rounded-lg border border-border bg-surface">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-foreground">{holding.symbol}</span>
                      <Badge variant="outline">{percentage.toFixed(1)}%</Badge>
                    </div>
                    <p className="text-xs text-foreground-muted truncate mb-2">{holding.name}</p>
                    <p className="text-lg font-bold text-foreground">{formatCurrency(currentValue)}</p>
                    <p className={`text-xs ${gainLoss >= 0 ? 'text-success' : 'text-error'}`}>
                      {gainLoss >= 0 ? '+' : ''}
                      {formatCurrency(gainLoss)} ({gainLossPercent.toFixed(2)}%)
                    </p>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Tabs */}
      <Card className="p-6">
        <Tabs value={tabValue} onValueChange={setTabValue}>
          <TabsList>
            <TabsTrigger value={0}>Securities</TabsTrigger>
            <TabsTrigger value={1}>Holdings</TabsTrigger>
            <TabsTrigger value={2}>Transactions</TabsTrigger>
          </TabsList>

          {/* Securities Tab */}
          <TabsContent value={0}>
            <div className="flex justify-end mb-4">
              <Button
                onClick={() => {
                  setEditingSecurity(null);
                  resetSecurityForm();
                  setSecurityDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Security
              </Button>
            </div>

            {securitiesData && securitiesData.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>ISIN</TableHead>
                      <TableHead>Exchange</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {securitiesData.map((security: any) => (
                      <TableRow key={security.id}>
                        <TableCell className="font-semibold">{security.symbol}</TableCell>
                        <TableCell>{security.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{security.investment_type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{security.isin || '-'}</TableCell>
                        <TableCell>{security.exchange || '-'}</TableCell>
                        <TableCell>{security.currency}</TableCell>
                        <TableCell>{security.sector || '-'}</TableCell>
                        <TableCell>{security.country || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEditSecurity(security)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirm(security)}
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
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[300px]">
                <LineChart className="h-20 w-20 text-foreground-muted mb-4" />
                <h2 className="text-xl font-semibold text-foreground-muted mb-2">No Securities Yet</h2>
                <p className="text-sm text-foreground-muted mb-6">
                  Add securities to your master list to easily create holdings
                </p>
                <Button
                  onClick={() => {
                    setEditingSecurity(null);
                    resetSecurityForm();
                    setSecurityDialog(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Security
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Holdings Tab */}
          <TabsContent value={1}>
            {holdingsData && holdingsData.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Avg Cost</TableHead>
                      <TableHead className="text-right">Current Price</TableHead>
                      <TableHead className="text-right">Current Value</TableHead>
                      <TableHead className="text-right">Gain/Loss</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holdingsData.map((holding: any) => {
                      const currentValue = holding.quantity * (holding.current_price || holding.average_cost);
                      const costBasis = holding.quantity * holding.average_cost;
                      const gainLoss = currentValue - costBasis;
                      const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

                      return (
                        <TableRow key={holding.id}>
                          <TableCell className="font-semibold">{holding.symbol}</TableCell>
                          <TableCell>{holding.name}</TableCell>
                          <TableCell>{holding.account_name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{holding.investment_type}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{holding.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(holding.average_cost)}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(holding.current_price || holding.average_cost)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(currentValue)}</TableCell>
                          <TableCell className={`text-right font-semibold ${gainLoss >= 0 ? 'text-success' : 'text-error'}`}>
                            {formatCurrency(gainLoss)}
                            <span className="block text-xs">
                              ({gainLossPercent >= 0 ? '+' : ''}
                              {gainLossPercent.toFixed(2)}%)
                            </span>
                          </TableCell>
                          <TableCell>
                            {holding.last_price_update ? (
                              <span className="text-xs text-foreground-muted">
                                {format(parseISO(holding.last_price_update), 'MMM dd, yyyy HH:mm')}
                              </span>
                            ) : (
                              <span className="text-xs text-foreground-muted">Never</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => updateHoldingPriceMutation.mutate(holding.id)}
                                disabled={updateHoldingPriceMutation.isPending}
                                className="text-success hover:text-success"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleEditHolding(holding)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirm(holding)}
                                className="text-error hover:text-error"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[300px]">
                <LineChart className="h-20 w-20 text-foreground-muted mb-4" />
                <h2 className="text-xl font-semibold text-foreground-muted mb-2">No Holdings Yet</h2>
                <p className="text-sm text-foreground-muted mb-6">
                  Add your first investment holding to track your portfolio
                </p>
                <Button
                  onClick={() => {
                    setEditingHolding(null);
                    resetHoldingForm();
                    setHoldingDialog(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Holding
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value={2}>
            <div className="flex justify-end mb-4">
              <Button
                onClick={() => {
                  resetTransactionForm();
                  setTransactionDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Transaction
              </Button>
            </div>

            {transactionsData && transactionsData.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactionsData.map((transaction: any) => (
                      <TableRow key={transaction.id}>
                        <TableCell>{formatDate(transaction.transaction_date)}</TableCell>
                        <TableCell className="font-semibold">{transaction.symbol}</TableCell>
                        <TableCell>
                          <Badge variant={transaction.transaction_type === 'buy' ? 'success' : 'destructive'}>
                            {transaction.transaction_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{transaction.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(transaction.price)}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(transaction.quantity * transaction.price)}
                        </TableCell>
                        <TableCell>{transaction.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-foreground-muted text-center py-8">No transactions yet</p>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {/* Add/Edit Security Dialog */}
      <Dialog open={securityDialog} onOpenChange={setSecurityDialog}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editingSecurity ? 'Edit Security' : 'Add Security'}</DialogTitle>
            <DialogDescription>
              {editingSecurity ? 'Update security details in your master list.' : 'Add a new security to your master list for easy holding creation.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="securitySymbol">Symbol</Label>
                <Input
                  id="securitySymbol"
                  value={securityForm.symbol}
                  onChange={(e) => setSecurityForm({ ...securityForm, symbol: e.target.value.toUpperCase() })}
                  placeholder="e.g., AAPL, MSFT"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="securityName">Name</Label>
                <Input
                  id="securityName"
                  value={securityForm.name}
                  onChange={(e) => setSecurityForm({ ...securityForm, name: e.target.value })}
                  placeholder="e.g., Apple Inc."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={securityForm.investment_type}
                  onValueChange={(value) => setSecurityForm({ ...securityForm, investment_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock">Stock</SelectItem>
                    <SelectItem value="etf">ETF</SelectItem>
                    <SelectItem value="bond">Bond</SelectItem>
                    <SelectItem value="crypto">Cryptocurrency</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="securityISIN">
                  ISIN (Optional)
                  <span className="text-xs text-foreground-muted ml-1">
                    12-character code (e.g., US0378331005)
                  </span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="securityISIN"
                    value={securityForm.isin}
                    onChange={(e) => setSecurityForm({ ...securityForm, isin: e.target.value.toUpperCase() })}
                    placeholder="e.g., US0378331005"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSecurityISINLookup}
                    disabled={lookingUpISIN}
                  >
                    {lookingUpISIN ? <Spinner size="sm" /> : 'Lookup'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="securityExchange">Exchange (Optional)</Label>
                <Input
                  id="securityExchange"
                  value={securityForm.exchange}
                  onChange={(e) => setSecurityForm({ ...securityForm, exchange: e.target.value })}
                  placeholder="e.g., NASDAQ, NYSE"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select
                  value={securityForm.currency}
                  onValueChange={(value) => setSecurityForm({ ...securityForm, currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="CHF">CHF</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="securitySector">Sector (Optional)</Label>
                <Input
                  id="securitySector"
                  value={securityForm.sector}
                  onChange={(e) => setSecurityForm({ ...securityForm, sector: e.target.value })}
                  placeholder="e.g., Technology, Finance"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="securityCountry">Country (Optional)</Label>
                <Input
                  id="securityCountry"
                  value={securityForm.country}
                  onChange={(e) => setSecurityForm({ ...securityForm, country: e.target.value })}
                  placeholder="e.g., United States, Germany"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="securityNotes">Notes (Optional)</Label>
              <Textarea
                id="securityNotes"
                value={securityForm.notes}
                onChange={(e) => setSecurityForm({ ...securityForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSecurityDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitSecurity}
              disabled={createSecurityMutation.isPending || updateSecurityMutation.isPending}
            >
              {editingSecurity ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Holding Dialog */}
      <Dialog open={holdingDialog} onOpenChange={setHoldingDialog}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editingHolding ? 'Edit Holding' : 'Add Holding'}</DialogTitle>
            <DialogDescription>
              {editingHolding ? 'Update your investment holding details.' : 'Add a new investment to your portfolio by selecting from your securities list.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Security</Label>
              <Select
                value={holdingForm.security_id}
                onValueChange={(value) => setHoldingForm({ ...holdingForm, security_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a security" />
                </SelectTrigger>
                <SelectContent>
                  {securitiesData?.map((security: any) => (
                    <SelectItem key={security.id} value={security.id.toString()}>
                      {security.symbol} - {security.name} ({security.investment_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setHoldingDialog(false);
                    setSecurityDialog(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Security
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Investment Account</Label>
              <Select
                value={holdingForm.account_id}
                onValueChange={(value) => setHoldingForm({ ...holdingForm, account_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select investment account" />
                </SelectTrigger>
                <SelectContent>
                  {investmentAccounts?.map((account: any) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name} ({account.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accountsLoading ? (
                <p className="text-sm text-info mt-2">
                  Loading investment accounts...
                </p>
              ) : accountsError ? (
                <div className="text-sm text-error mt-2 p-2 bg-error/10 rounded">
                  <p className="font-medium">Failed to load accounts</p>
                  <p className="text-xs mt-1">
                    {accountsError.message.includes('Network Error') ? 'Network error - cannot connect to server' : 
                     accountsError.message.includes('401') ? 'Authentication failed - please log in again' : 
                     accountsError.message || 'Unknown error'}
                  </p>
                  <p className="text-xs mt-1">Error code: {accountsError.response?.status || 'N/A'}</p>
                </div>
              ) : (!investmentAccounts || investmentAccounts.length === 0) ? (
                <p className="text-sm text-warning mt-2">
                  No investment accounts found. Please create an investment account first.
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={holdingForm.quantity}
                  onChange={(e) => setHoldingForm({ ...holdingForm, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchasePrice">Purchase Price</Label>
                <Input
                  id="purchasePrice"
                  type="number"
                  value={holdingForm.purchase_price}
                  onChange={(e) => setHoldingForm({ ...holdingForm, purchase_price: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="purchaseDate">Purchase Date</Label>
                <Input
                  id="purchaseDate"
                  type="date"
                  value={holdingForm.purchase_date}
                  onChange={(e) => setHoldingForm({ ...holdingForm, purchase_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="holdingNotes">Notes (Optional)</Label>
                <Input
                  id="holdingNotes"
                  value={holdingForm.notes}
                  onChange={(e) => setHoldingForm({ ...holdingForm, notes: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldingDialog(false)} disabled={createHoldingMutation.isPending || updateHoldingMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitHolding}
              disabled={createHoldingMutation.isPending || updateHoldingMutation.isPending}
            >
              {createHoldingMutation.isPending || updateHoldingMutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {editingHolding ? 'Updating...' : 'Adding...'}
                </>
              ) : (
                editingHolding ? 'Update' : 'Add'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Transaction Dialog */}
      <Dialog open={transactionDialog} onOpenChange={setTransactionDialog}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Holding</Label>
              <Select
                value={transactionForm.holding_id}
                onValueChange={(value) => setTransactionForm({ ...transactionForm, holding_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a holding" />
                </SelectTrigger>
                <SelectContent>
                  {holdingsData?.map((holding: any) => (
                    <SelectItem key={holding.id} value={holding.id?.toString() || ''}>
                      {holding.symbol} - {holding.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Transaction Type</Label>
                <Select
                  value={transactionForm.transaction_type}
                  onValueChange={(value) => setTransactionForm({ ...transactionForm, transaction_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                    <SelectItem value="dividend">Dividend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="txDate">Transaction Date</Label>
                <Input
                  id="txDate"
                  type="date"
                  value={transactionForm.transaction_date}
                  onChange={(e) => setTransactionForm({ ...transactionForm, transaction_date: e.target.value })}
                />
              </div>
            </div>

            {transactionForm.transaction_type !== 'dividend' && (
              <div className="space-y-2">
                <Label htmlFor="txQuantity">Quantity</Label>
                <Input
                  id="txQuantity"
                  type="number"
                  value={transactionForm.quantity}
                  onChange={(e) => setTransactionForm({ ...transactionForm, quantity: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="txPrice">
                {transactionForm.transaction_type === 'dividend' ? 'Dividend Amount' : 'Price per Unit'}
              </Label>
              <Input
                id="txPrice"
                type="number"
                step="0.01"
                value={transactionForm.price}
                onChange={(e) => setTransactionForm({ ...transactionForm, price: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="txNotes">Notes (Optional)</Label>
              <Input
                id="txNotes"
                value={transactionForm.notes}
                onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitTransaction} disabled={createTransactionMutation.isPending}>
              Add Transaction
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
                {deleteConfirm?.security_id ? (
                  <>Are you sure you want to delete the holding "{deleteConfirm?.symbol}"? This will also delete all related transactions.</>
                ) : (
                  <>Are you sure you want to delete the security "{deleteConfirm?.symbol}"? This will prevent you from creating new holdings for this security.</>
                )}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm?.security_id) {
                  // Items with security_id are holdings (it's a foreign key)
                  deleteHoldingMutation.mutate(deleteConfirm.id);
                } else {
                  // Items without security_id are securities
                  deleteSecurityMutation.mutate(deleteConfirm.id);
                }
              }}
              disabled={deleteSecurityMutation.isPending || deleteHoldingMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
