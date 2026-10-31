// Buys, sales and dividends.
import { Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button, Card, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TabsContent } from "../shadcn";
import { TAB_TRANSACTIONS, formatDate } from "./shared";
import type { InvestmentsState } from "./useInvestments";

export default function TradesTab({ inv }: { inv: InvestmentsState }) {
  const {
    isMobile,
    expandedInvTx,
    setExpandedInvTx,
    setDeleteConfirm,
    visibleTrades,
    handleEditTransaction,
    formatCurrency,
  } = inv;

  return (
    <>
          {/* Transactions Tab */}
          <TabsContent value={TAB_TRANSACTIONS}>
            {visibleTrades.length > 0 ? (
              isMobile ? (
                <div className="space-y-2">
                  {visibleTrades.map((transaction: any) => {
                    const isExpanded = expandedInvTx === transaction.id;
                    const totalAmount = transaction.total_amount
                      ? transaction.total_amount
                      : (transaction.quantity || 0) * (transaction.price || 0);

                    return (
                      <Card
                        key={transaction.id}
                        className={`rounded-xl overflow-hidden border border-border bg-card/50 backdrop-blur-sm transition-all ${isExpanded ? "ring-2 ring-primary/50" : ""}`}
                      >
                        <div
                          className="p-4 cursor-pointer hover:bg-surface-hover transition-colors"
                          onClick={() =>
                            setExpandedInvTx(isExpanded ? null : transaction.id)
                          }
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-xs text-foreground-muted">
                                  {formatDate(transaction.transaction_date)}
                                </p>
                                <Badge
                                  variant={
                                    transaction.transaction_type === "buy"
                                      ? "success"
                                      : "destructive"
                                  }
                                  size="sm"
                                >
                                  {transaction.transaction_type}
                                </Badge>
                              </div>
                              <p className="font-medium text-foreground">
                                {transaction.name || transaction.symbol}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <p className="text-sm font-semibold text-foreground">
                                {formatCurrency(totalAmount)}
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
                                  Quantity
                                </p>
                                <p className="text-sm">
                                  {transaction.quantity || "-"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-foreground-muted">
                                  Price
                                </p>
                                <p className="text-sm">
                                  {transaction.price
                                    ? formatCurrency(transaction.price)
                                    : "-"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-foreground-muted">
                                  Fees
                                </p>
                                <p className="text-sm">
                                  {transaction.fees > 0
                                    ? formatCurrency(transaction.fees)
                                    : "-"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-foreground-muted">
                                  Tax
                                </p>
                                <p className="text-sm">
                                  {transaction.tax > 0
                                    ? formatCurrency(transaction.tax)
                                    : "-"}
                                </p>
                              </div>
                              {transaction.notes && (
                                <div className="col-span-2">
                                  <p className="text-xs text-foreground-muted">
                                    Notes
                                  </p>
                                  <p className="text-sm">{transaction.notes}</p>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1 pt-2 border-t border-border">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleEditTransaction(transaction)
                                }
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setDeleteConfirm({
                                    ...transaction,
                                    isTransaction: true,
                                  })
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
                        <TableHead>Date</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Fees</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleTrades.map((transaction: any) => (
                        <TableRow key={transaction.id}>
                          <TableCell>
                            {formatDate(transaction.transaction_date)}
                          </TableCell>
                          <TableCell className="font-semibold">
                            {transaction.name || transaction.symbol}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                transaction.transaction_type === "buy"
                                  ? "success"
                                  : "destructive"
                              }
                            >
                              {transaction.transaction_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {transaction.quantity || "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {transaction.price
                              ? formatCurrency(transaction.price)
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {transaction.total_amount
                              ? formatCurrency(transaction.total_amount)
                              : formatCurrency(
                                  (transaction.quantity || 0) *
                                    (transaction.price || 0),
                                )}
                          </TableCell>
                          <TableCell className="text-right">
                            {transaction.fees > 0
                              ? formatCurrency(transaction.fees)
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {transaction.tax > 0
                              ? formatCurrency(transaction.tax)
                              : "-"}
                          </TableCell>
                          <TableCell>{transaction.notes || "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleEditTransaction(transaction)
                                }
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setDeleteConfirm({
                                    ...transaction,
                                    isTransaction: true,
                                  })
                                }
                                className="text-error hover:text-error"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )
            ) : (
              <p className="text-sm text-foreground-muted text-center py-8">
                No transactions yet
              </p>
            )}
          </TabsContent>
    </>
  );
}
