import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  format,
  subMonths,
  startOfMonth,
  endOfMonth,
  addMonths,
  isSameMonth,
} from "date-fns";
import {
  accountsAPI,
  transactionsAPI,
  reportsAPI,
  budgetsAPI,
  envelopesAPI,
  settingsAPI,
  investmentsAPI,
} from "../services/api";
import {
  Card,
  Badge,
  Progress,
  Button,
  DashboardSkeleton,
} from "../components/shadcn";
import { formatCurrency as formatCurrencyUtil } from "../lib/utils";
import { absMoney, subtractMoney, percentChange } from "../lib/money";
import { useIsMobile } from "../hooks/useBreakpoint";
import KPICard from "../components/KPICard";
import PageHeader from "../components/PageHeader";
import QueryError from "../components/QueryError";
import {
  TrendingUp,
  PiggyBank,
  Lightbulb,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Shuffle,
} from "lucide-react";
import { Link } from "react-router-dom";

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
  ResponsiveContainer,
} from "recharts";

// Nivo
import { ResponsiveSunburst } from "@nivo/sunburst";
import { ResponsivePie } from "@nivo/pie";

interface AccountBalanceItemProps {
  name: string;
  balance: number;
  currency: string;
}

function AccountBalanceItem({
  name,
  balance,
  currency,
}: AccountBalanceItemProps) {
  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-surface-hover transition-colors">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-lg font-bold text-foreground">
          {formatCurrencyUtil(balance, currency)}
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const isMobile = useIsMobile();
  const today = new Date();

  // Navigable month state (defaults to current month)
  const [viewDate, setViewDate] = useState(today);
  const isCurrentMonth = isSameMonth(viewDate, today);

  const currentMonthStart = format(startOfMonth(viewDate), "yyyy-MM-dd");
  const currentMonthEnd = format(endOfMonth(viewDate), "yyyy-MM-dd");
  const previousMonth = subMonths(viewDate, 1);
  const previousMonthStart = format(startOfMonth(previousMonth), "yyyy-MM-dd");
  const previousMonthEnd = format(endOfMonth(previousMonth), "yyyy-MM-dd");

  // Fetch user settings
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const response = await settingsAPI.getAll();
      return response.data.settings || {};
    },
  });

  const displayCurrency = settings?.display_currency || "EUR";

  // Fetch current month data
  const {
    data: transactionsSummary,
    isLoading: transactionsLoading,
    isError: transactionsError,
  } = useQuery({
    queryKey: ["transactions-summary", currentMonthStart, currentMonthEnd],
    queryFn: async () => {
      const response = await transactionsAPI.getSummary({
        start_date: currentMonthStart,
        end_date: currentMonthEnd,
      });
      return response.data;
    },
  });

  // Fetch previous month data for deltas
  const { data: previousTransactionsSummary } = useQuery({
    queryKey: [
      "transactions-summary-previous",
      previousMonthStart,
      previousMonthEnd,
    ],
    queryFn: async () => {
      const response = await transactionsAPI.getSummary({
        start_date: previousMonthStart,
        end_date: previousMonthEnd,
      });
      return response.data;
    },
  });

  // Fetch net worth
  const {
    data: netWorthData,
    isLoading: netWorthLoading,
    isError: netWorthError,
  } = useQuery({
    queryKey: ["net-worth"],
    queryFn: async () => {
      const response = await reportsAPI.getNetWorth();
      return response.data;
    },
  });

  // Fetch net worth trend for delta
  const { data: netWorthTrend } = useQuery({
    queryKey: ["net-worth-trend"],
    queryFn: async () => {
      const response = await reportsAPI.getNetWorthTrend(2);
      return response.data.trend;
    },
  });

  // Fetch spending trends for chart
  const { data: spendingTrends } = useQuery({
    queryKey: ["spending-trends"],
    queryFn: async () => {
      const response = await reportsAPI.getSpendingTrends(6);
      return response.data.trends || [];
    },
  });

  // Fetch accounts
  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const response = await accountsAPI.getAll();
      return response.data.accounts || [];
    },
    staleTime: 30 * 60 * 1000,
  });

  // Fetch spending by category
  const { data: spendingByCategory } = useQuery({
    queryKey: ["spending-by-category", currentMonthStart, currentMonthEnd],
    queryFn: async () => {
      const response = await reportsAPI.getSpendingByCategory({
        start_date: currentMonthStart,
        end_date: currentMonthEnd,
      });
      return response.data.categories || [];
    },
  });

  // Fetch income by category
  const { data: incomeByCategory } = useQuery({
    queryKey: ["income-by-category", currentMonthStart, currentMonthEnd],
    queryFn: async () => {
      const response = await reportsAPI.getIncomeVsExpenses({
        start_date: currentMonthStart,
        end_date: currentMonthEnd,
      });
      return response.data.income_categories || [];
    },
  });

  // Fetch budgets
  const { data: budgetsVsActual } = useQuery({
    queryKey: [
      "budgets-vs-actual",
      viewDate.getFullYear(),
      viewDate.getMonth(),
    ],
    queryFn: async () => {
      const response = await budgetsAPI.getVsActual(
        viewDate.getFullYear(),
        viewDate.getMonth() + 1,
      );
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
    queryKey: ["spending-prediction"],
    queryFn: async () => {
      const response = await reportsAPI.getSpendingPrediction(1);
      return response.data.prediction;
    },
  });

  // Fetch summary by owner for current month
  const { data: summaryByOwner } = useQuery({
    queryKey: ["summary-by-owner", currentMonthStart, currentMonthEnd],
    queryFn: async () => {
      const response = await transactionsAPI.getSummaryByOwner({
        start_date: currentMonthStart,
        end_date: currentMonthEnd,
      });
      return response.data.by_owner || [];
    },
  });

  // Fetch monthly investment activity (current and previous month for delta)
  const { data: monthlyInvestments, isLoading: investmentsLoading } = useQuery({
    queryKey: ["monthly-investments", currentMonthStart, currentMonthEnd],
    queryFn: async () => {
      const response = await investmentsAPI.getMonthly({
        start_date: currentMonthStart,
        end_date: currentMonthEnd,
      });
      return response.data;
    },
  });

  const { data: previousMonthlyInvestments } = useQuery({
    queryKey: [
      "monthly-investments-previous",
      previousMonthStart,
      previousMonthEnd,
    ],
    queryFn: async () => {
      const response = await investmentsAPI.getMonthly({
        start_date: previousMonthStart,
        end_date: previousMonthEnd,
      });
      return response.data;
    },
  });

  // Fetch active envelopes
  const { data: activeEnvelopes } = useQuery({
    queryKey: ["active-envelopes"],
    queryFn: async () => {
      const response = await envelopesAPI.getAll();
      const allEnvelopes = response.data.envelopes || [];
      return allEnvelopes
        .filter((e: any) => e.is_active && e.current_amount < e.target_amount)
        .slice(0, 5);
    },
  });

  const formatCurrency = (amount: number, currency?: string) => {
    return formatCurrencyUtil(amount, currency || displayCurrency);
  };

  // Helper function to safely calculate percentage change using precise decimal arithmetic
  const calculatePercentageChange = (
    current: number,
    previous: number,
  ): number => {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return percentChange(current, previous);
  };

  // Memoize chart data (must be before early returns to satisfy Rules of Hooks)
  const incomeExpenseChartData = useMemo(
    () =>
      spendingTrends?.map((item: any) => ({
        month: item.month,
        income: item.total_income ?? 0,
        expenses: absMoney(item.total_expenses ?? 0),
      })) ?? [],
    [spendingTrends],
  );

  const sunburstData = useMemo(
    () => ({
      name: "Expenses",
      children:
        spendingByCategory?.slice(0, 8).map((cat: any) => ({
          name: cat.category || "Other",
          value: absMoney(cat.total ?? 0),
        })) ?? [],
    }),
    [spendingByCategory],
  );

  const nivoPieData = useMemo(
    () =>
      incomeByCategory?.map((item: any) => ({
        id: item.category || "Other",
        label: item.category || "Other",
        value: item.total ?? 0,
      })) ?? [],
    [incomeByCategory],
  );

  const budgetArray = useMemo(
    () => (Array.isArray(budgetsVsActual) ? budgetsVsActual : []),
    [budgetsVsActual],
  );

  const budgetChartData = useMemo(
    () =>
      budgetArray.slice(0, 10).map((budget: any) => {
        const progress =
          budget.budget_amount > 0
            ? (budget.spent / budget.budget_amount) * 100
            : 0;
        return {
          name:
            budget.category_name?.length > 15
              ? budget.category_name.substring(0, 15) + "..."
              : budget.category_name || "Unknown",
          fullName: budget.category_name || "Unknown",
          progress: Math.min(progress, 100),
          overProgress: progress > 100 ? progress - 100 : 0,
          spent: budget.spent || 0,
          budget: budget.budget_amount || 0,
          isOverBudget: progress > 100,
        };
      }),
    [budgetArray],
  );

  // Loading state
  if (transactionsLoading || netWorthLoading) {
    return <DashboardSkeleton />;
  }

  // Error state
  if (transactionsError || netWorthError) {
    return (
      <QueryError
        message="Failed to load financial data. Please try refreshing the page."
        onRetry={() => window.location.reload()}
      />
    );
  }

  // Calculate KPIs using precise decimal arithmetic
  const netWorth = netWorthData?.net_worth ?? 0;
  const monthlyIncome = transactionsSummary?.total_income ?? 0;
  const monthlyExpenses = absMoney(transactionsSummary?.total_expense ?? 0);
  const monthlySavings = subtractMoney(monthlyIncome, monthlyExpenses);

  const previousIncome = previousTransactionsSummary?.total_income ?? 0;
  const previousExpenses = absMoney(
    previousTransactionsSummary?.total_expense ?? 0,
  );
  const previousSavings = subtractMoney(previousIncome, previousExpenses);

  // Calculate deltas with safe percentage calculation
  const netWorthChange =
    netWorthTrend && netWorthTrend.length >= 2
      ? calculatePercentageChange(
          netWorthTrend[netWorthTrend.length - 1].net_worth,
          netWorthTrend[netWorthTrend.length - 2].net_worth,
        )
      : 0;

  const incomeChange = calculatePercentageChange(monthlyIncome, previousIncome);
  const expensesChange = calculatePercentageChange(
    monthlyExpenses,
    previousExpenses,
  );
  const savingsChange = calculatePercentageChange(
    monthlySavings,
    previousSavings,
  );

  const monthlyInvested = monthlyInvestments?.total_invested ?? 0;
  const previousInvested = previousMonthlyInvestments?.total_invested ?? 0;
  const investedChange = calculatePercentageChange(
    monthlyInvested,
    previousInvested,
  );

  return (
    <div className="space-y-6">
      {/* Header with month navigation */}
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}`}
        description="Your complete financial snapshot"
        accentColor="border-l-blue-500"
        actions={
          <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-1 py-1">
            <button
              onClick={() => setViewDate((d) => subMonths(d, 1))}
              aria-label="Previous month"
              className="p-1.5 rounded hover:bg-surface-hover text-foreground-muted hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-foreground min-w-[100px] text-center">
              {format(viewDate, "MMMM yyyy")}
            </span>
            <button
              onClick={() => setViewDate((d) => addMonths(d, 1))}
              disabled={isCurrentMonth}
              aria-label="Next month"
              className="p-1.5 rounded hover:bg-surface-hover text-foreground-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-6">
        <KPICard
          title="Net Worth"
          value={formatCurrency(netWorth)}
          change={netWorthChange}
          changeLabel="vs last month"
          icon={<Wallet size={24} className="text-blue-500" />}
          iconColor="bg-blue-500"
          loading={netWorthLoading}
          primary
        />

        <KPICard
          title="Monthly Income"
          value={formatCurrency(monthlyIncome)}
          change={incomeChange}
          changeLabel="vs prev month"
          icon={<ArrowUpCircle size={24} className="text-emerald-500" />}
          iconColor="bg-emerald-500"
          loading={transactionsLoading}
          primary
        />

        <KPICard
          title="Monthly Expenses"
          value={formatCurrency(monthlyExpenses)}
          change={expensesChange}
          changeLabel="vs prev month"
          icon={<ArrowDownCircle size={24} className="text-rose-500" />}
          iconColor="bg-rose-500"
          loading={transactionsLoading}
          primary
        />

        <KPICard
          title="Monthly Savings"
          value={formatCurrency(monthlySavings)}
          change={savingsChange}
          changeLabel="vs prev month"
          icon={<PiggyBank size={24} className="text-violet-500" />}
          iconColor="bg-violet-500"
          loading={transactionsLoading}
          primary
        />

        <KPICard
          title="Monthly Invested"
          value={formatCurrency(monthlyInvested)}
          change={investedChange}
          changeLabel="vs prev month"
          icon={<TrendingUp size={24} className="text-amber-500" />}
          iconColor="bg-amber-500"
          loading={investmentsLoading}
          primary
        />
      </div>

      {/* Monthly Summary */}
      <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Monthly Summary — {format(viewDate, "MMMM yyyy")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="text-center p-4 rounded-lg bg-success/10 border border-success/20">
            <p className="text-sm text-foreground-muted mb-2">Income</p>
            <p className="text-3xl font-bold text-success">
              {formatCurrency(monthlyIncome)}
            </p>
          </div>
          <div className="text-center p-4 rounded-lg bg-error/10 border border-error/20">
            <p className="text-sm text-foreground-muted mb-2">Expenses</p>
            <p className="text-3xl font-bold text-error">
              {formatCurrency(monthlyExpenses)}
            </p>
          </div>
          <div
            className={`text-center p-4 rounded-lg ${monthlySavings >= 0 ? "bg-primary/10 border border-primary/20" : "bg-warning/10 border border-warning/20"}`}
          >
            <p className="text-sm text-foreground-muted mb-2">Net Savings</p>
            <p
              className={`text-3xl font-bold ${monthlySavings >= 0 ? "text-primary" : "text-warning"}`}
            >
              {formatCurrency(monthlySavings)}
            </p>
          </div>
        </div>

        {/* Per-Owner Breakdown */}
        {summaryByOwner && summaryByOwner.length > 0 && (
          <div className="mt-6 pt-6 border-t border-border">
            <h3 className="text-sm font-medium text-foreground-muted mb-4">
              By Owner
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {summaryByOwner.map((owner: any) => (
                <div
                  key={owner.owner_id}
                  className="p-3 rounded-lg bg-surface-hover border border-border"
                >
                  <p className="text-sm font-medium text-foreground mb-2">
                    {owner.owner_name}
                  </p>
                  <div className="flex justify-between text-xs">
                    <span className="text-success">
                      +{formatCurrency(owner.income)}
                    </span>
                    <span className="text-error">
                      -{formatCurrency(owner.expense)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Income vs Expenses Chart + Account Balances */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Income vs Expenses Trend */}
        <Card className="xl:col-span-2 p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              Income vs Expenses
            </h2>
            <p className="text-sm text-foreground-muted mb-3">
              Last 6 months trend
            </p>
            {incomeExpenseChartData.length > 0 && (
              <div className="flex gap-4 text-xs text-foreground-muted">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  Total In:{" "}
                  <span className="text-success font-medium">
                    {formatCurrency(
                      incomeExpenseChartData.reduce(
                        (s: number, d: any) => s + (d.income || 0),
                        0,
                      ),
                    )}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                  Total Out:{" "}
                  <span className="text-error font-medium">
                    {formatCurrency(
                      incomeExpenseChartData.reduce(
                        (s: number, d: any) => s + (d.expenses || 0),
                        0,
                      ),
                    )}
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="h-[300px]">
            {incomeExpenseChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={incomeExpenseChartData}>
                  <defs>
                    <linearGradient
                      id="incomeGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient
                      id="expensesGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#2a2a2a"
                    opacity={0.2}
                    vertical={false}
                  />
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
                      backgroundColor: "#0a0a0a",
                      border: "1px solid #2a2a2a",
                      borderRadius: "8px",
                      fontSize: "12px",
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
            <h2 className="text-lg font-semibold text-foreground">
              Account Balances
            </h2>
            <p className="text-sm text-foreground-muted">Current holdings</p>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {accounts && accounts.length > 0 ? (
              accounts
                .slice(0, 5)
                .map((account: any) => (
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

      {/* Budget Overview - Progress Graph */}
      {budgetArray.length > 0 && (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">
                  Budget Overview
                </h2>
              </div>
              <p className="text-xs text-foreground-muted">
                {budgetChartData.filter((b: any) => b.isOverBudget).length >
                0 ? (
                  <span className="text-error">
                    {budgetChartData.filter((b: any) => b.isOverBudget).length}{" "}
                    of {budgetChartData.length} categories over budget
                  </span>
                ) : (
                  <span className="text-success">
                    All {budgetChartData.length} categories within budget
                  </span>
                )}
              </p>
            </div>
            <Link to="/budgets">
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          </div>

          {/* Budget Progress Graph */}
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={budgetChartData}
                layout="vertical"
                margin={{
                  left: isMobile ? 80 : 130,
                  right: isMobile ? 10 : 40,
                  top: 10,
                  bottom: 10,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#2a2a2a"
                  opacity={0.2}
                  horizontal={true}
                  vertical={false}
                />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={120}
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={false}
                  contentStyle={{
                    backgroundColor: "#0a0a0a",
                    border: "1px solid #2a2a2a",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const totalProgress = data.progress + data.overProgress;
                      return (
                        <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-3">
                          <p className="font-semibold text-foreground mb-2">
                            {data.fullName}
                          </p>
                          <p className="text-sm text-foreground-muted">
                            Spent: {formatCurrency(data.spent)} /{" "}
                            {formatCurrency(data.budget)}
                          </p>
                          <p
                            className={`text-sm font-medium ${data.isOverBudget ? "text-error" : "text-success"}`}
                          >
                            {totalProgress.toFixed(1)}%{" "}
                            {data.isOverBudget ? "(Over Budget)" : "Used"}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="progress"
                  stackId="progress"
                  fill="#10b981"
                  radius={[0, 4, 4, 0]}
                  fillOpacity={0.8}
                />
                <Bar
                  dataKey="overProgress"
                  stackId="progress"
                  fill="#ef4444"
                  radius={[0, 4, 4, 0]}
                  fillOpacity={0.8}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Spending Breakdown - Sunburst */}
      {sunburstData.children.length > 0 && (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              Spending Breakdown
            </h2>
            <div className="flex items-center gap-3 mt-1 text-xs text-foreground-muted">
              <span>
                Category distribution — {format(viewDate, "MMMM yyyy")}
              </span>
              {sunburstData.children.length > 0 && (
                <span>
                  Top:{" "}
                  <span className="text-foreground font-medium">
                    {sunburstData.children[0]?.name}
                  </span>{" "}
                  ({formatCurrency(sunburstData.children[0]?.value || 0)})
                </span>
              )}
            </div>
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
              colors={[
                "#3b82f6",
                "#10b981",
                "#f59e0b",
                "#8b5cf6",
                "#ec4899",
                "#06b6d4",
                "#84cc16",
                "#ef4444",
              ]}
              childColor={{ from: "color", modifiers: [["brighter", 0.3]] }}
              enableArcLabels={true}
              arcLabelsSkipAngle={15}
              arcLabelsTextColor={{
                from: "color",
                modifiers: [["darker", 2.5]],
              }}
              animate={true}
              theme={{
                tooltip: {
                  container: {
                    background: "#0a0a0a",
                    border: "1px solid #2a2a2a",
                    borderRadius: "8px",
                    fontSize: "12px",
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
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              Income by Category
            </h2>
            <div className="flex items-center gap-3 mt-1 text-xs text-foreground-muted">
              <span>
                {format(viewDate, "MMMM yyyy")} · {nivoPieData.length} sources
              </span>
              {nivoPieData.length > 0 && (
                <span>
                  Top:{" "}
                  <span className="text-foreground font-medium">
                    {
                      [...nivoPieData].sort(
                        (a: any, b: any) => b.value - a.value,
                      )[0]?.label
                    }
                  </span>
                </span>
              )}
            </div>
          </div>
          <div className="h-[400px]">
            <ResponsivePie
              data={nivoPieData}
              margin={{
                top: 20,
                right: isMobile ? 20 : 80,
                bottom: 20,
                left: isMobile ? 20 : 80,
              }}
              innerRadius={0.5}
              padAngle={0.7}
              cornerRadius={3}
              activeOuterRadiusOffset={8}
              colors={[
                "#10b981",
                "#06b6d4",
                "#84cc16",
                "#f59e0b",
                "#3b82f6",
                "#8b5cf6",
                "#ec4899",
                "#ef4444",
              ]}
              borderWidth={1}
              borderColor={{ from: "color", modifiers: [["darker", 0.2]] }}
              arcLinkLabelsSkipAngle={10}
              arcLinkLabelsTextColor="#888888"
              arcLinkLabelsThickness={2}
              arcLinkLabelsColor={{ from: "color" }}
              arcLabelsSkipAngle={10}
              arcLabelsTextColor={{ from: "color", modifiers: [["darker", 2]] }}
              valueFormat={(value) => formatCurrency(value)}
              theme={{
                tooltip: {
                  container: {
                    background: "#0a0a0a",
                    border: "1px solid #2a2a2a",
                    borderRadius: "8px",
                    fontSize: "12px",
                  },
                },
              }}
            />
          </div>
        </Card>
      )}

      {/* Spending Prediction */}
      {spendingPrediction && (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-5">
            <Lightbulb className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Next Month Prediction
            </h2>
          </div>

          {/* Top row: total + meta badges */}
          <div className="flex flex-wrap items-end gap-6 mb-5">
            <div>
              <p className="text-3xl font-bold text-primary">
                {formatCurrency(spendingPrediction.predicted || 0)}
              </p>
              <p className="text-xs text-foreground-muted mt-1">
                {spendingPrediction.trend === "increasing"
                  ? "↑ Trend: spending is increasing"
                  : spendingPrediction.trend === "decreasing"
                    ? "↓ Trend: spending is decreasing"
                    : "→ Trend: stable"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pb-1">
              <Badge
                variant={
                  spendingPrediction.confidence > 0.7 ? "success" : "warning"
                }
              >
                {Math.round((spendingPrediction.confidence || 0) * 100)}%
                confidence
              </Badge>
            </div>
          </div>

          {/* Recurring / non-recurring split */}
          {(spendingPrediction.recurring_total > 0 || spendingPrediction.non_recurring_total > 0) && (
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface border border-border">
                <RefreshCw className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-foreground-muted">Recurring</p>
                  <p className="text-sm font-semibold text-foreground truncate">
                    {formatCurrency(spendingPrediction.recurring_total || 0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface border border-border">
                <Shuffle className="w-4 h-4 text-foreground-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-foreground-muted">Variable</p>
                  <p className="text-sm font-semibold text-foreground truncate">
                    {formatCurrency(spendingPrediction.non_recurring_total || 0)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Budget comparison */}
          {spendingPrediction.budget_comparison?.has_budget && (
            <div
              className={`flex items-center justify-between px-4 py-3 rounded-lg mb-5 ${
                spendingPrediction.budget_comparison.over_budget
                  ? "bg-error/10 border border-error/20"
                  : "bg-success/10 border border-success/20"
              }`}
            >
              <span className="text-sm text-foreground">
                {spendingPrediction.budget_comparison.over_budget
                  ? `Over budget by ${formatCurrency(Math.abs(spendingPrediction.budget_comparison.difference))}`
                  : `Within budget — ${formatCurrency(Math.abs(spendingPrediction.budget_comparison.difference))} to spare`}
              </span>
              <span
                className={`text-sm font-semibold ${
                  spendingPrediction.budget_comparison.over_budget
                    ? "text-error"
                    : "text-success"
                }`}
              >
                {Math.round(
                  spendingPrediction.budget_comparison.percentage || 0,
                )}
                % of budget
              </span>
            </div>
          )}

          {/* Category breakdown */}
          {spendingPrediction.category_breakdown?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-3">
                By category
              </p>
              <div className="space-y-2.5">
                {spendingPrediction.category_breakdown
                  .slice(0, 6)
                  .map((cat: any) => {
                    const pct =
                      spendingPrediction.predicted > 0
                        ? (cat.predicted / spendingPrediction.predicted) * 100
                        : 0;
                    return (
                      <div key={cat.category} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground-muted w-28 truncate shrink-0">
                            {cat.category}
                          </span>
                          <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary/60 rounded-full"
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <span className="text-sm text-foreground w-20 text-right shrink-0">
                            {formatCurrency(cat.predicted)}
                          </span>
                        </div>
                        {/* Show split only when both portions exist */}
                        {cat.recurring_amount > 0 && cat.non_recurring_amount > 0 && (
                          <div className="flex items-center gap-2 pl-30">
                            <span className="w-28 shrink-0" />
                            <div className="flex gap-2 text-xs text-foreground-muted">
                              <span className="flex items-center gap-1">
                                <RefreshCw className="w-2.5 h-2.5" />
                                {formatCurrency(cat.recurring_amount)}
                              </span>
                              <span>+</span>
                              <span className="flex items-center gap-1">
                                <Shuffle className="w-2.5 h-2.5" />
                                {formatCurrency(cat.non_recurring_amount)}
                              </span>
                            </div>
                          </div>
                        )}
                        {/* Badge for purely recurring categories */}
                        {cat.is_recurring && cat.non_recurring_amount === 0 && (
                          <div className="flex items-center gap-2">
                            <span className="w-28 shrink-0" />
                            <span className="text-xs text-primary flex items-center gap-1">
                              <RefreshCw className="w-2.5 h-2.5" /> recurring
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Savings Goals Section - Kept from original */}
      {activeEnvelopes && activeEnvelopes.length > 0 && (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <PiggyBank className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">
                Active Savings Goals
              </h2>
            </div>
            <Link to="/envelopes">
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeEnvelopes.map((envelope: any) => {
              const progress =
                envelope.target_amount > 0
                  ? (envelope.current_amount / envelope.target_amount) * 100
                  : 0;
              const remaining =
                envelope.target_amount - envelope.current_amount;
              const daysLeft = envelope.deadline
                ? Math.ceil(
                    (new Date(envelope.deadline).getTime() -
                      new Date().getTime()) /
                      (1000 * 60 * 60 * 24),
                  )
                : null;
              const progressVariant =
                progress < 50 ? "info" : progress < 80 ? "default" : "success";

              return (
                <div key={envelope.id}>
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-medium text-foreground">
                      {envelope.name}
                    </p>
                    {daysLeft !== null && (
                      <Badge
                        variant={daysLeft > 0 ? "info" : "error"}
                        size="sm"
                      >
                        {daysLeft > 0 ? `${daysLeft}d left` : "Overdue"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-foreground-muted mb-2">
                    {formatCurrency(envelope.current_amount)} /{" "}
                    {formatCurrency(envelope.target_amount)}
                  </p>
                  <Progress
                    value={Math.min(progress, 100)}
                    variant={progressVariant}
                    size="md"
                    className="mb-1"
                  />
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
