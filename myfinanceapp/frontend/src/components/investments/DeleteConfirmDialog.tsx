// Confirm deleting a security, holding or trade.
import { AlertTriangle } from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "../shadcn";
import type { InvestmentsState } from "./useInvestments";

export default function DeleteConfirmDialog({ inv }: { inv: InvestmentsState }) {
  const {
    deleteConfirm,
    setDeleteConfirm,
    deleteSecurityMutation,
    deleteHoldingMutation,
    deleteTransactionMutation,
  } = inv;

  return (
    <>
      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription className="sr-only">
              Confirm deletion of this investment item.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 text-warning">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">
                {deleteConfirm?.isTransaction ? (
                  <>
                    Are you sure you want to delete this{" "}
                    {deleteConfirm?.transaction_type} transaction for "
                    {deleteConfirm?.symbol}"?
                  </>
                ) : deleteConfirm?.security_id ? (
                  <>
                    Are you sure you want to delete the holding "
                    {deleteConfirm?.symbol}"? This will also delete all related
                    transactions.
                  </>
                ) : (
                  <>
                    Are you sure you want to delete the security "
                    {deleteConfirm?.symbol}"? This will prevent you from
                    creating new holdings for this security.
                  </>
                )}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm?.isTransaction) {
                  // Delete transaction
                  deleteTransactionMutation.mutate(deleteConfirm.id);
                } else if (deleteConfirm?.security_id) {
                  // Items with security_id are holdings (it's a foreign key)
                  deleteHoldingMutation.mutate(deleteConfirm.id);
                } else {
                  // Items without security_id are securities
                  deleteSecurityMutation.mutate(deleteConfirm.id);
                }
              }}
              disabled={
                deleteSecurityMutation.isPending ||
                deleteHoldingMutation.isPending ||
                deleteTransactionMutation.isPending
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
