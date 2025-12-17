import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { accountsAPI, transactionsAPI, reportsAPI, budgetsAPI, envelopesAPI } from '../services/api';
import { format } from 'date-fns';
import { Card, Badge, Progress, Spinner, Button } from '../components/shadcn';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Lightbulb,
  LineChart as LineChartIcon,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const INCOME_COLORS = ['#10b981', '#06b6d4', '#84cc16', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444'];

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  iconBgClass: string;
}

function MetricCard({ title, value, icon, iconBgClass }: MetricCardProps) {
  return (
    <Card className="p-5 rounded-xl">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-foreground-muted mb-1">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${iconBgClass}`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: accountsSummary, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts-summary'],
    queryFn: async () => {
      const response = await accountsAPI.getSummary();
      return response.data.summary;
    },
  });

  const { data: transactionsSummary, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions-summary'],
    queryFn: async () => {
      const now = new Date();
      const startDate = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
      const endDate = format(now, 'yyyy-MM-dd');
      const response = await transactionsAPI.getSummary({ start_date: startDate, end_date: endDate });
      return response.data;
    },
  });

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
      const response = await reportsAPI.getNetWorthTrend(6);
      return response.data.trend;
    },
  });

  const { data: spendingPrediction } = useQuery({
    queryKey: ['spending-prediction'],
    queryFn: async () => {
      const response = await reportsAPI.getSpendingPrediction(1);
      return response.data.prediction;
    },
  });

  const { data: spendingByCategory } = useQuery({
    queryKey: ['spending-by-category'],
    queryFn: async () => {
      const now = new Date();
      const startDate = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
      const endDate = format(now, 'yyyy-MM-dd');
      const response = await reportsAPI.getSpendingByCategory({ start_date: startDate, end_date: endDate });
      return response.data.categories || [];
    },
  });

  const { data: incomeByCategory } = useQuery({
    queryKey: ['income-by-category'],
    queryFn: async () => {
      const now = new Date();
      const startDate = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
      const endDate = format(now, 'yyyy-MM-dd');
      const response = await reportsAPI.getIncomeVsExpenses({ start_date: startDate, end_date: endDate });
      return response.data.income_categories || [];
    },
  });

  const { data: budgetsVsActual } = useQuery({
    queryKey: ['budgets-vs-actual'],
    queryFn: async () => {
      const now = new Date();
      const response = await budgetsAPI.getVsActual(now.getFullYear(), now.getMonth() + 1);
      // API returns { budgets: [...] } or an array directly
      return response.data.budgets || response.data || [];
    },
  });

  const { data: activeEnvelopes } = useQuery({
    queryKey: ['active-envelopes'],
    queryFn: async () => {
      const response = await envelopesAPI.getAll();
      const allEnvelopes = response.data.envelopes || [];
      return allEnvelopes.filter((e: any) => e.is_active && e.current_amount < e.target_amount).slice(0, 5);
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  if (accountsLoading || transactionsLoading || netWorthLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const totalAssets = accountsSummary?.reduce((sum: number, owner: any) => sum + owner.total_balance, 0) || 0;
  const netWorth = netWorthData?.net_worth || 0;
  const monthlyIncome = transactionsSummary?.total_income || 0;
  const monthlyExpenses = transactionsSummary?.total_expense || 0;
  const monthlySavings = monthlyIncome - monthlyExpenses;

  // Prepare budget chart data (ensure budgetsVsActual is an array)
  const budgetArray = Array.isArray(budgetsVsActual) ? budgetsVsActual : [];
  const budgetChartData = budgetArray.slice(0, 8).map((budget: any) => ({
    name: budget.category_name?.length > 12 ? budget.category_name.substring(0, 12) + '...' : (budget.category_name || 'Unknown'),
    budget: budget.budget_amount || 0,
    spent: budget.spent || 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Dashboard</h1>
        <p className="text-foreground-muted">Welcome back! Here's your financial overview.</p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Assets"
          value={formatCurrency(totalAssets)}
          icon={<Building2 className="w-5 h-5 text-primary" />}
          iconBgClass="bg-primary/10"
        />
        <MetricCard
          title="Net Worth"
          value={formatCurrency(netWorth)}
          icon={<PiggyBank className="w-5 h-5 text-success" />}
          iconBgClass="bg-success/10"
        />
        <MetricCard
          title="Monthly Income"
          value={formatCurrency(monthlyIncome)}
          icon={<TrendingUp className="w-5 h-5 text-success" />}
          iconBgClass="bg-success/10"
        />
        <MetricCard
          title="Monthly Expenses"
          value={formatCurrency(monthlyExpenses)}
          icon={<TrendingDown className="w-5 h-5 text-error" />}
          iconBgClass="bg-error/10"
        />
      </div>

      {/* Monthly Summary - Full Width */}
      <Card className="p-6 rounded-xl">
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

      {/* Budget Overview - Full Width */}
      {budgetArray.length > 0 && (
        <Card className="p-6 rounded-xl">
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
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={budgetChartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis type="number" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} tick={{ fill: '#9fb0c8' }} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fill: '#9fb0c8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  formatter={(value: any) => formatCurrency(value)}
                />
                <Legend />
                <Bar dataKey="budget" name="Budget" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                <Bar dataKey="spent" name="Spent" fill="#f59e0b" radius={[0, 4, 4, 0]} />
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
                <div key={budget.category_name} className="p-3 rounded-lg bg-surface/50 border border-border">
                  <p className="font-medium text-foreground mb-1 truncate" title={budget.category_name}>
                    {budget.category_name}
                  </p>
                  <p className="text-xs text-foreground-muted mb-2">
                    {formatCurrency(budget.spent)} / {formatCurrency(budget.budget_amount)}
                  </p>
                  <Progress value={Math.min(progress, 100)} variant={progressVariant} size="sm" className="mb-1" />
                  <p className={`text-xs ${isOverBudget ? 'text-error' : 'text-success'}`}>
                    {isOverBudget ? 'Over by ' : 'Remaining: '}
                    {formatCurrency(Math.abs(remaining))}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Spending Prediction */}
      {spendingPrediction && (
        <Card className="p-5 rounded-xl">
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

      {/* Net Worth Trend Chart */}
      {netWorthTrend && netWorthTrend.length > 0 && (
        <Card className="p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-4">
            <LineChartIcon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Net Worth Trend (Last 6 Months)</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={netWorthTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis
                dataKey="month"
                tick={{ fill: '#9fb0c8' }}
                tickFormatter={(value) => value.split(' ')[0]}
              />
              <YAxis
                tick={{ fill: '#9fb0c8' }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                formatter={(value: any) => formatCurrency(value)}
              />
              <Legend />
              <Line type="monotone" dataKey="net_worth" name="Net Worth" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} />
              <Line type="monotone" dataKey="assets" name="Assets" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 4 }} />
              <Line type="monotone" dataKey="debts" name="Debts" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Pie Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {spendingByCategory && spendingByCategory.length > 0 && (
          <Card className="p-5 rounded-xl">
            <h2 className="text-lg font-semibold text-foreground mb-4">Spending by Category (This Month)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={spendingByCategory}
                  dataKey="total"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(entry) => `${entry.category}: ${formatCurrency(entry.total)}`}
                >
                  {spendingByCategory.map((_entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatCurrency(value)} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}

        {incomeByCategory && incomeByCategory.length > 0 && (
          <Card className="p-5 rounded-xl">
            <h2 className="text-lg font-semibold text-foreground mb-4">Income by Category (This Month)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={incomeByCategory}
                  dataKey="total"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(entry) => `${entry.category}: ${formatCurrency(entry.total)}`}
                >
                  {incomeByCategory.map((_entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={INCOME_COLORS[index % INCOME_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatCurrency(value)} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* Savings Goals Section */}
      {activeEnvelopes && activeEnvelopes.length > 0 && (
        <Card className="p-5 rounded-xl">
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
