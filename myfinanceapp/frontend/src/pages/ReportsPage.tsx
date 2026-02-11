// Reports Page - Financial Analytics with Modern Design
import React, { useState, useMemo } from 'react';
import { useIsMobile } from '../hooks/useBreakpoint';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  Badge,
  Spinner,
  Input,
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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Autocomplete,
  ReportsSkeleton,
} from '../components/shadcn';
import {
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Landmark,
  Tag,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  Calendar,
  Search,
  Users,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { reportsAPI, transactionsAPI, settingsAPI, accountsAPI } from '../services/api';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { formatCurrency as formatCurrencyUtil } from '../lib/utils';
import { absMoney, sumMoney, percentOf, percentChange, addMoney } from '../lib/money';

// Nivo
import { ResponsivePie } from '@nivo/pie';
import { ResponsiveSunburst } from '@nivo/sunburst';
import { ResponsiveSankey } from '@nivo/sankey';

// Enhanced KPI Card with percentage changes (matching Dashboard style)
function KPICard({ title, value, change, changeLabel, icon, iconColor, colorClass, loading }: any) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  return (
    <Card className="relative overflow-hidden p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
      {/* Background gradient effect */}
      <div className={`absolute top-0 right-0 w-32 h-32 ${iconColor} opacity-5 blur-3xl rounded-full`} />

      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-lg ${iconColor} bg-opacity-10`}>
            {icon}
          </div>
          {change !== undefined && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${
              isPositive ? 'bg-success/10 text-success' :
              isNegative ? 'bg-error/10 text-error' :
              'bg-foreground-muted/10 text-foreground-muted'
            }`}>
              {isPositive && <TrendingUp size={12} />}
              {isNegative && <TrendingDown size={12} />}
              {change > 0 ? '+' : ''}{change.toFixed(1)}%
            </div>
          )}
        </div>

        <div>
          <p className="text-sm text-foreground-muted mb-1">{title}</p>
          {loading ? (
            <div className="h-8 flex items-center">
              <Spinner className="w-5 h-5" />
            </div>
          ) : (
            <p className={`text-2xl font-bold ${colorClass || 'text-foreground'}`}>{value}</p>
          )}
          {changeLabel && (
            <p className="text-xs text-foreground-muted mt-1">{changeLabel}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function ReportsPage() {
  const isMobile = useIsMobile();
  const [currentTab, setCurrentTab] = useState('overview');
  const [dateRange, setDateRange] = useState('current_month');
  const [startDate, setStartDate] = useState(
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [trendMonths, setTrendMonths] = useState('6');
  const [trendCategory, setTrendCategory] = useState<string>('');
  const [netWorthMonths, setNetWorthMonths] = useState('12');
  const [summaryYear, setSummaryYear] = useState(new Date().getFullYear().toString());
  const [summaryMonth, setSummaryMonth] = useState((new Date().getMonth() + 1).toString());
  const [yearByYearSelected, setYearByYearSelected] = useState(new Date().getFullYear().toString());
  const [yearByYearMonth, setYearByYearMonth] = useState<string>(''); // Empty string = all year
  const [yearByYearSearch, setYearByYearSearch] = useState('');
  const [expandedIncomeCategories, setExpandedIncomeCategories] = useState<Set<string>>(new Set());
  const [expandedExpenseCategories, setExpandedExpenseCategories] = useState<Set<string>>(new Set());
  const [selectedOwner, setSelectedOwner] = useState<string>(''); // Empty = all owners

  // Handle date range selection
  const handleDateRangeChange = (range: string) => {
    setDateRange(range);
    const now = new Date();

    switch (range) {
      case 'current_month':
        setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
        break;
      case 'last_month':
        const lastMonth = subMonths(now, 1);
        setStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
        break;
      case 'last_3_months':
        setStartDate(format(subMonths(now, 3), 'yyyy-MM-dd'));
        setEndDate(format(now, 'yyyy-MM-dd'));
        break;
      case 'last_6_months':
        setStartDate(format(subMonths(now, 6), 'yyyy-MM-dd'));
        setEndDate(format(now, 'yyyy-MM-dd'));
        break;
      case 'year_to_date':
        setStartDate(format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd'));
        setEndDate(format(now, 'yyyy-MM-dd'));
        break;
    }
  };

  // Fetch owners for filter
  const { data: owners } = useQuery({
    queryKey: ['owners'],
    queryFn: async () => {
      const response = await accountsAPI.getOwners();
      return response.data.owners || [];
    },
    staleTime: 30 * 60 * 1000,
  });

  // Helper to get owner_id for API calls
  const ownerIdParam = selectedOwner ? Number(selectedOwner) : undefined;

  // Fetch data
  const { data: netWorthData, isLoading: netWorthLoading, error: netWorthError } = useQuery({
    queryKey: ['net-worth', selectedOwner],
    queryFn: async () => {
      const response = await reportsAPI.getNetWorth(ownerIdParam ? { owner_id: ownerIdParam } : undefined);
      return response.data;
    },
  });

  const { data: incomeExpensesData, isLoading: incomeExpensesLoading, error: incomeExpensesError } = useQuery({
    queryKey: ['income-expenses', startDate, endDate, selectedOwner],
    queryFn: async () => {
      const params: any = { start_date: startDate, end_date: endDate };
      if (ownerIdParam) params.owner_id = ownerIdParam;
      const response = await reportsAPI.getIncomeVsExpenses(params);
      return response.data;
    },
  });

  const { data: spendingData, isLoading: spendingLoading, error: spendingError } = useQuery({
    queryKey: ['spending-by-category', startDate, endDate, selectedOwner],
    queryFn: async () => {
      const params: any = { start_date: startDate, end_date: endDate };
      if (ownerIdParam) params.owner_id = ownerIdParam;
      const response = await reportsAPI.getSpendingByCategory(params);
      return response.data;
    },
  });

  const { data: transactionsData } = useQuery({
    queryKey: ['transactions-for-chart', startDate, endDate],
    queryFn: async () => {
      const response = await transactionsAPI.getAll({ start_date: startDate, end_date: endDate, limit: 1000 });
      return response.data.transactions;
    },
  });

  // Fetch all available tags
  const { data: allTags } = useQuery({
    queryKey: ['all-tags'],
    queryFn: async () => {
      const response = await transactionsAPI.getAllTags();
      return response.data.tags || [];
    },
  });

  // Fetch tag report data
  const { data: tagReportData, isLoading: tagReportLoading } = useQuery({
    queryKey: ['tag-report', selectedTag, startDate, endDate],
    queryFn: async () => {
      if (!selectedTag) return null;
      const response = await reportsAPI.getTagReport(selectedTag, { start_date: startDate, end_date: endDate });
      return response.data;
    },
    enabled: !!selectedTag,
  });

  // Fetch spending trends data
  const { data: spendingTrendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ['spending-trends', trendMonths, trendCategory, selectedOwner],
    queryFn: async () => {
      const response = await reportsAPI.getSpendingTrends(Number(trendMonths), trendCategory || undefined, ownerIdParam);
      return response.data;
    },
    enabled: currentTab === 'trends',
  });

  // Fetch monthly summary data
  const { data: monthlySummaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['monthly-summary', summaryYear, summaryMonth, selectedOwner],
    queryFn: async () => {
      const response = await reportsAPI.getMonthlySummary(Number(summaryYear), Number(summaryMonth), ownerIdParam);
      return response.data;
    },
    enabled: currentTab === 'monthly',
  });

  // Fetch extended net worth trend data
  const { data: extendedNetWorthData, isLoading: extendedNetWorthLoading } = useQuery({
    queryKey: ['net-worth-trend-extended', netWorthMonths, selectedOwner],
    queryFn: async () => {
      const response = await reportsAPI.getNetWorthTrend(Number(netWorthMonths), ownerIdParam);
      return response.data;
    },
    enabled: currentTab === 'networth',
  });

  // Fetch year-by-year stats
  const { data: yearByYearData, isLoading: yearByYearLoading } = useQuery({
    queryKey: ['year-by-year', yearByYearSelected, yearByYearMonth],
    queryFn: async () => {
      const month = yearByYearMonth ? Number(yearByYearMonth) : undefined;
      const response = await reportsAPI.getYearByYear(Number(yearByYearSelected), month);
      return response.data;
    },
    enabled: currentTab === 'yearbyyear',
  });

  // Generate year options for year-by-year selector
  const yearByYearOptions = useMemo(() =>
    yearByYearData
      ? Array.from(
          { length: new Date().getFullYear() - yearByYearData.year_of_first_transaction + 1 },
          (_, i) => (yearByYearData.year_of_first_transaction + i).toString()
        ).reverse()
      : Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString()),
    [yearByYearData]
  );

  // Month options for year-by-year filter
  const monthOptions = [
    { value: '', label: 'All Year' },
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  // Fetch previous period data for comparisons (for percentage changes)
  const { data: previousIncomeExpensesData } = useQuery({
    queryKey: ['income-expenses-previous', startDate, endDate],
    queryFn: async () => {
      // Calculate previous period based on current period length
      const currentStart = new Date(startDate);
      const currentEnd = new Date(endDate);
      const periodLength = Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));

      const prevEnd = new Date(currentStart);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - periodLength + 1);

      const response = await reportsAPI.getIncomeVsExpenses({
        start_date: format(prevStart, 'yyyy-MM-dd'),
        end_date: format(prevEnd, 'yyyy-MM-dd')
      });
      return response.data;
    },
  });

  // Fetch previous net worth for comparison
  const { data: netWorthTrendForComparison } = useQuery({
    queryKey: ['net-worth-trend-comparison'],
    queryFn: async () => {
      const response = await reportsAPI.getNetWorthTrend(2);
      return response.data.trend;
    },
  });

  // Fetch user settings for display currency
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settingsAPI.getAll();
      return response.data.settings || {};
    },
  });

  const displayCurrency = settingsData?.display_currency || 'EUR';

  const formatCurrency = (amount: number) => {
    return formatCurrencyUtil(amount, displayCurrency);
  };

  // Helper function to safely calculate percentage change using precise decimal arithmetic
  const calculatePercentageChange = (current: number, previous: number): number => {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return percentChange(current, previous);
  };

  // Prepare data for income vs expenses chart (showing just income and expenses)
  const incomeExpensesBarData = useMemo(() =>
    incomeExpensesData
      ? [
          { name: 'Income', amount: incomeExpensesData.income, fill: '#10b981' },
          { name: 'Expenses', amount: incomeExpensesData.expenses, fill: '#ef4444' },
          { name: 'Net', amount: incomeExpensesData.net, fill: incomeExpensesData.net >= 0 ? '#3b82f6' : '#f59e0b' },
        ]
      : [],
    [incomeExpensesData]
  );

  // Prepare data for spending by category pie chart (Nivo format)
  const spendingChartData = useMemo(() =>
    spendingData?.categories?.map((cat: any) => ({
      id: cat.category,
      label: cat.category,
      value: absMoney(cat.total ?? 0),
    })) || [],
    [spendingData]
  );

  // Prepare data for cash flow line chart using precise decimal arithmetic
  // Use ISO date as key for proper sorting, then format for display
  const cashFlowData = useMemo(() =>
    transactionsData
      ? Object.values(
          transactionsData.reduce((acc: Record<string, any>, transaction: any) => {
            if (!transaction.transaction_date) return acc;
            try {
              const transactionDate = new Date(transaction.transaction_date);
              if (isNaN(transactionDate.getTime())) return acc;
              // Use ISO date substring as key to avoid merging dates across years
              const dateKey = transaction.transaction_date.substring(0, 10);
              const displayDate = format(transactionDate, 'MMM dd');

              if (!acc[dateKey]) {
                acc[dateKey] = { date: displayDate, dateKey, income: 0, expenses: 0 };
              }
              if (transaction.amount > 0) {
                acc[dateKey].income = addMoney(acc[dateKey].income, transaction.amount);
              } else {
                acc[dateKey].expenses = addMoney(acc[dateKey].expenses, absMoney(transaction.amount));
              }
            } catch (error) {
              console.warn('Invalid transaction date:', transaction.transaction_date);
            }
            return acc;
          }, {})
        ).sort((a: any, b: any) => a.dateKey.localeCompare(b.dateKey))
      : [],
    [transactionsData]
  );

  // Memoize sunburst data for spending trends tab
  const sunburstData = useMemo(() => {
    if (!spendingTrendsData?.all_categories?.length) return null;
    return {
      name: 'Spending',
      children: spendingTrendsData.all_categories.slice(0, 8).map((cat: string) => {
        // Calculate total for this category across all months using precise arithmetic
        const total = sumMoney(spendingTrendsData.trends, (month: any) =>
          absMoney(month.categories?.[cat] || 0)
        );
        return {
          name: cat,
          value: total,
        };
      }).filter((item: any) => item.value > 0)
    };
  }, [spendingTrendsData]);

  // Memoize sorted trend analysis for spending trends tab
  const sortedTrendAnalysis = useMemo(() => {
    if (!spendingTrendsData?.trend_analysis) return [];
    return Object.entries(spendingTrendsData.trend_analysis)
      .sort((a: any, b: any) => Math.abs(b[1].change_percent) - Math.abs(a[1].change_percent));
  }, [spendingTrendsData]);

  // Memoize monthly summary pie chart data
  const monthlySummaryPieData = useMemo(() => {
    if (!monthlySummaryData?.spending_by_category) return [];
    return monthlySummaryData.spending_by_category.slice(0, 8).map((cat: any) => ({
      id: cat.category,
      label: cat.category,
      value: absMoney(cat.amount)
    }));
  }, [monthlySummaryData]);

  // Memoize filtered income categories for year-by-year tab
  const filteredIncomeCategories = useMemo(() => {
    if (!yearByYearData?.categories?.income) return [];
    return yearByYearData.categories.income.filter((item: any) =>
      item.name.toLowerCase().includes(yearByYearSearch.toLowerCase()) ||
      item.subcategories?.some((sub: any) =>
        sub.name.toLowerCase().includes(yearByYearSearch.toLowerCase())
      )
    );
  }, [yearByYearData, yearByYearSearch]);

  // Memoize filtered expense categories for year-by-year tab
  const filteredExpenseCategories = useMemo(() => {
    if (!yearByYearData?.categories?.expenses) return [];
    return yearByYearData.categories.expenses.filter((item: any) =>
      item.name.toLowerCase().includes(yearByYearSearch.toLowerCase()) ||
      item.subcategories?.some((sub: any) =>
        sub.name.toLowerCase().includes(yearByYearSearch.toLowerCase())
      )
    );
  }, [yearByYearData, yearByYearSearch]);

  // Memoize filtered income entities for year-by-year tab
  const filteredIncomeEntities = useMemo(() => {
    if (!yearByYearData?.entities?.income) return [];
    return yearByYearData.entities.income.filter((item: any) =>
      item.name.toLowerCase().includes(yearByYearSearch.toLowerCase())
    );
  }, [yearByYearData, yearByYearSearch]);

  // Memoize filtered expense entities for year-by-year tab
  const filteredExpenseEntities = useMemo(() => {
    if (!yearByYearData?.entities?.expenses) return [];
    return yearByYearData.entities.expenses.filter((item: any) =>
      item.name.toLowerCase().includes(yearByYearSearch.toLowerCase())
    );
  }, [yearByYearData, yearByYearSearch]);

  // Memoize filtered income tags for year-by-year tab
  const filteredIncomeTags = useMemo(() => {
    if (!yearByYearData?.tags?.income) return [];
    return yearByYearData.tags.income.filter((item: any) =>
      item.name.toLowerCase().includes(yearByYearSearch.toLowerCase())
    );
  }, [yearByYearData, yearByYearSearch]);

  // Memoize filtered expense tags for year-by-year tab
  const filteredExpenseTags = useMemo(() => {
    if (!yearByYearData?.tags?.expenses) return [];
    return yearByYearData.tags.expenses.filter((item: any) =>
      item.name.toLowerCase().includes(yearByYearSearch.toLowerCase())
    );
  }, [yearByYearData, yearByYearSearch]);

  if (netWorthLoading || incomeExpensesLoading || spendingLoading) {
    return <ReportsSkeleton />;
  }

  const hasErrors = netWorthError || incomeExpensesError || spendingError;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Financial Reports</h1>

      <Tabs value={currentTab} onValueChange={(value) => setCurrentTab(value as string)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Spending Trends</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Summary</TabsTrigger>
          <TabsTrigger value="networth">Net Worth History</TabsTrigger>
          <TabsTrigger value="yearbyyear" className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            Money Flow
          </TabsTrigger>
          <TabsTrigger value="tags" className="flex items-center gap-1">
            <Tag className="w-4 h-4" />
            Tag Reports
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="space-y-6 mt-4">
            {/* Filters: Owner and Date Range */}
            <div className="flex flex-wrap gap-2 justify-end">
              {/* Owner Filter */}
              <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <Users className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Owners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Owners</SelectItem>
                  {owners?.map((owner: any) => (
                    <SelectItem key={owner.id} value={String(owner.id)}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={dateRange} onValueChange={handleDateRangeChange}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_month">Current Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                  <SelectItem value="last_6_months">Last 6 Months</SelectItem>
                  <SelectItem value="year_to_date">Year to Date</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>

              {dateRange === 'custom' && (
                <>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full sm:w-[150px]"
                  />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full sm:w-[150px]"
                  />
                </>
              )}
            </div>

            {/* Error Messages */}
            {hasErrors && (
              <div className="space-y-2">
                {netWorthError && (
                  <div className="p-4 rounded-lg bg-error/10 border border-error/20">
                    <p className="text-error">Failed to load net worth data</p>
                  </div>
                )}
                {incomeExpensesError && (
                  <div className="p-4 rounded-lg bg-error/10 border border-error/20">
                    <p className="text-error">Failed to load income/expenses data</p>
                  </div>
                )}
                {spendingError && (
                  <div className="p-4 rounded-lg bg-error/10 border border-error/20">
                    <p className="text-error">Failed to load spending data</p>
                  </div>
                )}
              </div>
            )}

            {/* Top Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                title="Net Worth"
                value={formatCurrency(netWorthData?.net_worth || 0)}
                change={netWorthTrendForComparison && netWorthTrendForComparison.length >= 2
                  ? calculatePercentageChange(
                      netWorthTrendForComparison[netWorthTrendForComparison.length - 1].net_worth,
                      netWorthTrendForComparison[netWorthTrendForComparison.length - 2].net_worth
                    )
                  : undefined}
                changeLabel="vs last month"
                icon={<Wallet size={24} className="text-blue-500" />}
                iconColor="bg-blue-500"
                colorClass="text-foreground"
              />
              <KPICard
                title="Total Assets"
                value={formatCurrency(netWorthData?.total_assets || 0)}
                change={netWorthTrendForComparison && netWorthTrendForComparison.length >= 2
                  ? calculatePercentageChange(
                      netWorthTrendForComparison[netWorthTrendForComparison.length - 1].assets,
                      netWorthTrendForComparison[netWorthTrendForComparison.length - 2].assets
                    )
                  : undefined}
                changeLabel="vs last month"
                icon={<ArrowUpCircle size={24} className="text-emerald-500" />}
                iconColor="bg-emerald-500"
                colorClass="text-foreground"
              />
              <KPICard
                title="Income"
                value={formatCurrency(incomeExpensesData?.income || 0)}
                change={previousIncomeExpensesData
                  ? calculatePercentageChange(
                      incomeExpensesData?.income || 0,
                      previousIncomeExpensesData?.income || 0
                    )
                  : undefined}
                changeLabel="vs previous period"
                icon={<ArrowUpCircle size={24} className="text-emerald-500" />}
                iconColor="bg-emerald-500"
                colorClass="text-foreground"
              />
              <KPICard
                title="Expenses"
                value={formatCurrency(incomeExpensesData?.expenses || 0)}
                change={previousIncomeExpensesData
                  ? calculatePercentageChange(
                      incomeExpensesData?.expenses || 0,
                      previousIncomeExpensesData?.expenses || 0
                    )
                  : undefined}
                changeLabel="vs previous period"
                icon={<ArrowDownCircle size={24} className="text-rose-500" />}
                iconColor="bg-rose-500"
                colorClass="text-foreground"
              />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Income vs Expenses Chart */}
              <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-foreground mb-4">Income vs Expenses</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={incomeExpensesBarData}>
                    <defs>
                      <linearGradient id="incomeBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.3} />
                      </linearGradient>
                      <linearGradient id="expensesBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.3} />
                      </linearGradient>
                      <linearGradient id="netBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" opacity={0.2} horizontal={true} vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      cursor={false}
                      contentStyle={{
                        backgroundColor: '#0a0a0a',
                        border: '1px solid #2a2a2a',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      labelStyle={{ color: '#888888' }}
                      itemStyle={{ color: '#e5e5e5' }}
                      formatter={(value: any) => formatCurrency(value)}
                    />
                    <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                      {incomeExpensesBarData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.name === 'Income' ? 'url(#incomeBarGradient)' :
                            entry.name === 'Expenses' ? 'url(#expensesBarGradient)' :
                            'url(#netBarGradient)'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {/* Spending by Category Pie Chart */}
              <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-foreground mb-4">Spending by Category</h3>
                {spendingChartData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsivePie
                      data={spendingChartData}
                      margin={{ top: 20, right: isMobile ? 20 : 80, bottom: 20, left: isMobile ? 20 : 80 }}
                      innerRadius={0.5}
                      padAngle={0.7}
                      cornerRadius={3}
                      activeOuterRadiusOffset={8}
                      colors={['#ef4444', '#f59e0b', '#f97316', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1']}
                      borderWidth={1}
                      borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
                      arcLinkLabelsSkipAngle={10}
                      arcLinkLabelsTextColor="#888888"
                      arcLinkLabelsThickness={2}
                      arcLinkLabelsColor={{ from: 'color' }}
                      arcLabelsSkipAngle={10}
                      arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
                      valueFormat={(value) => formatCurrency(value)}
                      theme={{
                        tooltip: {
                          container: {
                            background: '#0a0a0a',
                            border: '1px solid #2a2a2a',
                            borderRadius: '8px',
                            fontSize: '12px',
                          },
                        },
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex justify-center items-center h-[300px]">
                    <p className="text-foreground-muted">No spending data for this period</p>
                  </div>
                )}
              </Card>
            </div>

            {/* Cash Flow Chart */}
            <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
              <h3 className="text-lg font-semibold text-foreground mb-4">Cash Flow Over Time</h3>
              {cashFlowData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={cashFlowData}>
                    <defs>
                      <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" opacity={0.2} horizontal={true} vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0a0a0a',
                        border: '1px solid #2a2a2a',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      labelStyle={{ color: '#888888' }}
                      itemStyle={{ color: '#e5e5e5' }}
                      formatter={(value: any) => formatCurrency(value)}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                    <Area
                      type="monotone"
                      dataKey="income"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#incomeGradient)"
                      name="Income"
                    />
                    <Area
                      type="monotone"
                      dataKey="expenses"
                      stroke="#ef4444"
                      strokeWidth={2}
                      fill="url(#expensesGradient)"
                      name="Expenses"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex justify-center items-center h-[300px]">
                  <p className="text-foreground-muted">No transaction data for this period</p>
                </div>
              )}
            </Card>

            {/* Summary Statistics */}
            <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
              <h3 className="text-lg font-semibold text-foreground mb-4">Summary Statistics</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-foreground-muted mb-1">Total Transactions</p>
                  <p className="text-xl font-bold text-foreground">{transactionsData?.length || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-foreground-muted mb-1">Average Transaction</p>
                  <p className="text-xl font-bold text-foreground">
                    {transactionsData?.length
                      ? formatCurrency(
                          sumMoney(transactionsData, (t: any) => absMoney(t.amount)) /
                            transactionsData.length
                        )
                      : formatCurrency(0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-foreground-muted mb-1">Savings Rate</p>
                  <p className={`text-xl font-bold ${incomeExpensesData?.net >= 0 ? 'text-success' : 'text-error'}`}>
                    {incomeExpensesData?.income > 0
                      ? `${percentOf(incomeExpensesData.net, incomeExpensesData.income)}%`
                      : '0%'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-foreground-muted mb-1">Net Change</p>
                  <p className={`text-xl font-bold ${incomeExpensesData?.net >= 0 ? 'text-success' : 'text-error'}`}>
                    {formatCurrency(incomeExpensesData?.net || 0)}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Spending Trends Tab */}
        <TabsContent value="trends">
          <div className="space-y-6 mt-4">
            {/* Controls */}
            <div className="flex flex-wrap gap-2">
              <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <Users className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Owners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Owners</SelectItem>
                  {owners?.map((owner: any) => (
                    <SelectItem key={owner.id} value={String(owner.id)}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={trendMonths} onValueChange={setTrendMonths}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 Months</SelectItem>
                  <SelectItem value="6">6 Months</SelectItem>
                  <SelectItem value="12">12 Months</SelectItem>
                  <SelectItem value="24">24 Months</SelectItem>
                </SelectContent>
              </Select>

              <Autocomplete
                options={spendingTrendsData?.all_categories || []}
                value={trendCategory}
                onChange={(value) => setTrendCategory(value)}
                placeholder="Filter by Category"
                className="w-full sm:w-[250px]"
              />
            </div>

            {trendsLoading ? (
              <div className="flex justify-center items-center min-h-[40vh]">
                <Spinner size="lg" />
              </div>
            ) : spendingTrendsData ? (
              <>
                {/* Spending Breakdown Sunburst */}
                {spendingTrendsData.all_categories?.length > 0 && (
                  <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Spending Distribution</h3>
                    <div className="h-[400px]">
                      <ResponsiveSunburst
                        data={sunburstData!}
                        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                        id="name"
                        value="value"
                        cornerRadius={2}
                        borderWidth={2}
                        borderColor="#0a0a0a"
                        colors={['#ef4444', '#f59e0b', '#f97316', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1']}
                        childColor={{ from: 'color', modifiers: [['brighter', 0.3]] }}
                        enableArcLabels={true}
                        arcLabelsSkipAngle={15}
                        arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2.5]] }}
                        animate={true}
                        theme={{
                          tooltip: {
                            container: {
                              background: '#0a0a0a',
                              border: '1px solid #2a2a2a',
                              borderRadius: '8px',
                              fontSize: '12px',
                            },
                          },
                        }}
                      />
                    </div>
                  </Card>
                )}

                {/* Spending Trends Area Chart */}
                <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Spending Trends by Category</h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={spendingTrendsData.trends}>
                      <defs>
                        {spendingTrendsData.all_categories.slice(0, 8).map((cat: string, idx: number) => {
                          const colors = [
                            '#ef4444', '#f59e0b', '#10b981', '#3b82f6',
                            '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
                          ];
                          const color = colors[idx % colors.length];
                          return (
                            <linearGradient key={`gradient-${cat}`} id={`gradient-${cat.replace(/\s+/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                              <stop offset="95%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                          );
                        })}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" opacity={0.2} horizontal={true} vertical={false} />
                      <XAxis
                        dataKey="month"
                        stroke="#888888"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#888888"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0a0a0a',
                          border: '1px solid #2a2a2a',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        labelStyle={{ color: '#888888' }}
                        itemStyle={{ color: '#e5e5e5' }}
                        formatter={(value: any) => formatCurrency(value)}
                      />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                      {spendingTrendsData.all_categories.slice(0, 8).map((cat: string, idx: number) => {
                        const colors = [
                          '#ef4444', '#f59e0b', '#10b981', '#3b82f6',
                          '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
                        ];
                        const color = colors[idx % colors.length];
                        return (
                          <Area
                            key={cat}
                            type="monotone"
                            dataKey={`categories.${cat}`}
                            stroke={color}
                            strokeWidth={2}
                            fill={`url(#gradient-${cat.replace(/\s+/g, '-')})`}
                            name={cat}
                          />
                        );
                      })}
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                {/* Trend Analysis */}
                {spendingTrendsData.trend_analysis && Object.keys(spendingTrendsData.trend_analysis).length > 0 && (
                  <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-foreground mb-6">Trend Analysis</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {sortedTrendAnalysis.map(([cat, analysis]: [string, any]) => {
                          const isIncreasing = analysis.change_percent > 5;
                          const isDecreasing = analysis.change_percent < -5;

                          return (
                            <Card
                              key={cat}
                              className="relative overflow-hidden p-5 rounded-xl bg-card border border-border hover:bg-surface-hover transition-all duration-200 hover:shadow-lg"
                            >
                              {/* Background gradient effect */}
                              <div className={`absolute top-0 right-0 w-24 h-24 ${
                                isIncreasing ? 'bg-error' : isDecreasing ? 'bg-success' : 'bg-foreground-muted'
                              } opacity-5 blur-3xl rounded-full`} />

                              <div className="relative">
                                {/* Header with category name and trend badge */}
                                <div className="flex items-start justify-between mb-4">
                                  <h4 className="font-semibold text-foreground text-base leading-tight pr-2">{cat}</h4>
                                  <Badge
                                    variant={isIncreasing ? 'error' : isDecreasing ? 'success' : 'outline'}
                                    size="sm"
                                    className="flex items-center gap-1 shrink-0"
                                  >
                                    {isIncreasing ? <TrendingUp className="w-3 h-3" /> :
                                     isDecreasing ? <TrendingDown className="w-3 h-3" /> :
                                     <span className="w-3 h-3 flex items-center justify-center text-xs">−</span>}
                                    {analysis.direction}
                                  </Badge>
                                </div>

                                {/* Values comparison */}
                                <div className="space-y-3 mb-4">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-foreground-muted">First Month</span>
                                    <span className="font-medium text-foreground">{formatCurrency(analysis.first_month_value)}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-foreground-muted">Last Month</span>
                                    <span className="font-medium text-foreground">{formatCurrency(analysis.last_month_value)}</span>
                                  </div>
                                </div>

                                {/* Change indicator */}
                                <div className={`flex items-center gap-2 p-3 rounded-lg ${
                                  isIncreasing ? 'bg-error/10' : isDecreasing ? 'bg-success/10' : 'bg-foreground-muted/10'
                                }`}>
                                  {isIncreasing ? (
                                    <TrendingUp className="w-5 h-5 text-error" />
                                  ) : isDecreasing ? (
                                    <TrendingDown className="w-5 h-5 text-success" />
                                  ) : (
                                    <div className="w-5 h-5 flex items-center justify-center">
                                      <div className="w-3 h-0.5 bg-foreground-muted rounded" />
                                    </div>
                                  )}
                                  <div className="flex-1">
                                    <div className={`text-lg font-bold ${
                                      isIncreasing ? 'text-error' : isDecreasing ? 'text-success' : 'text-foreground-muted'
                                    }`}>
                                      {analysis.change_percent > 0 ? '+' : ''}{analysis.change_percent}%
                                    </div>
                                    <div className="text-xs text-foreground-muted">
                                      {isIncreasing ? 'spending increased' : isDecreasing ? 'spending decreased' : 'spending stable'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                    </div>
                  </Card>
                )}
              </>
            ) : (
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-foreground-muted">No spending trends data available</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Monthly Summary Tab */}
        <TabsContent value="monthly">
          <div className="space-y-6 mt-4">
            {/* Controls */}
            <div className="flex flex-wrap gap-2">
              <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <Users className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Owners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Owners</SelectItem>
                  {owners?.map((owner: any) => (
                    <SelectItem key={owner.id} value={String(owner.id)}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={summaryYear} onValueChange={setSummaryYear}>
                <SelectTrigger className="w-full sm:w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...Array(5)].map((_, i) => {
                    const year = new Date().getFullYear() - i;
                    return <SelectItem key={year} value={year.toString()}>{year}</SelectItem>;
                  })}
                </SelectContent>
              </Select>

              <Select value={summaryMonth} onValueChange={setSummaryMonth}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, idx) => (
                    <SelectItem key={idx + 1} value={(idx + 1).toString()}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {summaryLoading ? (
              <div className="flex justify-center items-center min-h-[40vh]">
                <Spinner size="lg" />
              </div>
            ) : monthlySummaryData ? (
              <>
                {/* Summary Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <KPICard
                    title="Income"
                    value={formatCurrency(monthlySummaryData.income)}
                    icon={<ArrowUpCircle size={24} className="text-emerald-500" />}
                    iconColor="bg-emerald-500"
                    colorClass="text-foreground"
                  />
                  <KPICard
                    title="Expenses"
                    value={formatCurrency(monthlySummaryData.expenses)}
                    icon={<ArrowDownCircle size={24} className="text-rose-500" />}
                    iconColor="bg-rose-500"
                    colorClass="text-foreground"
                  />
                  <KPICard
                    title="Net Savings"
                    value={formatCurrency(monthlySummaryData.net)}
                    icon={<Wallet size={24} className={monthlySummaryData.net >= 0 ? 'text-emerald-500' : 'text-rose-500'} />}
                    iconColor={monthlySummaryData.net >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}
                    colorClass="text-foreground"
                  />
                  <KPICard
                    title="Transactions"
                    value={monthlySummaryData.transaction_count}
                    icon={<Landmark size={24} className="text-blue-500" />}
                    iconColor="bg-blue-500"
                    colorClass="text-foreground"
                  />
                </div>

                {/* Spending by Category */}
                {monthlySummaryData.spending_by_category?.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Top Spending Categories</h3>
                      <Card className="overflow-hidden border border-border rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Category</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead className="text-right">% of Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {monthlySummaryData.spending_by_category.slice(0, 10).map((cat: any) => (
                              <TableRow key={cat.category}>
                                <TableCell>{cat.category}</TableCell>
                                <TableCell className="text-right">{formatCurrency(cat.amount)}</TableCell>
                                <TableCell className="text-right">{percentOf(cat.amount, monthlySummaryData.expenses)}%</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Card>
                    </Card>

                    <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Category Distribution</h3>
                      <div className="h-[300px]">
                        <ResponsivePie
                          data={monthlySummaryPieData}
                          margin={{ top: 20, right: isMobile ? 20 : 80, bottom: 20, left: isMobile ? 20 : 80 }}
                          innerRadius={0.5}
                          padAngle={0.7}
                          cornerRadius={3}
                          activeOuterRadiusOffset={8}
                          colors={['#ef4444', '#f59e0b', '#f97316', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1']}
                          borderWidth={1}
                          borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
                          arcLinkLabelsSkipAngle={10}
                          arcLinkLabelsTextColor="#888888"
                          arcLinkLabelsThickness={2}
                          arcLinkLabelsColor={{ from: 'color' }}
                          arcLabelsSkipAngle={10}
                          arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
                          valueFormat={(value) => formatCurrency(value)}
                          theme={{
                            tooltip: {
                              container: {
                                background: '#0a0a0a',
                                border: '1px solid #2a2a2a',
                                borderRadius: '8px',
                                fontSize: '12px',
                              },
                            },
                          }}
                        />
                      </div>
                    </Card>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-foreground-muted">No data available for the selected month</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Net Worth History Tab */}
        <TabsContent value="networth">
          <div className="space-y-6 mt-4">
            {/* Controls */}
            <div className="flex gap-2">
              <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <Users className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Owners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Owners</SelectItem>
                  {owners?.map((owner: any) => (
                    <SelectItem key={owner.id} value={String(owner.id)}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={netWorthMonths} onValueChange={setNetWorthMonths}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6 Months</SelectItem>
                  <SelectItem value="12">12 Months</SelectItem>
                  <SelectItem value="24">2 Years</SelectItem>
                  <SelectItem value="36">3 Years</SelectItem>
                  <SelectItem value="60">5 Years</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {extendedNetWorthLoading ? (
              <div className="flex justify-center items-center min-h-[40vh]">
                <Spinner size="lg" />
              </div>
            ) : extendedNetWorthData ? (
              <>
                {/* Net Worth Trend Chart */}
                <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Net Worth Trend</h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={extendedNetWorthData.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" opacity={0.2} horizontal={true} vertical={false} />
                      <XAxis
                        dataKey="month"
                        stroke="#888888"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#888888"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0a0a0a',
                          border: '1px solid #2a2a2a',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        labelStyle={{ color: '#888888' }}
                        itemStyle={{ color: '#e5e5e5' }}
                        formatter={(value: any) => formatCurrency(value)}
                      />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                      <Line type="monotone" dataKey="assets" stroke="#10b981" strokeWidth={2} name="Assets" />
                      <Line type="monotone" dataKey="debts" stroke="#ef4444" strokeWidth={2} name="Debts" />
                      <Line type="monotone" dataKey="net_worth" stroke="#3b82f6" strokeWidth={3} name="Net Worth" />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                {/* Net Worth History Table */}
                <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Monthly Breakdown</h3>
                  <div className="max-h-[400px] overflow-auto">
                    <Card className="overflow-hidden border border-border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Month</TableHead>
                            <TableHead className="text-right">Assets</TableHead>
                            <TableHead className="text-right">Debts</TableHead>
                            <TableHead className="text-right">Net Worth</TableHead>
                            <TableHead className="text-right">Change</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {extendedNetWorthData.trend.map((row: any, idx: number) => {
                            const prevRow = idx > 0 ? extendedNetWorthData.trend[idx - 1] : null;
                            const change = prevRow ? row.net_worth - prevRow.net_worth : 0;
                            return (
                              <TableRow key={row.date}>
                                <TableCell>{row.month}</TableCell>
                                <TableCell className="text-right">{formatCurrency(row.assets)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(row.debts)}</TableCell>
                                <TableCell className="text-right font-bold">{formatCurrency(row.net_worth)}</TableCell>
                                <TableCell className={`text-right font-bold ${change >= 0 ? 'text-success' : 'text-error'}`}>
                                  {idx > 0 ? (change >= 0 ? '+' : '') + formatCurrency(change) : '-'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </Card>
                  </div>
                </Card>
              </>
            ) : (
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-foreground-muted">No net worth history available</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Money Flow Tab */}
        <TabsContent value="yearbyyear">
          <div className="space-y-6 mt-4">
            {/* Year and Month Selector */}
            <div className="flex flex-wrap gap-2 items-center">
              <Autocomplete
                options={yearByYearOptions}
                value={yearByYearSelected}
                onChange={(value) => setYearByYearSelected(value)}
                placeholder="Select year"
                className="w-full sm:w-[150px]"
              />
              <Select value={yearByYearMonth} onValueChange={setYearByYearMonth}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="All Year" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-foreground-muted text-sm">
                {yearByYearMonth
                  ? `${monthOptions.find(m => m.value === yearByYearMonth)?.label} ${yearByYearSelected}`
                  : `Full year ${yearByYearSelected}`}
              </span>
            </div>

            {yearByYearLoading ? (
              <div className="flex justify-center items-center min-h-[40vh]">
                <Spinner size="lg" />
              </div>
            ) : yearByYearData ? (
              <>
                {/* Summary KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <KPICard
                    title="Total Income"
                    value={formatCurrency(yearByYearData.summary.total_income)}
                    icon={<ArrowUpCircle size={24} className="text-emerald-500" />}
                    iconColor="bg-emerald-500"
                    colorClass="text-success"
                  />
                  <KPICard
                    title="Total Expenses"
                    value={formatCurrency(yearByYearData.summary.total_expenses)}
                    icon={<ArrowDownCircle size={24} className="text-rose-500" />}
                    iconColor="bg-rose-500"
                    colorClass="text-error"
                  />
                  <KPICard
                    title="Net Savings"
                    value={formatCurrency(yearByYearData.summary.net)}
                    icon={<Wallet size={24} className={yearByYearData.summary.net >= 0 ? 'text-emerald-500' : 'text-rose-500'} />}
                    iconColor={yearByYearData.summary.net >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}
                    colorClass={yearByYearData.summary.net >= 0 ? 'text-success' : 'text-error'}
                  />
                </div>

                {/* Sankey Diagram - Money Flow */}
                {yearByYearData.sankey && yearByYearData.sankey.links.length > 0 && (
                  <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Money Flow</h3>
                    <div className="h-[400px]">
                      <ResponsiveSankey
                        data={{
                          nodes: yearByYearData.sankey.nodes.map((node: any) => ({
                            id: node.id,
                            nodeColor: node.type === 'income' ? '#10b981' : node.type === 'expense' ? '#ef4444' : '#3b82f6'
                          })),
                          links: yearByYearData.sankey.links
                        }}
                        margin={{ top: 20, right: isMobile ? 20 : 160, bottom: 20, left: isMobile ? 20 : 160 }}
                        align="justify"
                        colors={(node: any) => {
                          const nodeData = yearByYearData.sankey.nodes.find((n: any) => n.id === node.id);
                          if (nodeData?.type === 'income') return '#10b981';
                          if (nodeData?.type === 'expense') return '#ef4444';
                          return '#3b82f6';
                        }}
                        nodeOpacity={1}
                        nodeHoverOpacity={1}
                        nodeThickness={18}
                        nodeSpacing={24}
                        nodeBorderWidth={0}
                        nodeBorderRadius={3}
                        linkOpacity={0.5}
                        linkHoverOpacity={0.8}
                        linkContract={3}
                        enableLinkGradient={true}
                        labelPosition="outside"
                        labelOrientation="horizontal"
                        labelPadding={16}
                        labelTextColor="#888888"
                        label={(node: any) => {
                          const nodeData = yearByYearData.sankey.nodes.find((n: any) => n.id === node.id);
                          return nodeData?.label || node.id;
                        }}
                        theme={{
                          tooltip: {
                            container: {
                              background: '#0a0a0a',
                              border: '1px solid #2a2a2a',
                              borderRadius: '8px',
                              fontSize: '12px',
                            },
                          },
                        }}
                        valueFormat={(value) => formatCurrency(value)}
                      />
                    </div>
                  </Card>
                )}

                {/* Search input for tables */}
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-foreground-muted" />
                  <Input
                    placeholder="Search categories, vendors, or tags..."
                    value={yearByYearSearch}
                    onChange={(e) => setYearByYearSearch(e.target.value)}
                    className="max-w-sm"
                  />
                </div>

                {/* 6 Tables in 2-column grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Income by Category with Subcategories */}
                  <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                      <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
                      Income by Category
                    </h3>
                    <div className="max-h-[400px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredIncomeCategories.map((item: any) => {
                              const isExpanded = expandedIncomeCategories.has(item.name);
                              const hasSubcategories = item.subcategories && item.subcategories.length > 0;
                              return (
                                <React.Fragment key={item.id || item.name}>
                                  <TableRow
                                    className={hasSubcategories ? 'cursor-pointer hover:bg-muted/50' : ''}
                                    onClick={() => {
                                      if (hasSubcategories) {
                                        setExpandedIncomeCategories(prev => {
                                          const next = new Set(prev);
                                          if (next.has(item.name)) {
                                            next.delete(item.name);
                                          } else {
                                            next.add(item.name);
                                          }
                                          return next;
                                        });
                                      }
                                    }}
                                  >
                                    <TableCell className="flex items-center gap-2">
                                      {hasSubcategories && (
                                        isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                                      )}
                                      <span className="font-medium">{item.name}</span>
                                    </TableCell>
                                    <TableCell className="text-right text-success font-medium">
                                      {formatCurrency(item.amount)}
                                    </TableCell>
                                  </TableRow>
                                  {isExpanded && item.subcategories?.map((sub: any) => (
                                    <TableRow key={`${item.name}-${sub.name}`} className="bg-muted/30">
                                      <TableCell className="pl-10 text-foreground-muted">
                                        {sub.name}
                                      </TableCell>
                                      <TableCell className="text-right text-success/80">
                                        {formatCurrency(sub.amount)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </React.Fragment>
                              );
                            })}
                          {filteredIncomeCategories.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center text-foreground-muted">
                                No income data
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>

                  {/* Expenses by Category with Subcategories */}
                  <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                      <ArrowDownCircle className="w-5 h-5 text-rose-500" />
                      Expenses by Category
                    </h3>
                    <div className="max-h-[400px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredExpenseCategories.map((item: any) => {
                              const isExpanded = expandedExpenseCategories.has(item.name);
                              const hasSubcategories = item.subcategories && item.subcategories.length > 0;
                              return (
                                <React.Fragment key={item.id || item.name}>
                                  <TableRow
                                    className={hasSubcategories ? 'cursor-pointer hover:bg-muted/50' : ''}
                                    onClick={() => {
                                      if (hasSubcategories) {
                                        setExpandedExpenseCategories(prev => {
                                          const next = new Set(prev);
                                          if (next.has(item.name)) {
                                            next.delete(item.name);
                                          } else {
                                            next.add(item.name);
                                          }
                                          return next;
                                        });
                                      }
                                    }}
                                  >
                                    <TableCell className="flex items-center gap-2">
                                      {hasSubcategories && (
                                        isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                                      )}
                                      <span className="font-medium">{item.name}</span>
                                    </TableCell>
                                    <TableCell className="text-right text-error font-medium">
                                      {formatCurrency(item.amount)}
                                    </TableCell>
                                  </TableRow>
                                  {isExpanded && item.subcategories?.map((sub: any) => (
                                    <TableRow key={`${item.name}-${sub.name}`} className="bg-muted/30">
                                      <TableCell className="pl-10 text-foreground-muted">
                                        {sub.name}
                                      </TableCell>
                                      <TableCell className="text-right text-error/80">
                                        {formatCurrency(sub.amount)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </React.Fragment>
                              );
                            })}
                          {filteredExpenseCategories.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center text-foreground-muted">
                                No expense data
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>

                  {/* Income by Vendor */}
                  <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Users className="w-5 h-5 text-emerald-500" />
                      Income by Vendor
                    </h3>
                    <div className="max-h-[300px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Vendor</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredIncomeEntities.map((item: any, index: number) => (
                            <TableRow key={item.name + index}>
                              <TableCell>{item.name}</TableCell>
                              <TableCell className="text-right text-success">
                                {formatCurrency(item.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {filteredIncomeEntities.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center text-foreground-muted">
                                No income vendors
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>

                  {/* Expenses by Vendor */}
                  <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Users className="w-5 h-5 text-rose-500" />
                      Expenses by Vendor
                    </h3>
                    <div className="max-h-[300px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Vendor</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredExpenseEntities.map((item: any, index: number) => (
                            <TableRow key={item.name + index}>
                              <TableCell>{item.name}</TableCell>
                              <TableCell className="text-right text-error">
                                {formatCurrency(item.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {filteredExpenseEntities.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center text-foreground-muted">
                                No expense vendors
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>

                  {/* Income by Tag */}
                  <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Tag className="w-5 h-5 text-emerald-500" />
                      Income by Tag
                    </h3>
                    <div className="max-h-[300px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tag</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredIncomeTags.map((item: any, index: number) => (
                            <TableRow key={item.name + index}>
                              <TableCell>
                                <Badge variant="secondary">{item.name}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-success">
                                {formatCurrency(item.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {filteredIncomeTags.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center text-foreground-muted">
                                No income tags
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>

                  {/* Expenses by Tag */}
                  <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Tag className="w-5 h-5 text-rose-500" />
                      Expenses by Tag
                    </h3>
                    <div className="max-h-[300px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tag</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredExpenseTags.map((item: any, index: number) => (
                            <TableRow key={item.name + index}>
                              <TableCell>
                                <Badge variant="secondary">{item.name}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-error">
                                {formatCurrency(item.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {filteredExpenseTags.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center text-foreground-muted">
                                No expense tags
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-foreground-muted">No data available for {yearByYearSelected}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tag Reports Tab */}
        <TabsContent value="tags">
          <div className="space-y-6 mt-4">
            {/* Tag Selection and Date Range */}
            <div className="flex flex-wrap gap-2">
              <Autocomplete
                options={allTags || []}
                value={selectedTag}
                onChange={(value) => setSelectedTag(value)}
                placeholder="Choose a tag"
                className="w-full sm:w-[250px]"
              />

              <Select value={dateRange} onValueChange={handleDateRangeChange}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_month">Current Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                  <SelectItem value="last_6_months">Last 6 Months</SelectItem>
                  <SelectItem value="year_to_date">Year to Date</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>

              {dateRange === 'custom' && (
                <>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full sm:w-[150px]" />
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full sm:w-[150px]" />
                </>
              )}
            </div>

            {/* Tag Report Content */}
            {!selectedTag ? (
              <div className="text-center py-16">
                <Tag className="w-20 h-20 text-foreground-muted mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground-muted mb-2">Select a Tag to View Report</h3>
                <p className="text-sm text-foreground-muted">Choose a tag from the dropdown above to see detailed analytics</p>
              </div>
            ) : tagReportLoading ? (
              <div className="flex justify-center items-center min-h-[40vh]">
                <Spinner size="lg" />
              </div>
            ) : tagReportData ? (
              <>
                {/* Summary Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <KPICard
                    title="Total Transactions"
                    value={tagReportData.transaction_count}
                    icon={<Tag size={24} className="text-blue-500" />}
                    iconColor="bg-blue-500"
                    colorClass="text-foreground"
                  />
                  <KPICard
                    title="Total Income"
                    value={formatCurrency(tagReportData.total_income)}
                    icon={<ArrowUpCircle size={24} className="text-emerald-500" />}
                    iconColor="bg-emerald-500"
                    colorClass="text-foreground"
                  />
                  <KPICard
                    title="Total Expenses"
                    value={formatCurrency(tagReportData.total_expenses)}
                    icon={<ArrowDownCircle size={24} className="text-rose-500" />}
                    iconColor="bg-rose-500"
                    colorClass="text-foreground"
                  />
                  <KPICard
                    title="Net Amount"
                    value={formatCurrency(tagReportData.net)}
                    icon={<Wallet size={24} className={tagReportData.net >= 0 ? 'text-emerald-500' : 'text-rose-500'} />}
                    iconColor={tagReportData.net >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}
                    colorClass="text-foreground"
                  />
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Spending by Category */}
                  <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Spending by Category</h3>
                    {tagReportData.spending_by_category?.length > 0 ? (
                      <div className="h-[300px]">
                        <ResponsivePie
                          data={tagReportData.spending_by_category.map((cat: any) => ({
                            id: cat.category,
                            label: cat.category,
                            value: absMoney(cat.amount)
                          }))}
                          margin={{ top: 20, right: isMobile ? 20 : 80, bottom: 20, left: isMobile ? 20 : 80 }}
                          innerRadius={0.5}
                          padAngle={0.7}
                          cornerRadius={3}
                          activeOuterRadiusOffset={8}
                          colors={['#ef4444', '#f59e0b', '#f97316', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1']}
                          borderWidth={1}
                          borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
                          arcLinkLabelsSkipAngle={10}
                          arcLinkLabelsTextColor="#888888"
                          arcLinkLabelsThickness={2}
                          arcLinkLabelsColor={{ from: 'color' }}
                          arcLabelsSkipAngle={10}
                          arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
                          valueFormat={(value) => formatCurrency(value)}
                          theme={{
                            tooltip: {
                              container: {
                                background: '#0a0a0a',
                                border: '1px solid #2a2a2a',
                                borderRadius: '8px',
                                fontSize: '12px',
                              },
                            },
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex justify-center items-center h-[300px]">
                        <p className="text-foreground-muted">No category data</p>
                      </div>
                    )}
                  </Card>

                  {/* Distribution by Account */}
                  <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Distribution by Account</h3>
                    {tagReportData.distribution_by_account?.length > 0 ? (
                      <div className="h-[300px]">
                        <ResponsivePie
                          data={tagReportData.distribution_by_account.map((acc: any) => ({
                            id: acc.account,
                            label: acc.account,
                            value: absMoney(acc.amount)
                          }))}
                          margin={{ top: 20, right: isMobile ? 20 : 80, bottom: 20, left: isMobile ? 20 : 80 }}
                          innerRadius={0.5}
                          padAngle={0.7}
                          cornerRadius={3}
                          activeOuterRadiusOffset={8}
                          colors={['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#ef4444']}
                          borderWidth={1}
                          borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
                          arcLinkLabelsSkipAngle={10}
                          arcLinkLabelsTextColor="#888888"
                          arcLinkLabelsThickness={2}
                          arcLinkLabelsColor={{ from: 'color' }}
                          arcLabelsSkipAngle={10}
                          arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
                          valueFormat={(value) => formatCurrency(value)}
                          theme={{
                            tooltip: {
                              container: {
                                background: '#0a0a0a',
                                border: '1px solid #2a2a2a',
                                borderRadius: '8px',
                                fontSize: '12px',
                              },
                            },
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex justify-center items-center h-[300px]">
                        <p className="text-foreground-muted">No account data</p>
                      </div>
                    )}
                  </Card>
                </div>

                {/* Monthly Trend */}
                {tagReportData.monthly_trend?.length > 0 && (
                  <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Monthly Trend</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={tagReportData.monthly_trend}>
                        <defs>
                          <linearGradient id="tagIncomeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="tagExpensesGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" opacity={0.2} horizontal={true} vertical={false} />
                        <XAxis
                          dataKey="month"
                          stroke="#888888"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="#888888"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0a0a0a',
                            border: '1px solid #2a2a2a',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                          labelStyle={{ color: '#888888' }}
                          itemStyle={{ color: '#e5e5e5' }}
                          formatter={(value: any) => formatCurrency(value)}
                        />
                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                        <Area
                          type="monotone"
                          dataKey="income"
                          stroke="#10b981"
                          strokeWidth={2}
                          fill="url(#tagIncomeGradient)"
                          name="Income"
                        />
                        <Area
                          type="monotone"
                          dataKey="expenses"
                          stroke="#ef4444"
                          strokeWidth={2}
                          fill="url(#tagExpensesGradient)"
                          name="Expenses"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Card>
                )}

                {/* Transactions Table */}
                {tagReportData.transactions?.length > 0 && (
                  <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Transactions ({tagReportData.transactions.length})</h3>
                    <div className="max-h-[400px] overflow-auto">
                      <Card className="overflow-hidden border border-border rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Account</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tagReportData.transactions.map((transaction: any) => (
                              <TableRow key={transaction.id}>
                                <TableCell>{format(new Date(transaction.transaction_date), 'MMM dd, yyyy')}</TableCell>
                                <TableCell>{transaction.description}</TableCell>
                                <TableCell><Badge variant="outline" size="sm">{transaction.category}</Badge></TableCell>
                                <TableCell>{transaction.account}</TableCell>
                                <TableCell className={`text-right font-bold ${transaction.amount >= 0 ? 'text-success' : 'text-error'}`}>
                                  {formatCurrency(transaction.amount)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Card>
                    </div>
                  </Card>
                )}
              </>
            ) : (
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-foreground-muted">No data available for the selected tag and date range</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
