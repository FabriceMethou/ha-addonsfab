// Add or edit a holding.
import { Plus } from "lucide-react";
import { Button, Input, Label, Spinner, Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../shadcn";
import type { InvestmentsState } from "./useInvestments";

export default function HoldingDialog({ inv }: { inv: InvestmentsState }) {
  const {
    holdingDialog,
    setHoldingDialog,
    setSecurityDialog,
    editingHolding,
    holdingForm,
    setHoldingForm,
    securitiesData,
    investmentAccounts,
    accountsError,
    accountsLoading,
    createHoldingMutation,
    updateHoldingMutation,
    quantityFromTrades,
    handleSubmitHolding,
  } = inv;

  return (
    <>
      {/* Add/Edit Holding Dialog */}
      <Dialog open={holdingDialog} onOpenChange={setHoldingDialog}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {editingHolding ? "Edit Holding" : "Add Holding"}
            </DialogTitle>
            <DialogDescription>
              {editingHolding
                ? "Update your investment holding details."
                : "Add a new investment to your portfolio by selecting from your securities list."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="holding-security">Security</Label>
              <Select
                value={holdingForm.security_id}
                onValueChange={(value) =>
                  setHoldingForm({ ...holdingForm, security_id: value })
                }
              >
                <SelectTrigger id="holding-security">
                  <SelectValue placeholder="Select a security" />
                </SelectTrigger>
                <SelectContent>
                  {securitiesData?.map((security: any) => (
                    <SelectItem
                      key={security.id}
                      value={security.id.toString()}
                    >
                      {security.symbol} - {security.name} (
                      {security.investment_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setHoldingDialog(false);
                    setSecurityDialog(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Security
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="holding-account">Investment Account</Label>
              <Select
                value={holdingForm.account_id}
                onValueChange={(value) =>
                  setHoldingForm({ ...holdingForm, account_id: value })
                }
              >
                <SelectTrigger id="holding-account">
                  <SelectValue placeholder="Select investment account" />
                </SelectTrigger>
                <SelectContent>
                  {investmentAccounts?.map((account: any) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.bank_name ? `${account.bank_name} - ` : ""}
                      {account.name} ({account.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accountsLoading ? (
                <p className="text-sm text-info mt-2">
                  Loading investment accounts...
                </p>
              ) : accountsError ? (
                <div className="text-sm text-error mt-2 p-2 bg-error/10 rounded">
                  <p className="font-medium">Failed to load accounts</p>
                  <p className="text-xs mt-1">
                    {accountsError.message.includes("Network Error")
                      ? "Network error - cannot connect to server"
                      : accountsError.message.includes("401")
                        ? "Authentication failed - please log in again"
                        : accountsError.message || "Unknown error"}
                  </p>
                  <p className="text-xs mt-1">
                    Error code:{" "}
                    {(accountsError as any)?.response?.status || "N/A"}
                  </p>
                </div>
              ) : !investmentAccounts || investmentAccounts.length === 0 ? (
                <p className="text-sm text-warning mt-2">
                  No investment accounts found. Please create an investment
                  account first.
                </p>
              ) : null}
            </div>

            {quantityFromTrades ? (
              <p className="text-sm text-foreground-muted rounded-lg border border-border bg-surface px-3 py-2">
                Quantity and cost come from this holding's{" "}
                {editingHolding.transaction_count} trade
                {editingHolding.transaction_count !== 1 ? "s" : ""}: add or
                edit a trade to change them.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="any"
                    value={holdingForm.quantity}
                    onChange={(e) =>
                      setHoldingForm({ ...holdingForm, quantity: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="purchasePrice">Purchase Price</Label>
                  <Input
                    id="purchasePrice"
                    type="number"
                    step="0.01"
                    value={holdingForm.purchase_price}
                    onChange={(e) =>
                      setHoldingForm({
                        ...holdingForm,
                        purchase_price: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!quantityFromTrades && (
                <div className="space-y-2">
                  <Label htmlFor="purchaseDate">Purchase Date</Label>
                  <Input
                    id="purchaseDate"
                    type="date"
                    value={holdingForm.purchase_date}
                    onChange={(e) =>
                      setHoldingForm({
                        ...holdingForm,
                        purchase_date: e.target.value,
                      })
                    }
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="holdingNotes">Notes (Optional)</Label>
                <Input
                  id="holdingNotes"
                  value={holdingForm.notes}
                  onChange={(e) =>
                    setHoldingForm({ ...holdingForm, notes: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHoldingDialog(false)}
              disabled={
                createHoldingMutation.isPending ||
                updateHoldingMutation.isPending
              }
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitHolding}
              disabled={
                createHoldingMutation.isPending ||
                updateHoldingMutation.isPending
              }
            >
              {createHoldingMutation.isPending ||
              updateHoldingMutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {editingHolding ? "Updating..." : "Adding..."}
                </>
              ) : editingHolding ? (
                "Update"
              ) : (
                "Add"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
