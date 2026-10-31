// The bulk price refresh: starts it, follows its progress, keeps the last result.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../contexts/ToastContext";
import { investmentsAPI } from "../../services/api";

export function usePriceUpdates() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [lastUpdateResult, setLastUpdateResult] = useState<{
    updated: number;
    skipped: number;
    failed: number;
    failedSymbols?: string[];
  } | null>(null);

  // Update all prices — the backend now runs this on a worker thread and we
  // poll for progress, instead of holding a request open for several minutes.
  const [priceUpdateRunning, setPriceUpdateRunning] = useState(false);
  const [priceUpdateProgress, setPriceUpdateProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);

  const { data: priceUpdateStatus } = useQuery({
    queryKey: ["price-update-status"],
    queryFn: () => investmentsAPI.getPriceUpdateStatus().then((r) => r.data),
    // Only poll while a run is in flight.
    refetchInterval: priceUpdateRunning ? 1500 : false,
    enabled: priceUpdateRunning,
  });

  useEffect(() => {
    if (!priceUpdateStatus || !priceUpdateRunning) return;

    setPriceUpdateProgress({
      processed: priceUpdateStatus.processed ?? 0,
      total: priceUpdateStatus.total ?? 0,
    });

    if (priceUpdateStatus.running) return;

    // Finished — settle the UI and refresh the figures.
    setPriceUpdateRunning(false);
    setPriceUpdateProgress(null);
    queryClient.invalidateQueries({ queryKey: ["investments-holdings"] });
    queryClient.invalidateQueries({ queryKey: ["investments-summary"] });

    const failed = priceUpdateStatus.failed ?? [];
    const skipped = priceUpdateStatus.skipped ?? [];
    setLastUpdateResult({
      updated: priceUpdateStatus.updated_count ?? 0,
      skipped: skipped.length,
      failed: failed.length,
      failedSymbols: failed.map((f: any) => f.symbol || f),
    });

    if (priceUpdateStatus.error) {
      toast.error(`Price update stopped: ${priceUpdateStatus.error}`);
    } else {
      let message = `Updated ${priceUpdateStatus.updated_count} holding${
        priceUpdateStatus.updated_count !== 1 ? "s" : ""
      }`;
      if (skipped.length) message += `, ${skipped.length} skipped`;
      if (failed.length) message += `, ${failed.length} failed`;
      toast.success(message);
    }

    setTimeout(() => setLastUpdateResult(null), 10000);
  }, [priceUpdateStatus, priceUpdateRunning, queryClient, toast]);

  const updateAllPricesMutation = useMutation({
    mutationFn: () => investmentsAPI.updateAllPrices(),
    onSuccess: (response) => {
      const data = response.data;
      if (data.status === "idle") {
        toast.success("No holdings to update");
        return;
      }
      if (data.status === "already_running") {
        toast.success("A price update is already running");
      }
      setPriceUpdateRunning(true);
      setPriceUpdateProgress({
        processed: data.processed ?? 0,
        total: data.total ?? 0,
      });
    },
    onError: (error: any) => {
      console.error("Failed to start price update:", error);
      setPriceUpdateRunning(false);
      setPriceUpdateProgress(null);
      const errorMessage =
        error.response?.data?.detail || error.message || "Unknown error";
      toast.error(`Failed to start price update: ${errorMessage}`);
    },
  });

  // Manual price update mutation

  return {
    lastUpdateResult,
    setLastUpdateResult,
    priceUpdateRunning,
    priceUpdateProgress,
    updateAllPricesMutation,
  };
}
