import { useQuery } from '@tanstack/react-query';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { accountsAPI, transactionsAPI, reportsAPI, budgetsAPI, envelopesAPI, settingsAPI } from '../services/api';
import { Card, Badge, Progress, Spinner, Button } from '../components/shadcn';
import {
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Lightbulb,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';

// Recharts
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// Nivo
import { ResponsiveSunburst } from '@nivo/sunburst';
import { ResponsivePie } from '@nivo/pie';

interface KPICardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  iconColor: string;
  loading?: boolean;
}

function KPICard({ title, value, change, changeLabel, icon, iconColor, loading }: KPICardProps) {
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
            <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${isPositive ? 'bg-success/10 text-success' :
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
            <p className="text-2xl font-bold text-foreground">{value}</p>
          )}
          {changeLabel && (
            <p className="text-xs text-foreground-muted mt-1">{changeLabel}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

interface AccountBalanceItemProps {
  name: string;
  balance: number;
  currency: string;
}

function AccountBalanceItem({ name, balance, currency }: AccountBalanceItemProps) {
  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-surface-hover transition-colors">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-lg font-bold text-foreground">
          {new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(balance)}
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  // Current date calculations
  const now = new Date();
  const currentMonthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const currentMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const previousMonth = subMonths(now, 1);
  const previousMonthStart = format(startOfMonth(previousMonth), 'yyyy-MM-dd');
  const previousMonthEnd = format(endOfMonth(previousMonth), 'yyyy-MM-dd');

  // Fetch user settings
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settingsAPI.getAll();
      return response.data.settings || {};
    },
  });

  const displayCurrency = settings?.display_currency || 'EUR';

  // Fetch current month data
  const { data: transactionsSummary, isLoading: transactionsLoading, isError: transactionsError } = useQuery({
    queryKey: ['transactions-summary'],
    queryFn: async () => {
      const response = await transactionsAPI.getSummary({ start_date: currentMonthStart, end_date: currentMonthEnd });
      return response.data;
    },
  });

  // Fetch previous month data for deltas
  const { data: previousTransactionsSummary } = useQuery({
    queryKey: ['transactions-summary-previous'],
    queryFn: async () => {
      const response = await transactionsAPI.getSummary({ start_date: previousMonthStart, end_date: previousMonthEnd });
      return response.data;
    },
  });

  // Fetch net worth
  const { data: netWorthData, isLoading: netWorthLoading, isError: netWorthError } = useQuery({
    queryKey: ['net-worth'],
    queryFn: async () => {
      const response = await reportsAPI.getNetWorth();
      return response.data;
    },
  });

  // Fetch net worth trend for delta
  const { data: netWorthTrend } = useQuery({
    queryKey: ['net-worth-trend'],
    queryFn: async () => {
      const response = await reportsAPI.getNetWorthTrend(2);
      return response.data.trend;
    },
  });

  // Fetch spending trends for chart
  const { data: spendingTrends } = useQuery({
    queryKey: ['spending-trends'],
    queryFn: async () => {
      const response = await reportsAPI.getSpendingTrends(6);
      return response.data.trends || [];
    },
  });

  // Fetch accounts
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await accountsAPI.getAll();
      return response.data.accounts || [];
    },
  });

  // Fetch spending by category
  const { data: spendingByCategory } = useQuery({
    queryKey: ['spending-by-category'],
    queryFn: async () => {
      const response = await reportsAPI.getSpendingByCategory({ start_date: currentMonthStart, end_date: currentMonthEnd });
      return response.data.categories || [];
    },
  });

  // Fetch income by category
  const { data: incomeByCategory } = useQuery({
    queryKey: ['income-by-category'],
    queryFn: async () => {
      const response = await reportsAPI.getIncomeVsExpenses({ start_date: currentMonthStart, end_date: currentMonthEnd });
      return response.data.income_categories || [];
    },
  });

  // Fetch budgets
  const { data: budgetsVsActual } = useQuery({
    queryKey: ['budgets-vs-actual'],
    queryFn: async () => {
      const response = await budgetsAPI.getVsActual(now.getFullYear(), now.getMonth() + 1);
      const categories = response.data.categories || [];
      return categories.map((item: any) => ({
        category_name: item.type_name,
        budget_amount: item.budget,
        spent: item.actual,
        ...item,
      }));
    },
  });

  // Fetch spending prediction
  const { data: spendingPrediction } = useQuery({
    queryKey: ['spending-prediction'],
    queryFn: async () => {
      const response = await reportsAPI.getSpendingPrediction(1);
      return response.data.prediction;
    },
  });

  // Fetch active envelopes
  const { data: activeEnvelopes } = useQuery({
    queryKey: ['active-envelopes'],
    queryFn: async () => {
      const response = await envelopesAPI.getAll();
      const allEnvelopes = response.data.envelopes || [];
      return allEnvelopes.filter((e: any) => e.is_active && e.current_amount < e.target_amount).slice(0, 5);
    },
  });

  const formatCurrency = (amount: number, currency?: string) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency || displayCurrency,
    }).format(amount);
  };

  // Helper function to safely calculate percentage change
  const calculatePercentageChange = (current: number, previous: number): number => {
    if (previous === 0) {
      // If previous is 0 and current is positive, that's technically infinite growth
      // Return 0 to avoid NaN/Infinity in UI
      return current > 0 ? 100 : 0;
    }
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  // Loading state
  if (transactionsLoading || netWorthLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  // Error state
  if (transactionsError || netWorthError) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Card className="p-6 max-w-md">
          <h2 className="text-xl font-semibold text-error mb-2">Error Loading Dashboard</h2>
          <p className="text-foreground-muted mb-4">
            We encountered an error while loading your financial data. Please try refreshing the page.
          </p>
          <Button onClick={() => window.location.reload()}>Refresh Page</Button>
        </Card>
      </div>
    );
  }

  // Calculate KPIs
  const netWorth = netWorthData?.net_worth ?? 0;
  const monthlyIncome = transactionsSummary?.total_income ?? 0;
  const monthlyExpenses = Math.abs(transactionsSummary?.total_expense ?? 0);
  const monthlySavings = monthlyIncome - monthlyExpenses;

  const previousIncome = previousTransactionsSummary?.total_income ?? 0;
  const previousExpenses = Math.abs(previousTransactionsSummary?.total_expense ?? 0);
  const previousSavings = previousIncome - previousExpenses;

  // Calculate deltas with safe percentage calculation
  const netWorthChange = netWorthTrend && netWorthTrend.length >= 2
    ? calculatePercentageChange(
        netWorthTrend[netWorthTrend.length - 1].net_worth,
        netWorthTrend[netWorthTrend.length - 2].net_worth
      )
    : 0;

  const incomeChange = calculatePercentageChange(monthlyIncome, previousIncome);
  const expensesChange = calculatePercentageChange(monthlyExpenses, previousExpenses);
  const savingsChange = calculatePercentageChange(monthlySavings, previousSavings);

  // Prepare chart data
  const incomeExpenseChartData = spendingTrends?.map((item: any) => ({
    month: item.month,
    income: item.total_income ?? 0,
    expenses: Math.abs(item.total_expenses ?? 0),
  })) ?? [];

  // Prepare sunburst data
  const sunburstData = {
    name: 'Expenses',
    children: spendingByCategory?.slice(0, 8).map((cat: any) => ({
      name: cat.category || 'Other',
      value: Math.abs(cat.total ?? 0),
    })) ?? [],
  };

  // Prepare Nivo pie data for income
  const nivoPieData = incomeByCategory?.map((item: any) => ({
    id: item.category || 'Other',
    label: item.category || 'Other',
    value: item.total ?? 0,
  })) ?? [];

  // Budget data
  const budgetArray = Array.isArray(budgetsVsActual) ? budgetsVsActual : [];
  const budgetChartData = budgetArray.slice(0, 8).map((budget: any) => ({
    name: budget.category_name?.length > 12 ? budget.category_name.substring(0, 12) + '...' : (budget.category_name || 'Unknown'),
    budget: budget.budget_amount || 0,
    spent: budget.spent || 0,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Financial Overview</h1>
        <p className="text-foreground-muted">
          {format(now, 'MMMM yyyy')} • Your complete financial snapshot
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Net Worth"
          value={formatCurrency(netWorth)}
          change={netWorthChange}
          changeLabel="vs last month"
          icon={<Wallet size={24} className="text-blue-500" />}
          iconColor="bg-blue-500"
          loading={netWorthLoading}
        />

        <KPICard
          title="Monthly Income"
          value={formatCurrency(monthlyIncome)}
          change={incomeChange}
          changeLabel="vs last month"
          icon={<ArrowUpCircle size={24} className="text-emerald-500" />}
          iconColor="bg-emerald-500"
          loading={transactionsLoading}
        />

        <KPICard
          title="Monthly Expenses"
          value={formatCurrency(monthlyExpenses)}
          change={expensesChange}
          changeLabel="vs last month"
          icon={<ArrowDownCircle size={24} className="text-rose-500" />}
          iconColor="bg-rose-500"
          loading={transactionsLoading}
        />

        <KPICard
          title="Monthly Savings"
          value={formatCurrency(monthlySavings)}
          change={savingsChange}
          changeLabel="vs last month"
          icon={<PiggyBank size={24} className="text-violet-500" />}
          iconColor="bg-violet-500"
          loading={transactionsLoading}
        />
      </div>

      {/* Monthly Summary - Kept from original */}
      <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-foreground mb-4">Monthly Summary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="text-center p-4 rounded-lg bg-success/10 border border-success/20">
            <p className="text-sm text-foreground-muted mb-2">Income</p>
            <p className="text-3xl font-bold text-success">{formatCurrency(monthlyIncome)}</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-error/10 border border-error/20">
            <p className="text-sm text-foreground-muted mb-2">Expenses</p>
            <p className="text-3xl font-bold text-error">{formatCurrency(monthlyExpenses)}</p>
          </div>
          <div className={`text-center p-4 rounded-lg ${monthlySavings >= 0 ? 'bg-primary/10 border border-primary/20' : 'bg-warning/10 border border-warning/20'}`}>
            <p className="text-sm text-foreground-muted mb-2">Net Savings</p>
            <p className={`text-3xl font-bold ${monthlySavings >= 0 ? 'text-primary' : 'text-warning'}`}>
              {formatCurrency(monthlySavings)}
            </p>
          </div>
        </div>
      </Card>

      {/* Income vs Expenses Chart + Account Balances */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Income vs Expenses Trend */}
        <Card className="lg:col-span-2 p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">Income vs Expenses</h2>
            <p className="text-sm text-foreground-muted">Last 6 months trend</p>
          </div>

          <div className="h-[300px]">
            {incomeExpenseChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={incomeExpenseChartData}>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" opacity={0.2} vertical={false} />
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
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#incomeGradient)"
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fill="url(#expensesGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-foreground-muted">
                No income/expense trend data available
              </div>
            )}
          </div>
        </Card>

        {/* Account Balances */}
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">Account Balances</h2>
            <p className="text-sm text-foreground-muted">Current holdings</p>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {accounts && accounts.length > 0 ? (
              accounts.slice(0, 5).map((account: any) => (
                <AccountBalanceItem
                  key={account.id}
                  name={account.name}
                  balance={account.balance ?? 0}
                  currency={account.currency || displayCurrency}
                />
              ))
            ) : (
              <div className="flex items-center justify-center h-[200px] text-foreground-muted">
                No accounts available
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Budget Overview - Kept from original */}
      {budgetArray.length > 0 && (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Budget Overview</h2>
            </div>
            <Link to="/budgets">
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </div>

          {/* Budget Chart */}
          <div className="mb-6">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={budgetChartData} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" opacity={0.2} horizontal={true} vertical={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={110}
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #2a2a2a',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value: any) => formatCurrency(value)}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '10px' }}
                  iconType="circle"
                />
                <Bar dataKey="budget" name="Budget" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                <Bar dataKey="spent" name="Spent" fill="#f59e0b" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Budget Progress Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {budgetArray.slice(0, 8).map((budget: any) => {
              const progress = budget.budget_amount > 0 ? (budget.spent / budget.budget_amount) * 100 : 0;
              const remaining = budget.budget_amount - budget.spent;
              const isOverBudget = progress > 100;
              const progressVariant = progress < 80 ? 'success' : progress < 100 ? 'warning' : 'error';

              return (
                <div
                  key={budget.category_name}
                  className="p-4 rounded-xl bg-card border border-border hover:bg-surface-hover transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-foreground text-sm truncate" title={budget.category_name}>
                      {budget.category_name}
                    </p>
                    <div className={`text-xs font-medium px-2 py-0.5 rounded ${isOverBudget ? 'bg-error/10 text-error' : 'bg-success/10 text-success'
                      }`}>
                      {progress.toFixed(0)}%
                    </div>
                  </div>
                  <p className="text-xs text-foreground-muted mb-3">
                    {formatCurrency(budget.spent)} / {formatCurrency(budget.budget_amount)}
                  </p>
                  <Progress value={Math.min(progress, 100)} variant={progressVariant} size="md" className="mb-2" />
                  <p className={`text-xs font-medium ${isOverBudget ? 'text-error' : 'text-success'}`}>
                    {isOverBudget ? 'Over by ' : 'Remaining: '}
                    {formatCurrency(Math.abs(remaining))}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Spending Breakdown - Sunburst */}
      {sunburstData.children.length > 0 && (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">Spending Breakdown</h2>
            <p className="text-sm text-foreground-muted">Category distribution this month</p>
          </div>

          <div className="h-[400px]">
            <ResponsiveSunburst
              data={sunburstData}
              margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
              id="name"
              value="value"
              cornerRadius={2}
              borderWidth={2}
              borderColor="#0a0a0a"
              colors={['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#ef4444']}
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

      {/* Income Nivo Pie */}
      {nivoPieData.length > 0 && (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Income by Category (This Month)</h2>
          <div className="h-[400px]">
            <ResponsivePie
              data={nivoPieData}
              margin={{ top: 20, right: 80, bottom: 20, left: 80 }}
              innerRadius={0.5}
              padAngle={0.7}
              cornerRadius={3}
              activeOuterRadiusOffset={8}
              colors={['#10b981', '#06b6d4', '#84cc16', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444']}
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
      )}

      {/* Spending Prediction - Kept from original */}
      {spendingPrediction && (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Next Month Prediction</h2>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-3xl font-bold text-primary mb-2">
                {formatCurrency(spendingPrediction.predicted || 0)}
              </p>
              <p className="text-sm text-foreground-muted">Predicted spending for next month</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Base: {formatCurrency(spendingPrediction.base_prediction || 0)}</Badge>
              <Badge variant={spendingPrediction.confidence > 0.7 ? 'success' : 'warning'}>
                Confidence: {Math.round((spendingPrediction.confidence || 0) * 100)}%
              </Badge>
              {spendingPrediction.recurring_amount > 0 && (
                <Badge variant="outline">Recurring: {formatCurrency(spendingPrediction.recurring_amount)}</Badge>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Savings Goals Section - Kept from original */}
      {activeEnvelopes && activeEnvelopes.length > 0 && (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <PiggyBank className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Active Savings Goals</h2>
            </div>
            <Link to="/envelopes">
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeEnvelopes.map((envelope: any) => {
              const progress = envelope.target_amount > 0 ? (envelope.current_amount / envelope.target_amount) * 100 : 0;
              const remaining = envelope.target_amount - envelope.current_amount;
              const daysLeft = envelope.deadline ? Math.ceil((new Date(envelope.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
              const progressVariant = progress < 50 ? 'info' : progress < 80 ? 'default' : 'success';

              return (
                <div key={envelope.id}>
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-medium text-foreground">{envelope.name}</p>
                    {daysLeft !== null && (
                      <Badge variant={daysLeft > 0 ? 'info' : 'error'} size="sm">
                        {daysLeft > 0 ? `${daysLeft}d left` : 'Overdue'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-foreground-muted mb-2">
                    {formatCurrency(envelope.current_amount)} / {formatCurrency(envelope.target_amount)}
                  </p>
                  <Progress value={Math.min(progress, 100)} variant={progressVariant} size="md" className="mb-1" />
                  <p className="text-xs text-foreground-muted">
                    {progress.toFixed(0)}% - {formatCurrency(remaining)} to go
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
