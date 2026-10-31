// Set a price by hand.
import { Button, Input, Label, Spinner, Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "../shadcn";
import type { InvestmentsState } from "./useInvestments";

export default function ManualPriceDialog({ inv }: { inv: InvestmentsState }) {
  const {
    manualPriceDialog,
    setManualPriceDialog,
    manualPriceHolding,
    setManualPriceHolding,
    manualPrice,
    setManualPrice,
    updateManualPriceMutation,
  } = inv;

  return (
    <>
      {/* Manual Price Update Dialog */}
      <Dialog open={manualPriceDialog} onOpenChange={setManualPriceDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Set Manual Price</DialogTitle>
            <DialogDescription>
              Update the current price for {manualPriceHolding?.symbol} (
              {manualPriceHolding?.name})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="manualPrice">
                Current Price ({manualPriceHolding?.currency || "EUR"})
              </Label>
              <Input
                id="manualPrice"
                type="number"
                step="0.01"
                min="0"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                placeholder="Enter price"
                autoFocus
              />
              <p className="text-xs text-foreground-muted">
                Use this for bonds and crypto, or when automatic price updates
                are unavailable.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setManualPriceDialog(false);
                setManualPrice("");
                setManualPriceHolding(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (manualPriceHolding && manualPrice) {
                  updateManualPriceMutation.mutate({
                    holding_id: manualPriceHolding.id,
                    price: parseFloat(manualPrice),
                  });
                }
              }}
              disabled={
                !manualPrice ||
                parseFloat(manualPrice) <= 0 ||
                updateManualPriceMutation.isPending
              }
            >
              {updateManualPriceMutation.isPending ? (
                <Spinner size="sm" />
              ) : (
                "Update Price"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
