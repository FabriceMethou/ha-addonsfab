// Reports Page - Financial Analytics with Recharts
import { useState } from 'react';
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
} from '../components/shadcn';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
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
} from 'lucide-react';
import { reportsAPI, settingsAPI, transactionsAPI } from '../services/api';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

// Color palette for charts
const COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8',
  '#82CA9D', '#FFC658', '#FF6B9D', '#A4DE6C', '#D0ED57',
];

// Metric Card Component
function MetricCard({ title, value, icon, colorClass, subtitle }: any) {
  return (
    <Card className="p-4">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm text-foreground-muted mb-1">{title}</p>
          <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
          {subtitle && (
            <p className="text-sm text-foreground-muted mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorClass.includes('success') ? 'bg-success/20' : colorClass.includes('error') ? 'bg-error/20' : 'bg-primary/20'}`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

export default function ReportsPage() {
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

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settingsAPI.getAll();
      return response.data.settings || {};
    },
  });

  const displayCurrency = (settings as any)?.display_currency || 'EUR';

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

  // Fetch data
  const { data: netWorthData, isLoading: netWorthLoading, error: netWorthError } = useQuery({
    queryKey: ['net-worth'],
    queryFn: async () => {
      const response = await reportsAPI.getNetWorth();
      return response.data;
    },
  });

  const { data: incomeExpensesData, isLoading: incomeExpensesLoading, error: incomeExpensesError } = useQuery({
    queryKey: ['income-expenses', startDate, endDate],
    queryFn: async () => {
      const response = await reportsAPI.getIncomeVsExpenses({ start_date: startDate, end_date: endDate });
      return response.data;
    },
  });

  const { data: spendingData, isLoading: spendingLoading, error: spendingError } = useQuery({
    queryKey: ['spending-by-category', startDate, endDate],
    queryFn: async () => {
      const response = await reportsAPI.getSpendingByCategory({ start_date: startDate, end_date: endDate });
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
    queryKey: ['spending-trends', trendMonths, trendCategory],
    queryFn: async () => {
      const response = await reportsAPI.getSpendingTrends(Number(trendMonths), trendCategory);
      return response.data;
    },
    enabled: currentTab === 'trends',
  });

  // Fetch monthly summary data
  const { data: monthlySummaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['monthly-summary', summaryYear, summaryMonth],
    queryFn: async () => {
      const response = await reportsAPI.getMonthlySummary(Number(summaryYear), Number(summaryMonth));
      return response.data;
    },
    enabled: currentTab === 'monthly',
  });

  // Fetch extended net worth trend data
  const { data: extendedNetWorthData, isLoading: extendedNetWorthLoading } = useQuery({
    queryKey: ['net-worth-trend-extended', netWorthMonths],
    queryFn: async () => {
      const response = await reportsAPI.getNetWorthTrend(Number(netWorthMonths));
      return response.data;
    },
    enabled: currentTab === 'networth',
  });

  const formatCurrency = (amount: number, currency?: string) => {
    const currencyToUse = currency || displayCurrency;
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currencyToUse,
    }).format(amount);
  };

  // Prepare data for income vs expenses chart
  const incomeExpensesChartData = incomeExpensesData
    ? [
        { name: 'Income', amount: incomeExpensesData.income, fill: '#00C49F' },
        { name: 'Expenses', amount: incomeExpensesData.expenses, fill: '#FF8042' },
        { name: 'Net', amount: incomeExpensesData.net, fill: incomeExpensesData.net >= 0 ? '#0088FE' : '#FF6B9D' },
      ]
    : [];

  // Prepare data for spending by category pie chart
  const spendingChartData =
    spendingData?.categories?.map((cat: any) => ({
      name: cat.category,
      value: cat.total ?? cat.amount,
    })) || [];

  // Prepare data for cash flow line chart
  const cashFlowData = transactionsData
    ? transactionsData.reduce((acc: any[], transaction: any) => {
        if (!transaction.transaction_date) return acc;
        try {
          const transactionDate = new Date(transaction.transaction_date);
          if (isNaN(transactionDate.getTime())) return acc;
          const date = format(transactionDate, 'MMM dd');
          const existing = acc.find((item) => item.date === date);
          if (existing) {
            if (transaction.amount > 0) existing.income += transaction.amount;
            else existing.expenses += Math.abs(transaction.amount);
          } else {
            acc.push({
              date,
              income: transaction.amount > 0 ? transaction.amount : 0,
              expenses: transaction.amount < 0 ? Math.abs(transaction.amount) : 0,
            });
          }
        } catch (error) {
          console.warn('Invalid transaction date:', transaction.transaction_date);
        }
        return acc;
      }, [])
    : [];

  if (netWorthLoading || incomeExpensesLoading || spendingLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
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
          <TabsTrigger value="tags" className="flex items-center gap-1">
            <Tag className="w-4 h-4" />
            Tag Reports
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="space-y-6 mt-4">
            {/* Date Range Selector */}
            <div className="flex flex-wrap gap-2 justify-end">
              <Select value={dateRange} onValueChange={handleDateRangeChange}>
                <SelectTrigger className="w-[180px]">
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
                    className="w-[150px]"
                  />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-[150px]"
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
              <MetricCard
                title="Net Worth"
                value={formatCurrency(netWorthData?.net_worth || 0)}
                icon={<Landmark className="w-5 h-5 text-primary" />}
                colorClass="text-primary"
                subtitle={`${netWorthData?.account_count || 0} accounts`}
              />
              <MetricCard
                title="Total Assets"
                value={formatCurrency(netWorthData?.total_assets || 0)}
                icon={<TrendingUp className="w-5 h-5 text-success" />}
                colorClass="text-success"
              />
              <MetricCard
                title="Income"
                value={formatCurrency(incomeExpensesData?.income || 0)}
                icon={<TrendingUp className="w-5 h-5 text-success" />}
                colorClass="text-success"
                subtitle="Selected period"
              />
              <MetricCard
                title="Expenses"
                value={formatCurrency(incomeExpensesData?.expenses || 0)}
                icon={<TrendingDown className="w-5 h-5 text-error" />}
                colorClass="text-error"
                subtitle="Selected period"
              />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Income vs Expenses Bar Chart */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Income vs Expenses</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={incomeExpensesChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Bar dataKey="amount" fill="#8884d8">
                      {incomeExpensesChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {/* Spending by Category Pie Chart */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Spending by Category</h3>
                {spendingChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={spendingChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => `${entry.name}: ${formatCurrency(entry.value)}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {spendingChartData.map((_entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex justify-center items-center h-[300px]">
                    <p className="text-foreground-muted">No spending data for this period</p>
                  </div>
                )}
              </Card>
            </div>

            {/* Cash Flow Chart */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Cash Flow Over Time</h3>
              {cashFlowData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={cashFlowData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend />
                    <Line type="monotone" dataKey="income" stroke="#00C49F" strokeWidth={2} name="Income" />
                    <Line type="monotone" dataKey="expenses" stroke="#FF8042" strokeWidth={2} name="Expenses" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex justify-center items-center h-[300px]">
                  <p className="text-foreground-muted">No transaction data for this period</p>
                </div>
              )}
            </Card>

            {/* Summary Statistics */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Summary Statistics</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-foreground-muted">Total Transactions</p>
                  <p className="text-xl font-bold text-foreground">{transactionsData?.length || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-foreground-muted">Average Transaction</p>
                  <p className="text-xl font-bold text-foreground">
                    {transactionsData?.length
                      ? formatCurrency(
                          transactionsData.reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0) /
                            transactionsData.length
                        )
                      : formatCurrency(0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-foreground-muted">Savings Rate</p>
                  <p className={`text-xl font-bold ${incomeExpensesData?.net >= 0 ? 'text-success' : 'text-error'}`}>
                    {incomeExpensesData?.income > 0
                      ? `${((incomeExpensesData.net / incomeExpensesData.income) * 100).toFixed(1)}%`
                      : '0%'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-foreground-muted">Net Change</p>
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
              <Select value={trendMonths} onValueChange={setTrendMonths}>
                <SelectTrigger className="w-[150px]">
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
                className="w-[250px]"
              />
            </div>

            {trendsLoading ? (
              <div className="flex justify-center items-center min-h-[40vh]">
                <Spinner size="lg" />
              </div>
            ) : spendingTrendsData ? (
              <>
                {/* Stacked Bar Chart */}
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Spending Trends by Category</h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={spendingTrendsData.trends}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value: any) => formatCurrency(value)} />
                      <Legend />
                      {spendingTrendsData.all_categories.map((cat: string, idx: number) => (
                        <Bar key={cat} dataKey={`categories.${cat}`} stackId="a" fill={COLORS[idx % COLORS.length]} name={cat} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                {/* Trend Analysis */}
                {spendingTrendsData.trend_analysis && Object.keys(spendingTrendsData.trend_analysis).length > 0 && (
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Trend Analysis</h3>
                    <Card className="overflow-hidden border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">First Month</TableHead>
                            <TableHead className="text-right">Last Month</TableHead>
                            <TableHead className="text-right">Change</TableHead>
                            <TableHead>Trend</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(spendingTrendsData.trend_analysis).map(([cat, analysis]: [string, any]) => (
                            <TableRow key={cat}>
                              <TableCell>{cat}</TableCell>
                              <TableCell className="text-right">{formatCurrency(analysis.first_month_value)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(analysis.last_month_value)}</TableCell>
                              <TableCell className={`text-right font-bold ${analysis.change_percent > 5 ? 'text-error' : analysis.change_percent < -5 ? 'text-success' : ''}`}>
                                {analysis.change_percent > 0 ? '+' : ''}{analysis.change_percent}%
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={analysis.direction === 'increasing' ? 'error' : analysis.direction === 'decreasing' ? 'success' : 'outline'}
                                  size="sm"
                                >
                                  {analysis.direction}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
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
              <Select value={summaryYear} onValueChange={setSummaryYear}>
                <SelectTrigger className="w-[120px]">
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
                <SelectTrigger className="w-[150px]">
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
                  <MetricCard title="Income" value={formatCurrency(monthlySummaryData.income)} icon={<TrendingUp className="w-5 h-5 text-success" />} colorClass="text-success" />
                  <MetricCard title="Expenses" value={formatCurrency(monthlySummaryData.expenses)} icon={<TrendingDown className="w-5 h-5 text-error" />} colorClass="text-error" />
                  <MetricCard title="Net Savings" value={formatCurrency(monthlySummaryData.net)} icon={<Landmark className="w-5 h-5" />} colorClass={monthlySummaryData.net >= 0 ? 'text-success' : 'text-error'} />
                  <MetricCard title="Transactions" value={monthlySummaryData.transaction_count} icon={<Landmark className="w-5 h-5 text-primary" />} colorClass="text-primary" />
                </div>

                {/* Spending by Category */}
                {monthlySummaryData.spending_by_category?.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="p-6">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Top Spending Categories</h3>
                      <Card className="overflow-hidden border border-border">
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
                                <TableCell className="text-right">{((cat.amount / monthlySummaryData.expenses) * 100).toFixed(1)}%</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Card>
                    </Card>

                    <Card className="p-6">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Category Distribution</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={monthlySummaryData.spending_by_category.slice(0, 8).map((cat: any) => ({ name: cat.category, value: cat.amount }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(entry) => entry.name}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {monthlySummaryData.spending_by_category.slice(0, 8).map((_: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: any) => formatCurrency(value)} />
                        </PieChart>
                      </ResponsiveContainer>
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
              <Select value={netWorthMonths} onValueChange={setNetWorthMonths}>
                <SelectTrigger className="w-[150px]">
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
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Net Worth Trend</h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={extendedNetWorthData.trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value: any) => formatCurrency(value)} />
                      <Legend />
                      <Line type="monotone" dataKey="assets" stroke="#00C49F" strokeWidth={2} name="Assets" />
                      <Line type="monotone" dataKey="debts" stroke="#FF8042" strokeWidth={2} name="Debts" />
                      <Line type="monotone" dataKey="net_worth" stroke="#0088FE" strokeWidth={3} name="Net Worth" />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                {/* Net Worth History Table */}
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Monthly Breakdown</h3>
                  <div className="max-h-[400px] overflow-auto">
                    <Card className="overflow-hidden border border-border">
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
                className="w-[250px]"
              />

              <Select value={dateRange} onValueChange={handleDateRangeChange}>
                <SelectTrigger className="w-[180px]">
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
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[150px]" />
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[150px]" />
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
                  <MetricCard title="Total Transactions" value={tagReportData.transaction_count} icon={<Tag className="w-5 h-5 text-primary" />} colorClass="text-primary" />
                  <MetricCard title="Total Income" value={formatCurrency(tagReportData.total_income)} icon={<TrendingUp className="w-5 h-5 text-success" />} colorClass="text-success" />
                  <MetricCard title="Total Expenses" value={formatCurrency(tagReportData.total_expenses)} icon={<TrendingDown className="w-5 h-5 text-error" />} colorClass="text-error" />
                  <MetricCard title="Net Amount" value={formatCurrency(tagReportData.net)} icon={<Landmark className="w-5 h-5" />} colorClass={tagReportData.net >= 0 ? 'text-success' : 'text-error'} />
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Spending by Category */}
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Spending by Category</h3>
                    {tagReportData.spending_by_category?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={tagReportData.spending_by_category.map((cat: any) => ({ name: cat.category, value: Math.abs(cat.amount) }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(entry) => `${entry.name}: ${formatCurrency(entry.value)}`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {tagReportData.spending_by_category.map((_: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: any) => formatCurrency(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex justify-center items-center h-[300px]">
                        <p className="text-foreground-muted">No category data</p>
                      </div>
                    )}
                  </Card>

                  {/* Distribution by Account */}
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Distribution by Account</h3>
                    {tagReportData.distribution_by_account?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={tagReportData.distribution_by_account.map((acc: any) => ({ name: acc.account, value: Math.abs(acc.amount) }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(entry) => `${entry.name}: ${formatCurrency(entry.value)}`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {tagReportData.distribution_by_account.map((_: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: any) => formatCurrency(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex justify-center items-center h-[300px]">
                        <p className="text-foreground-muted">No account data</p>
                      </div>
                    )}
                  </Card>
                </div>

                {/* Monthly Trend */}
                {tagReportData.monthly_trend?.length > 0 && (
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Monthly Trend</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={tagReportData.monthly_trend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip formatter={(value: any) => formatCurrency(value)} />
                        <Legend />
                        <Line type="monotone" dataKey="income" stroke="#00C49F" strokeWidth={2} name="Income" />
                        <Line type="monotone" dataKey="expenses" stroke="#FF8042" strokeWidth={2} name="Expenses" />
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>
                )}

                {/* Transactions Table */}
                {tagReportData.transactions?.length > 0 && (
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Transactions ({tagReportData.transactions.length})</h3>
                    <div className="max-h-[400px] overflow-auto">
                      <Card className="overflow-hidden border border-border">
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
