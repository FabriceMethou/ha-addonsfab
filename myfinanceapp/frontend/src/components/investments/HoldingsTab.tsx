// Holdings, grouped by account.
import { Pencil, Trash2, LineChart, RefreshCw, DollarSign, ChevronDown, ChevronUp } from "lucide-react";
import { Button, Card, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TabsContent, EmptyState } from "../shadcn";
import { format, parseISO } from "date-fns";
import { formatCurrency as formatCurrencyUtil } from "../../lib/utils";
import { addMoney, subtractMoney, percentOf } from "../../lib/money";
import { Switch } from "../shadcn";
import { TAB_HOLDINGS, investmentTypeLabel } from "./shared";
import type { InvestmentsState } from "./useInvestments";

export default function HoldingsTab({ inv }: { inv: InvestmentsState }) {
  const {
    isMobile,
    expandedHolding,
    setExpandedHolding,
    setHoldingDialog,
    setEditingHolding,
    setDeleteConfirm,
    setManualPriceDialog,
    setManualPriceHolding,
    setManualPrice,
    visibleHoldings,
    closedCount,
    showClosed,
    setShowClosed,
    updateHoldingPriceMutation,
    resetHoldingForm,
    handleEditHolding,
    formatCurrency,
  } = inv;

  return (
    <>
          {/* Holdings Tab */}
          <TabsContent value={TAB_HOLDINGS}>
            {closedCount > 0 && (
              <label className="flex items-center justify-end gap-2 mb-4 text-sm text-foreground-muted">
                <Switch checked={showClosed} onChange={setShowClosed} />
                Show closed holdings ({closedCount})
              </label>
            )}
            {visibleHoldings.length > 0 ? (
              <div className="space-y-6">
                {(() => {
                  // Group holdings by account using precise decimal arithmetic
                  const holdingsByAccount = visibleHoldings.reduce(
                    (acc: any, holding: any) => {
                      const accountKey = holding.account_id || "unknown";
                      const accountName =
                        holding.account_name || "Unknown Account";

                      if (!acc[accountKey]) {
                        acc[accountKey] = {
                          accountName,
                          holdings: [],
                          totalValue: 0,
                          totalCost: 0,
                        };
                      }

                      // Converted to the display currency: an account's holdings can be kept
                      // in a currency other than the one the totals are shown in.
                      const currentValue = holding.current_value_display;
                      const costBasis = holding.cost_basis_display;

                      acc[accountKey].holdings.push(holding);
                      acc[accountKey].totalValue = addMoney(
                        acc[accountKey].totalValue,
                        currentValue,
                      );
                      acc[accountKey].totalCost = addMoney(
                        acc[accountKey].totalCost,
                        costBasis,
                      );

                      return acc;
                    },
                    {},
                  );

                  return Object.entries(holdingsByAccount).map(
                    ([accountKey, accountData]: [string, any]) => {
                      const accountGainLoss = subtractMoney(
                        accountData.totalValue,
                        accountData.totalCost,
                      );
                      const accountGainLossPercent =
                        accountData.totalCost > 0
                          ? percentOf(accountGainLoss, accountData.totalCost, 2)
                          : 0;

                      return (
                        <Card key={accountKey} className="p-6">
                          <div className="flex justify-between items-center mb-4">
                            <div>
                              <h3 className="text-lg font-semibold text-foreground">
                                {accountData.accountName}
                              </h3>
                              <p className="text-sm text-foreground-muted">
                                {accountData.holdings.length} holding
                                {accountData.holdings.length !== 1 ? "s" : ""}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-foreground">
                                {formatCurrency(accountData.totalValue)}
                              </p>
                              <p
                                className={`text-sm font-semibold ${accountGainLoss >= 0 ? "text-success" : "text-error"}`}
                              >
                                {accountGainLoss >= 0 ? "+" : ""}
                                {formatCurrency(accountGainLoss)} (
                                {accountGainLossPercent >= 0 ? "+" : ""}
                                {accountGainLossPercent}%)
                              </p>
                            </div>
                          </div>

                          {isMobile ? (
                            <div className="space-y-2">
                              {accountData.holdings.map((holding: any) => {
                                const currentValue =
                                  holding.current_value_display;
                                const costBasis = holding.cost_basis_display;
                                const gainLoss = currentValue - costBasis;
                                const gainLossPercent =
                                  costBasis > 0
                                    ? (gainLoss / costBasis) * 100
                                    : 0;
                                const isExpanded =
                                  expandedHolding === holding.id;

                                return (
                                  <Card
                                    key={holding.id}
                                    className={`rounded-xl overflow-hidden border border-border bg-card/50 backdrop-blur-sm transition-all ${isExpanded ? "ring-2 ring-primary/50" : ""}`}
                                  >
                                    <div
                                      className="p-4 cursor-pointer hover:bg-surface-hover transition-colors"
                                      onClick={() =>
                                        setExpandedHolding(
                                          isExpanded ? null : holding.id,
                                        )
                                      }
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                          <p className="font-medium text-foreground">
                                            {holding.symbol}
                                          </p>
                                          <p
                                            className={`text-sm font-semibold ${gainLoss >= 0 ? "text-success" : "text-error"}`}
                                          >
                                            {formatCurrency(currentValue)}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          <p
                                            className={`text-xs font-medium ${gainLoss >= 0 ? "text-success" : "text-error"}`}
                                          >
                                            {gainLossPercent >= 0 ? "+" : ""}
                                            {gainLossPercent.toFixed(2)}%
                                          </p>
                                          {isExpanded ? (
                                            <ChevronUp className="w-4 h-4 text-foreground-muted" />
                                          ) : (
                                            <ChevronDown className="w-4 h-4 text-foreground-muted" />
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    {isExpanded && (
                                      <div className="border-t border-border px-4 py-3">
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                          <div>
                                            <p className="text-xs text-foreground-muted">
                                              Name
                                            </p>
                                            <p className="text-sm">
                                              {holding.name}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-foreground-muted">
                                              Type
                                            </p>
                                            <p className="text-sm">
                                              <Badge
                                                variant="secondary"
                                                size="sm"
                                              >
                                                {investmentTypeLabel(holding.investment_type)}
                                              </Badge>
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-foreground-muted">
                                              Quantity
                                            </p>
                                            <p className="text-sm">
                                              {holding.quantity}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-foreground-muted">
                                              Avg Cost
                                            </p>
                                            <p className="text-sm">
                                              {formatCurrencyUtil(holding.average_cost, holding.currency)}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-foreground-muted">
                                              Current Price
                                            </p>
                                            <p className="text-sm">
                                              {formatCurrencyUtil(
                                            holding.current_price || holding.average_cost,
                                            holding.currency,
                                          )}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-foreground-muted">
                                              Gain/Loss
                                            </p>
                                            <p
                                              className={`text-sm font-semibold ${gainLoss >= 0 ? "text-success" : "text-error"}`}
                                            >
                                              {formatCurrency(gainLoss)}
                                            </p>
                                          </div>
                                          <div className="col-span-2">
                                            <p className="text-xs text-foreground-muted">
                                              Last Updated
                                            </p>
                                            <p className="text-sm">
                                              {holding.last_price_update
                                                ? format(
                                                    parseISO(
                                                      holding.last_price_update,
                                                    ),
                                                    "MMM dd, yyyy HH:mm",
                                                  )
                                                : "Never"}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex gap-1 pt-2 border-t border-border">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              updateHoldingPriceMutation.mutate(
                                                holding.id,
                                              )
                                            }
                                            disabled={
                                              updateHoldingPriceMutation.isPending
                                            }
                                            className="text-success hover:text-success"
                                            title="Auto-update price from Yahoo Finance"
                                          >
                                            <RefreshCw className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              setManualPriceHolding(holding);
                                              setManualPrice(
                                                (
                                                  holding.current_price ||
                                                  holding.average_cost ||
                                                  0
                                                ).toString(),
                                              );
                                              setManualPriceDialog(true);
                                            }}
                                            className="text-primary hover:text-primary"
                                            title="Manually set price"
                                          >
                                            <DollarSign className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              handleEditHolding(holding)
                                            }
                                          >
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              setDeleteConfirm(holding)
                                            }
                                            className="text-error hover:text-error"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </Card>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Symbol</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">
                                      Quantity
                                    </TableHead>
                                    <TableHead className="text-right">
                                      Avg Cost
                                    </TableHead>
                                    <TableHead className="text-right">
                                      Current Price
                                    </TableHead>
                                    <TableHead className="text-right">
                                      Current Value
                                    </TableHead>
                                    <TableHead className="text-right">
                                      Gain/Loss
                                    </TableHead>
                                    <TableHead>Last Updated</TableHead>
                                    <TableHead className="text-right">
                                      Actions
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {accountData.holdings.map((holding: any) => {
                                    const currentValue =
                                  holding.current_value_display;
                                const costBasis = holding.cost_basis_display;
                                    const gainLoss = currentValue - costBasis;
                                    const gainLossPercent =
                                      costBasis > 0
                                        ? (gainLoss / costBasis) * 100
                                        : 0;

                                    return (
                                      <TableRow key={holding.id}>
                                        <TableCell className="font-semibold">
                                          {holding.symbol}
                                        </TableCell>
                                        <TableCell>{holding.name}</TableCell>
                                        <TableCell>
                                          <Badge variant="secondary">
                                            {investmentTypeLabel(holding.investment_type)}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {holding.quantity}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {formatCurrencyUtil(holding.average_cost, holding.currency)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {formatCurrencyUtil(
                                            holding.current_price || holding.average_cost,
                                            holding.currency,
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">
                                          {formatCurrency(currentValue)}
                                        </TableCell>
                                        <TableCell
                                          className={`text-right font-semibold ${gainLoss >= 0 ? "text-success" : "text-error"}`}
                                        >
                                          {formatCurrency(gainLoss)}
                                          <span className="block text-xs">
                                            ({gainLossPercent >= 0 ? "+" : ""}
                                            {gainLossPercent.toFixed(2)}%)
                                          </span>
                                        </TableCell>
                                        <TableCell>
                                          {holding.last_price_update ? (
                                            <span className="text-xs text-foreground-muted">
                                              {format(
                                                parseISO(
                                                  holding.last_price_update,
                                                ),
                                                "MMM dd, yyyy HH:mm",
                                              )}
                                            </span>
                                          ) : (
                                            <span className="text-xs text-foreground-muted">
                                              Never
                                            </span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <div className="flex justify-end gap-1">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() =>
                                                updateHoldingPriceMutation.mutate(
                                                  holding.id,
                                                )
                                              }
                                              disabled={
                                                updateHoldingPriceMutation.isPending
                                              }
                                              className="text-success hover:text-success"
                                              title="Auto-update price from Yahoo Finance"
                                            >
                                              <RefreshCw className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => {
                                                setManualPriceHolding(holding);
                                                setManualPrice(
                                                  (
                                                    holding.current_price ||
                                                    holding.average_cost ||
                                                    0
                                                  ).toString(),
                                                );
                                                setManualPriceDialog(true);
                                              }}
                                              className="text-primary hover:text-primary"
                                              title="Manually set price"
                                            >
                                              <DollarSign className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() =>
                                                handleEditHolding(holding)
                                              }
                                            >
                                              <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() =>
                                                setDeleteConfirm(holding)
                                              }
                                              className="text-error hover:text-error"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </Card>
                      );
                    },
                  );
                })()}
              </div>
            ) : (
              <EmptyState
                icon={LineChart}
                title="No holdings yet"
                description="Add your first investment holding to track your portfolio."
                action={{
                  label: "Add Holding",
                  onClick: () => {
                    setEditingHolding(null);
                    resetHoldingForm();
                    setHoldingDialog(true);
                  },
                }}
              />
            )}
          </TabsContent>
    </>
  );
}
