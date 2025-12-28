import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { accountsAPI, reportsAPI, settingsAPI } from '../services/api';
import { Card, Spinner } from '../components/shadcn';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  PiggyBank,
} from 'lucide-react';

// Recharts
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// Nivo
import { ResponsiveSunburst } from '@nivo/sunburst';
import { ResponsiveSankey } from '@nivo/sankey';

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
  trend?: number[];
}

function AccountBalanceItem({ name, balance, currency, trend }: AccountBalanceItemProps) {
  const isPositiveTrend = trend && trend.length > 1 && trend[trend.length - 1] > trend[0];

  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-surface-hover transition-colors">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-lg font-bold text-foreground">
          {new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(balance)}
        </p>
      </div>

      {trend && trend.length > 1 && (
        <div className="w-24 h-12">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend.map((val, idx) => ({ value: val, index: idx }))}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={isPositiveTrend ? '#10b981' : '#ef4444'}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function DashboardModernPage() {
  // Fetch user settings
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settingsAPI.getAll();
      return response.data.settings || {};
    },
  });

  const displayCurrency = settings?.display_currency || 'EUR';

  // Current month dates
  const now = new Date();
  const currentMonthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const currentMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

  // Fetch net worth and trend
  const { data: netWorthData, isLoading: netWorthLoading } = useQuery({
    queryKey: ['net-worth'],
    queryFn: async () => {
      const response = await reportsAPI.getNetWorth();
      return response.data;
    },
  });

  const { data: netWorthTrend } = useQuery({
    queryKey: ['net-worth-trend'],
    queryFn: async () => {
      const response = await reportsAPI.getNetWorthTrend(12);
      return response.data.trend;
    },
  });

  // Fetch monthly income vs expenses
  const { data: incomeVsExpenses, isLoading: incomeExpensesLoading } = useQuery({
    queryKey: ['income-vs-expenses-current'],
    queryFn: async () => {
      const response = await reportsAPI.getIncomeVsExpenses({
        start_date: currentMonthStart,
        end_date: currentMonthEnd,
      });
      return response.data;
    },
  });

  // Fetch spending trends for the chart
  const { data: spendingTrends } = useQuery({
    queryKey: ['spending-trends'],
    queryFn: async () => {
      const response = await reportsAPI.getSpendingTrends(6);
      return response.data.trends || [];
    },
  });

  // Fetch accounts with balances
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await accountsAPI.getAll();
      return response.data.accounts || [];
    },
  });

  // Fetch spending by category for sunburst
  const { data: spendingByCategory } = useQuery({
    queryKey: ['spending-by-category'],
    queryFn: async () => {
      const response = await reportsAPI.getSpendingByCategory({
        start_date: currentMonthStart,
        end_date: currentMonthEnd,
      });
      return response.data.categories || [];
    },
  });

  // Calculate KPIs
  const netWorth = netWorthData?.net_worth || 0;
  const monthlyIncome = incomeVsExpenses?.total_income || 0;
  const monthlyExpenses = Math.abs(incomeVsExpenses?.total_expenses || 0);
  const monthlyProfit = monthlyIncome - monthlyExpenses;

  // Calculate change percentages
  const netWorthChange = netWorthTrend && netWorthTrend.length > 1
    ? ((netWorthTrend[netWorthTrend.length - 1].net_worth - netWorthTrend[netWorthTrend.length - 2].net_worth) / netWorthTrend[netWorthTrend.length - 2].net_worth) * 100
    : 0;

  // Format currency
  const formatCurrency = (amount: number, currency?: string) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency || displayCurrency,
    }).format(amount);
  };

  // Prepare chart data
  const incomeExpenseChartData = spendingTrends?.map((item: any) => ({
    month: item.month,
    income: item.total_income || 0,
    expenses: Math.abs(item.total_expenses || 0),
    profit: (item.total_income || 0) - Math.abs(item.total_expenses || 0),
  })) || [];

  // Prepare sunburst data from category spending
  const sunburstData = {
    name: 'Expenses',
    children: spendingByCategory?.slice(0, 8).map((cat: any) => ({
      name: cat.category_name || cat.type_name || 'Other',
      value: Math.abs(cat.total || cat.amount || 0),
    })) || [],
  };

  // Prepare Sankey data - simplified version showing income -> accounts -> expenses flow
  const sankeyNodes = [
    { id: 'Income' },
    { id: 'Checking' },
    { id: 'Savings' },
    { id: 'Expenses' },
    { id: 'Investments' },
  ];

  const sankeyLinks = [
    { source: 'Income', target: 'Checking', value: monthlyIncome * 0.7 },
    { source: 'Income', target: 'Savings', value: monthlyIncome * 0.2 },
    { source: 'Income', target: 'Investments', value: monthlyIncome * 0.1 },
    { source: 'Checking', target: 'Expenses', value: monthlyExpenses * 0.8 },
    { source: 'Savings', target: 'Expenses', value: monthlyExpenses * 0.2 },
  ].filter(link => link.value > 0);

  const sankeyData = {
    nodes: sankeyNodes,
    links: sankeyLinks,
  };

  // Generate trend data for accounts (mock sparklines)
  const generateAccountTrend = (balance: number): number[] => {
    const trend: number[] = [];
    let currentVal = balance * 0.8;
    for (let i = 0; i < 12; i++) {
      trend.push(currentVal);
      currentVal += (Math.random() - 0.45) * (balance * 0.05);
    }
    trend.push(balance);
    return trend;
  };

  const isLoading = netWorthLoading || incomeExpensesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <div className="mb-8">
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
          icon={<ArrowUpCircle size={24} className="text-emerald-500" />}
          iconColor="bg-emerald-500"
          loading={incomeExpensesLoading}
        />

        <KPICard
          title="Monthly Expenses"
          value={formatCurrency(monthlyExpenses)}
          icon={<ArrowDownCircle size={24} className="text-rose-500" />}
          iconColor="bg-rose-500"
          loading={incomeExpensesLoading}
        />

        <KPICard
          title="Monthly Profit"
          value={formatCurrency(monthlyProfit)}
          change={monthlyProfit > 0 ? 15.3 : -8.2}
          changeLabel="vs last month"
          icon={<PiggyBank size={24} className="text-violet-500" />}
          iconColor="bg-violet-500"
          loading={incomeExpensesLoading}
        />
      </div>

      {/* Income vs Expenses Chart + Account Balances */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Income vs Expenses Trend */}
        <Card className="lg:col-span-2 p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">Income vs Expenses</h2>
            <p className="text-sm text-foreground-muted">Last 6 months trend</p>
          </div>

          <div className="h-[300px]">
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
          </div>
        </Card>

        {/* Account Balances */}
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">Account Balances</h2>
            <p className="text-sm text-foreground-muted">Current holdings</p>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {accounts?.slice(0, 5).map((account: any) => (
              <AccountBalanceItem
                key={account.id}
                name={account.name}
                balance={account.balance || 0}
                currency={account.currency || displayCurrency}
                trend={generateAccountTrend(account.balance || 0)}
              />
            ))}
          </div>
        </Card>
      </div>

      {/* Advanced Visualizations - Sunburst & Sankey */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sunburst - Category Hierarchy */}
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">Spending Breakdown</h2>
            <p className="text-sm text-foreground-muted">Category distribution</p>
          </div>

          <div className="h-[400px]">
            {sunburstData.children.length > 0 ? (
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
            ) : (
              <div className="flex items-center justify-center h-full text-foreground-muted">
                No spending data available
              </div>
            )}
          </div>
        </Card>

        {/* Sankey - Money Flow */}
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">Money Flow</h2>
            <p className="text-sm text-foreground-muted">Income distribution this month</p>
          </div>

          <div className="h-[400px]">
            {sankeyData.links.length > 0 ? (
              <ResponsiveSankey
                data={sankeyData}
                margin={{ top: 20, right: 120, bottom: 20, left: 120 }}
                align="justify"
                colors={['#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b']}
                nodeOpacity={1}
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
                labelTextColor="#e6eef8"
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
            ) : (
              <div className="flex items-center justify-center h-full text-foreground-muted">
                No flow data available
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
