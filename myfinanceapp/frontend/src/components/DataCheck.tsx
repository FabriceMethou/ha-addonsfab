// The Data check: what is inconsistent in the data, with the repairs for it. The
// add-on has no easy shell, so this is where those repairs can actually be run.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "./shadcn";
import { useToast } from "../contexts/ToastContext";
import { settingsAPI } from "../services/api";
import { formatCurrency } from "../lib/utils";

interface Repair {
  id: string;
  title: string;
  detail: string;
  count: number;
}

interface DataCheckReport {
  problems: { kind: string; subject: string; problem: string }[];
  balances: {
    account_id: number;
    name: string;
    currency: string;
    stored_balance: number;
    ledger_balance: number;
    difference: number;
  }[];
  repairs: Repair[];
}

export default function DataCheck() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState<Repair | null>(null);

  const { data, isLoading } = useQuery<DataCheckReport>({
    queryKey: ["data-check"],
    queryFn: async () => (await settingsAPI.getDataCheck()).data,
  });

  const repairMutation = useMutation({
    mutationFn: (repair: string) => settingsAPI.runDataRepair(repair),
    onSuccess: (response) => {
      // A repair can change any total in the app.
      queryClient.invalidateQueries();
      setConfirming(null);
      toast.success(`Repair done: ${response.data.repaired} corrected`);
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.detail || error.message || "Unknown error";
      toast.error(`Repair failed: ${message}`);
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  const repairs = data.repairs.filter((r) => r.count > 0);
  const clean = repairs.length === 0 && data.problems.length === 0;

  return (
    <div className="space-y-4 mt-4">
      {clean && (
        <Card className="p-6 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-success" />
          <p className="text-foreground">Everything agrees. Nothing to repair.</p>
        </Card>
      )}

      {repairs.map((repair) => (
        <Card key={repair.id} className="p-6" data-testid={`repair-${repair.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-foreground">
                {repair.title} ({repair.count})
              </h3>
              <p className="text-sm text-foreground-muted mt-1">{repair.detail}</p>
              {repair.id === "balances" && (
                <ul className="mt-3 space-y-1 text-sm text-foreground">
                  {data.balances.map((b) => (
                    <li key={b.account_id}>
                      {b.name}: shows{" "}
                      {formatCurrency(b.stored_balance, b.currency)}, its
                      transactions add up to{" "}
                      {formatCurrency(b.ledger_balance, b.currency)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button variant="outline" onClick={() => setConfirming(repair)}>
              <Wrench className="w-4 h-4 mr-2" />
              Repair
            </Button>
          </div>
        </Card>
      ))}

      {data.problems.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            To look at yourself ({data.problems.length})
          </h3>
          <p className="text-sm text-foreground-muted mt-1">
            Only you know which side is right. Correct these on the Debts or
            Investments page.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-foreground">
            {data.problems.map((p, index) => (
              <li key={index}>
                <span className="font-medium">{p.subject}:</span> {p.problem}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog
        open={!!confirming}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirming?.title}</DialogTitle>
            <DialogDescription>
              {confirming?.detail} A backup is taken first, so you can restore
              it from this page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              loading={repairMutation.isPending}
              onClick={() => confirming && repairMutation.mutate(confirming.id)}
            >
              Repair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
