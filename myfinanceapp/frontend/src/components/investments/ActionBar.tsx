// Update prices, record a trade, add a holding.
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "../shadcn";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../shadcn";
import type { InvestmentsState } from "./useInvestments";

export default function ActionBar({ inv }: { inv: InvestmentsState }) {
  const {
    setHoldingDialog,
    setTransactionDialog,
    setEditingHolding,
    setEditingTransaction,
    lastUpdateResult,
    setLastUpdateResult,
    priceUpdateRunning,
    priceUpdateProgress,
    updateAllPricesMutation,
    resetHoldingForm,
    resetTransactionForm,
    autoUpdateableCount,
    manualOnlyCount,
    ownerFilter,
    setOwnerFilter,
    accountFilter,
    setAccountFilter,
    owners,
    investmentAccounts,
  } = inv;

  return (
    <>
      {/* Action Bar */}
      <div className="flex flex-wrap gap-2 justify-end items-center">
        <div className="flex flex-wrap gap-2 mr-auto">
          <Select
            value={ownerFilter}
            onValueChange={(value) => {
              setOwnerFilter(value);
              setAccountFilter("");
            }}
          >
            <SelectTrigger className="w-full sm:w-[150px]" aria-label="Owner">
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
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-full sm:w-[190px]" aria-label="Account">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All accounts</SelectItem>
              {(investmentAccounts || [])
                .filter((a: any) => !ownerFilter || String(a.owner_id) === ownerFilter)
                .map((account: any) => (
                  <SelectItem key={account.id} value={String(account.id)}>
                    {account.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        {/* Update result summary */}
        {lastUpdateResult && !priceUpdateRunning && (
          <div className="text-sm text-foreground-muted flex items-center gap-2">
            <span className="text-success">
              {lastUpdateResult.updated} updated
            </span>
            {lastUpdateResult.skipped > 0 && (
              <span className="text-warning">
                {lastUpdateResult.skipped} skipped
              </span>
            )}
            {lastUpdateResult.failed > 0 && (
              <span
                className="text-error"
                title={lastUpdateResult.failedSymbols?.join(", ")}
              >
                {lastUpdateResult.failed} failed
              </span>
            )}
          </div>
        )}

        <Button
          variant="outline"
          onClick={() => {
            setLastUpdateResult(null);
            updateAllPricesMutation.mutate();
          }}
          disabled={
            priceUpdateRunning ||
            updateAllPricesMutation.isPending ||
            autoUpdateableCount === 0
          }
          title={
            autoUpdateableCount === 0
              ? "No holdings that support auto-update (stocks, ETFs, mutual funds)"
              : `Auto-updates prices for ${autoUpdateableCount} holding${autoUpdateableCount !== 1 ? "s" : ""} via Yahoo Finance.${manualOnlyCount > 0 ? ` ${manualOnlyCount} holding${manualOnlyCount !== 1 ? "s" : ""} (bonds/crypto) require manual price entry.` : ""}`
          }
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${priceUpdateRunning ? "animate-spin" : ""}`}
          />
          {priceUpdateRunning ? (
            <>
              {priceUpdateProgress && priceUpdateProgress.total > 0 ? (
                <>
                  Updating {priceUpdateProgress.processed} of{" "}
                  {priceUpdateProgress.total}...
                </>
              ) : (
                <>Starting...</>
              )}
            </>
          ) : (
            <>
              Update Prices
              {autoUpdateableCount > 0 ? ` (${autoUpdateableCount})` : ""}
            </>
          )}
        </Button>
        <Button
          onClick={() => {
            setEditingTransaction(null);
            resetTransactionForm();
            setTransactionDialog(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Record trade
        </Button>
        <Button
          onClick={() => {
            setEditingHolding(null);
            resetHoldingForm();
            setHoldingDialog(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Holding
        </Button>
      </div>
    </>
  );
}
