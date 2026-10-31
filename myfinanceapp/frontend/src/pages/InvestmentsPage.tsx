// Investments Page - Portfolio Management
import PageHeader from "../components/PageHeader";
import { Card, InvestmentsSkeleton, Tabs, TabsList, TabsTrigger } from "../components/shadcn";
import QueryError from "../components/QueryError";
import ActionBar from "../components/investments/ActionBar";
import DeleteConfirmDialog from "../components/investments/DeleteConfirmDialog";
import HoldingDialog from "../components/investments/HoldingDialog";
import HoldingsTab from "../components/investments/HoldingsTab";
import ManualPriceDialog from "../components/investments/ManualPriceDialog";
import PortfolioSummary from "../components/investments/PortfolioSummary";
import SecuritiesTab from "../components/investments/SecuritiesTab";
import SecurityDialog from "../components/investments/SecurityDialog";
import TradeDialog from "../components/investments/TradeDialog";
import TradesTab from "../components/investments/TradesTab";
import { TAB_HOLDINGS, TAB_SECURITIES, TAB_TRANSACTIONS } from "../components/investments/shared";
import { useInvestments } from "../components/investments/useInvestments";

export default function InvestmentsPage() {
  const inv = useInvestments();

  if (inv.holdingsLoading) {
    return <InvestmentsSkeleton />;
  }

  if (inv.holdingsError) {
    return (
      <QueryError
        message="Failed to load your investments."
        onRetry={() => inv.refetchHoldings()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investments"
        description="Portfolio and holdings overview"
        accentColor="border-l-amber-500"
      />
      <ActionBar inv={inv} />
      <PortfolioSummary inv={inv} />

      <Card className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
        <Tabs value={inv.tabValue} onValueChange={inv.setTabValue}>
          <TabsList>
            <TabsTrigger value={TAB_HOLDINGS}>Holdings</TabsTrigger>
            <TabsTrigger value={TAB_TRANSACTIONS}>Trades</TabsTrigger>
            <TabsTrigger value={TAB_SECURITIES}>Securities</TabsTrigger>
          </TabsList>
          <SecuritiesTab inv={inv} />
          <HoldingsTab inv={inv} />
          <TradesTab inv={inv} />
        </Tabs>
      </Card>

      <SecurityDialog inv={inv} />
      <HoldingDialog inv={inv} />
      <TradeDialog inv={inv} />
      <DeleteConfirmDialog inv={inv} />
      <ManualPriceDialog inv={inv} />
    </div>
  );
}
