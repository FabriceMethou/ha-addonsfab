// Record or edit a trade.
import { Button, Input, Label, Spinner, Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../shadcn";
import type { InvestmentsState } from "./useInvestments";

export default function TradeDialog({ inv }: { inv: InvestmentsState }) {
  const {
    transactionDialog,
    setTransactionDialog,
    editingTransaction,
    setEditingTransaction,
    transactionForm,
    setTransactionForm,
    investmentAccounts,
    holdingsData,
    createTransactionMutation,
    updateTransactionMutation,
    resetTransactionForm,
    handleSubmitTransaction,
  } = inv;

  return (
    <>
      {/* Add/Edit Transaction Dialog */}
      <Dialog
        open={transactionDialog}
        onOpenChange={(open) => {
          setTransactionDialog(open);
          if (!open) {
            setEditingTransaction(null);
            resetTransactionForm();
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {editingTransaction ? "Edit trade" : "Record trade"}
            </DialogTitle>
            <DialogDescription>
              {editingTransaction
                ? "Update the transaction details."
                : "Add multiple transactions in a row. The holding and date will be preserved for quick entry."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Two-step selection: Account first, then Security */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tx-account">Account</Label>
                <Select
                  value={transactionForm.account_id}
                  onValueChange={(value) =>
                    setTransactionForm({
                      ...transactionForm,
                      account_id: value,
                      holding_id: "",
                    })
                  }
                >
                  <SelectTrigger id="tx-account">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {investmentAccounts?.map((account: any) => (
                      <SelectItem
                        key={account.id}
                        value={account.id?.toString() || ""}
                      >
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tx-holding">Security</Label>
                <Select
                  value={transactionForm.holding_id}
                  onValueChange={(value) =>
                    setTransactionForm({
                      ...transactionForm,
                      holding_id: value,
                    })
                  }
                  disabled={!transactionForm.account_id}
                >
                  <SelectTrigger id="tx-holding">
                    <SelectValue
                      placeholder={
                        transactionForm.account_id
                          ? "Select security"
                          : "Select account first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {holdingsData
                      ?.filter(
                        (holding: any) =>
                          holding.account_id?.toString() ===
                          transactionForm.account_id,
                      )
                      .map((holding: any) => (
                        <SelectItem
                          key={holding.id}
                          value={holding.id?.toString() || ""}
                        >
                          {holding.symbol} - {holding.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tx-type">Transaction Type</Label>
                <Select
                  value={transactionForm.transaction_type}
                  onValueChange={(value) =>
                    setTransactionForm({
                      ...transactionForm,
                      transaction_type: value,
                    })
                  }
                >
                  <SelectTrigger id="tx-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                    <SelectItem value="dividend">Dividend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="txDate">Transaction Date</Label>
                <Input
                  id="txDate"
                  type="date"
                  value={transactionForm.transaction_date}
                  onChange={(e) =>
                    setTransactionForm({
                      ...transactionForm,
                      transaction_date: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            {transactionForm.transaction_type !== "dividend" && (
              <div className="space-y-2">
                <Label htmlFor="txQuantity">Quantity</Label>
                <Input
                  id="txQuantity"
                  type="number"
                  step="any"
                  value={transactionForm.quantity}
                  onChange={(e) =>
                    setTransactionForm({
                      ...transactionForm,
                      quantity: e.target.value,
                    })
                  }
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="txPrice">
                {transactionForm.transaction_type === "dividend"
                  ? "Amount received (net of tax)"
                  : "Price per Unit"}
              </Label>
              <Input
                id="txPrice"
                type="number"
                step="0.01"
                value={transactionForm.price}
                onChange={(e) =>
                  setTransactionForm({
                    ...transactionForm,
                    price: e.target.value,
                  })
                }
              />
            </div>

            {/* A dividend is entered net: the amount is what reached the
                account, the tax is only recorded. It has no fees. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {transactionForm.transaction_type !== "dividend" && (
                <div className="space-y-2">
                  <Label htmlFor="txFees">Fees (Optional)</Label>
                  <Input
                    id="txFees"
                    type="number"
                    step="0.01"
                    value={transactionForm.fees}
                    onChange={(e) =>
                      setTransactionForm({
                        ...transactionForm,
                        fees: e.target.value,
                      })
                    }
                    placeholder="0.00"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="txTax">
                  {transactionForm.transaction_type === "dividend"
                    ? "Tax withheld (Optional)"
                    : "Tax (Optional)"}
                </Label>
                <Input
                  id="txTax"
                  type="number"
                  step="0.01"
                  value={transactionForm.tax}
                  onChange={(e) =>
                    setTransactionForm({
                      ...transactionForm,
                      tax: e.target.value,
                    })
                  }
                  placeholder="0.00"
                />
                {transactionForm.transaction_type === "dividend" && (
                  <p className="text-xs text-foreground-muted">
                    Already deducted from the amount above; recorded for your
                    tax overview only.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="txNotes">Notes (Optional)</Label>
              <Input
                id="txNotes"
                value={transactionForm.notes}
                onChange={(e) =>
                  setTransactionForm({
                    ...transactionForm,
                    notes: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTransactionDialog(false);
                resetTransactionForm();
              }}
            >
              Close
            </Button>
            <Button
              onClick={handleSubmitTransaction}
              disabled={
                createTransactionMutation.isPending ||
                updateTransactionMutation.isPending
              }
            >
              {createTransactionMutation.isPending ||
              updateTransactionMutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {editingTransaction ? "Updating..." : "Adding..."}
                </>
              ) : editingTransaction ? (
                "Update trade"
              ) : (
                "Record trade"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
