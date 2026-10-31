// Reports › Investments: what the portfolio did in a period. The figures add up:
// end value = start value + net contributed + market gain.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, startOfYear, subMonths } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Banknote, Coins, LineChart as LineChartIcon, PiggyBank, Receipt, TrendingUp, Users } from "lucide-react";
import {
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../shadcn";
import KPICard from "../KPICard";
import CategorySunburst from "../CategorySunburst";
import PeriodFilter from "../PeriodFilter";
import QueryError from "../QueryError";
import { accountsAPI, reportsAPI } from "../../services/api";
import { usePeriodFilter } from "../../hooks/usePeriodFilter";
import { sliceMoney } from "../../lib/money";
import { formatCurrency as formatCurrencyUtil } from "../../lib/utils";

const YEAR_TO_DATE = "ytd";
const ALL_TIME = "all";
const PERIODS = [
  { value: YEAR_TO_DATE, label: "Year to date" },
  { value: "12", label: "12 Months" },
  { value: "36", label: "3 Years" },
  { value: ALL_TIME, label: "All time" },
];
/** Earlier than any trade the app can hold. */
const ALL_TIME_START = "2000-01-01";

function periodDates(preset: string, startDate?: string, endDate?: string) {
  const today = format(new Date(), "yyyy-MM-dd");
  if (preset === YEAR_TO_DATE)
    return { start: format(startOfYear(new Date()), "yyyy-MM-dd"), end: today };
  if (preset === ALL_TIME) return { start: ALL_TIME_START, end: today };
  if (Number(preset) > 0)
    return {
      start: format(subMonths(new Date(), Number(preset)), "yyyy-MM-dd"),
      end: today,
    };
  return { start: startDate || today, end: endDate || today };
}

export default function InvestmentsReport({ owners }: { owners?: any[] }) {
  const period = usePeriodFilter(YEAR_TO_DATE, 12);
  const [ownerId, setOwnerId] = useState("");
  const [accountId, setAccountId] = useState("");
  const { start, end } = periodDates(period.preset, period.startDate, period.endDate);

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => (await accountsAPI.getAll()).data.accounts,
  });
  const investmentAccounts = (accounts || []).filter(
    (a: any) =>
      a.account_type === "investment" &&
      (!ownerId || String(a.owner_id) === ownerId),
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["investments-report", start, end, ownerId, accountId],
    queryFn: async () =>
      (
        await reportsAPI.getInvestments({
          start_date: start,
          end_date: end,
          ...(ownerId ? { owner_id: Number(ownerId) } : {}),
          ...(accountId ? { account_id: Number(accountId) } : {}),
        })
      ).data,
  });

  const money = (amount: number) =>
    formatCurrencyUtil(amount, data?.currency || "EUR");

  // All time starts before the first trade: draw from where something exists.
  const chartRows = useMemo(() => {
    const series = data?.series || [];
    const first = series.findIndex((p: any) => p.value || p.contributed);
    return (first > 0 ? series.slice(first - 1) : series).map((p: any) => ({
      ...p,
      label: format(parseISO(p.date), "MMM yy"),
    }));
  }, [data]);

  const allocationSlices = useMemo(
    () =>
      (data?.allocation || []).map((kind: any) => ({
        name: kind.category,
        value: sliceMoney(kind.total),
        subcategories: kind.subcategories.map((sub: any) => ({
          name: sub.category,
          value: sliceMoney(sub.total),
        })),
      })),
    [data],
  );

  const filters = (
    <div className="flex flex-col sm:flex-row flex-wrap gap-2">
      <Select
        value={ownerId}
        onValueChange={(value) => {
          setOwnerId(value);
          setAccountId("");
        }}
      >
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
      <Select value={accountId} onValueChange={setAccountId}>
        <SelectTrigger className="w-full sm:w-[190px]">
          <SelectValue placeholder="All accounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All accounts</SelectItem>
          {investmentAccounts.map((account: any) => (
            <SelectItem key={account.id} value={String(account.id)}>
              {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <PeriodFilter period={period} options={PERIODS} />
    </div>
  );

  if (isError) {
    return (
      <div className="space-y-4 mt-4">
        {filters}
        <QueryError message="Failed to load the investments report" onRetry={refetch} />
      </div>
    );
  }

  const summary = data?.summary;

  return (
    <div className="space-y-6 mt-4">
      {filters}

      {isLoading || !summary ? (
        <div className="flex justify-center items-center min-h-[40vh]">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <KPICard
              title="Value at period end"
              value={money(summary.end_value)}
              subtitle={`Started at ${money(summary.start_value)}`}
              icon={<LineChartIcon size={24} className="text-blue-500" />}
              iconColor="bg-blue-500"
            />
            <KPICard
              title="Net contributed"
              value={money(summary.net_contributed)}
              subtitle="Bought, less what sales brought in"
              icon={<PiggyBank size={24} className="text-amber-500" />}
              iconColor="bg-amber-500"
            />
            <KPICard
              title="Market gain"
              value={money(summary.market_gain)}
              subtitle="The change not explained by money in or out"
              icon={<TrendingUp size={24} className="text-emerald-500" />}
              iconColor="bg-emerald-500"
            />
            <KPICard
              title="Dividends, net"
              value={money(summary.dividends)}
              icon={<Banknote size={24} className="text-teal-500" />}
              iconColor="bg-teal-500"
            />
            <KPICard
              title="Realised gain"
              value={money(summary.realised_gains)}
              icon={<Coins size={24} className="text-violet-500" />}
              iconColor="bg-violet-500"
            />
            <KPICard
              title="Fees and tax"
              value={money(summary.fees_and_tax)}
              icon={<Receipt size={24} className="text-rose-500" />}
              iconColor="bg-rose-500"
            />
          </div>

          <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Value against money contributed
            </h3>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={70} />
                <Tooltip formatter={(value: number) => money(value)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Portfolio value"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="contributed"
                  name="Money contributed"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-foreground-muted mt-3">
              Past values use the latest known price on each date: a daily quote
              where one was saved, otherwise the price of your last trade.
            </p>
          </Card>

          <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-foreground mb-4">Holdings</h3>
            {data.holdings.length === 0 ? (
              <p className="text-sm text-foreground-muted">
                Nothing held or traded in this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Holding</TableHead>
                      <TableHead className="text-right">Start</TableHead>
                      <TableHead className="text-right">Bought</TableHead>
                      <TableHead className="text-right">Sold</TableHead>
                      <TableHead className="text-right">Income</TableHead>
                      <TableHead className="text-right">End</TableHead>
                      <TableHead className="text-right">Gain in period</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.holdings.map((row: any) => (
                      <TableRow key={row.holding_id ?? row.symbol}>
                        <TableCell>
                          <span className="font-medium text-foreground">{row.symbol}</span>
                          {row.name !== row.symbol && (
                            <span className="block text-xs text-foreground-muted">{row.name}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{money(row.start_value)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{money(row.bought)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{money(row.sold)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{money(row.income)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{money(row.end_value)}</TableCell>
                        <TableCell
                          className={`text-right whitespace-nowrap font-medium ${row.gain >= 0 ? "text-success" : "text-error"}`}
                        >
                          {money(row.gain)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Allocation at period end
              </h3>
              <CategorySunburst
                slices={allocationSlices}
                formatValue={money}
                height={320}
              />
            </Card>
            <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Dividends by month
              </h3>
              {data.dividends_by_month.length === 0 ? (
                <p className="text-sm text-foreground-muted">
                  No dividends in this period.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={data.dividends_by_month}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={60} />
                    <Tooltip formatter={(value: number) => money(value)} />
                    <Bar dataKey="amount" name="Dividends" fill="#14b8a6" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
