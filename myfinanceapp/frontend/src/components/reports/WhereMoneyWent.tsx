// What a period's savings became: invested, repaid on loans, or kept as cash.
import { Coins, Landmark, PiggyBank, TrendingUp } from "lucide-react";
import KPICard from "../KPICard";

export interface WhereMoneyWentData {
  net_invested: number;
  loan_capital_repaid: number;
  kept: number;
  realised_gains: number;
}

export default function WhereMoneyWent({
  data,
  formatCurrency,
}: {
  data: WhereMoneyWentData;
  formatCurrency: (amount: number) => string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        title="Invested (net)"
        value={formatCurrency(data.net_invested)}
        icon={<TrendingUp size={24} className="text-amber-500" />}
        iconColor="bg-amber-500"
      />
      <KPICard
        title="Loan capital repaid"
        value={formatCurrency(data.loan_capital_repaid)}
        icon={<Landmark size={24} className="text-blue-500" />}
        iconColor="bg-blue-500"
      />
      <KPICard
        title="Kept in cash"
        value={formatCurrency(data.kept)}
        icon={<PiggyBank size={24} className="text-emerald-500" />}
        iconColor="bg-emerald-500"
      />
      <KPICard
        title="Realised gains"
        value={formatCurrency(data.realised_gains)}
        subtitle="Included in income"
        icon={<Coins size={24} className="text-violet-500" />}
        iconColor="bg-violet-500"
      />
    </div>
  );
}
