// The figures and the allocation at the top of the Investments page.
import { useMemo } from "react";
import { Banknote, Landmark, PiggyBank, TrendingDown, TrendingUp } from "lucide-react";
import CategorySunburst from "../CategorySunburst";
import KPICard from "../KPICard";
import { Card } from "../shadcn";
import { sliceMoney } from "../../lib/money";
import { TAB_HOLDINGS, TAB_TRANSACTIONS, investmentTypeLabel } from "./shared";
import type { InvestmentsState } from "./useInvestments";

export default function PortfolioSummary({ inv }: { inv: InvestmentsState }) {
  const { summaryData, openHoldings, formatCurrency, setTabValue, totalValue } = inv;
  const totalReturn: number = summaryData?.total_return || 0;

  // One chart, by type then holding, the same one the Reports page uses.
  const allocationSlices = useMemo(() => {
    const byType = new Map<string, { name: string; value: number }[]>();
    for (const holding of openHoldings) {
      const type = investmentTypeLabel(holding.investment_type);
      byType.set(type, [
        ...(byType.get(type) || []),
        {
          name: holding.symbol || holding.name,
          value: sliceMoney(holding.current_value_display || 0),
        },
      ]);
    }
    return [...byType.entries()]
      .map(([name, subcategories]) => ({
        name,
        value: subcategories.reduce((sum, sub) => sum + sub.value, 0),
        subcategories: [...subcategories].sort((a, b) => b.value - a.value),
      }))
      .sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(openHoldings.map((h) => [h.id, h.current_value_display]))]);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <KPICard
          title="Value"
          value={formatCurrency(totalValue)}
          subtitle={`${openHoldings.length} open holding${openHoldings.length !== 1 ? "s" : ""}`}
          icon={<Landmark size={24} className="text-blue-500" />}
          iconColor="bg-blue-500"
          onClick={() => setTabValue(TAB_HOLDINGS)}
          actionLabel="Show holdings"
        />
        <KPICard
          title="Total return"
          value={formatCurrency(totalReturn)}
          subtitle={
            `Unrealised ${formatCurrency(summaryData?.total_gain_loss || 0)} · ` +
            `realised ${formatCurrency(summaryData?.realised_gains || 0)} · ` +
            `dividends ${formatCurrency(summaryData?.total_dividends || 0)}`
          }
          icon={
            totalReturn >= 0 ? (
              <TrendingUp size={24} className="text-emerald-500" />
            ) : (
              <TrendingDown size={24} className="text-rose-500" />
            )
          }
          iconColor={totalReturn >= 0 ? "bg-emerald-500" : "bg-rose-500"}
        />
        <KPICard
          title="Income, 12 months"
          value={formatCurrency(summaryData?.recent_dividends_12m || 0)}
          subtitle={
            `Yield ${(summaryData?.dividend_yield || 0).toFixed(2)}%` +
            (summaryData?.dividend_tax_withheld
              ? ` · tax withheld ${formatCurrency(summaryData.dividend_tax_withheld)}`
              : "")
          }
          icon={<Banknote size={24} className="text-teal-500" />}
          iconColor="bg-teal-500"
          onClick={() => setTabValue(TAB_TRANSACTIONS)}
          actionLabel="Show trades"
        />
        <KPICard
          title="Net invested"
          value={formatCurrency(summaryData?.net_invested || 0)}
          subtitle={
            `Fees ${formatCurrency(summaryData?.total_fees || 0)} · ` +
            `tax ${formatCurrency(summaryData?.total_tax || 0)}`
          }
          icon={<PiggyBank size={24} className="text-amber-500" />}
          iconColor="bg-amber-500"
          onClick={() => setTabValue(TAB_TRANSACTIONS)}
          actionLabel="Show trades"
        />
      </div>

      {allocationSlices.length > 0 && (
        <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Allocation</h2>
          <CategorySunburst
            slices={allocationSlices}
            formatValue={formatCurrency}
            height={340}
          />
        </Card>
      )}
    </>
  );
}
