import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Merge, Pencil, Search } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "./shadcn";
import { transactionsAPI } from "../services/api";
import { useToast } from "../contexts/ToastContext";

interface Recipient {
  recipient: string;
  transaction_count: number;
  first_seen: string;
  last_seen: string;
}

interface RenamePreview {
  old_name: string;
  new_name: string;
  affected: number;
  existing_count: number;
  merges_into_existing: boolean;
  message: string;
}

/**
 * Fix a mistyped payee everywhere at once.
 *
 * Storage only capitalises the first letter, so "ReWe" stays "ReWe" and sits in
 * the list beside "Rewe" as a separate payee. Correcting that used to mean
 * editing every transaction by hand.
 *
 * A rename can also merge two payees into one, which is easy to trigger without
 * meaning to — so nothing happens until the preview has been seen and confirmed.
 */
export default function RecipientManager() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Recipient | null>(null);
  const [newName, setNewName] = useState("");
  const [preview, setPreview] = useState<RenamePreview | null>(null);

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["recipients-management"],
    queryFn: () =>
      transactionsAPI
        .getRecipientsForManagement()
        .then((r) => r.data.recipients as Recipient[]),
  });

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return recipients;
    return recipients.filter((r) =>
      r.recipient.toLowerCase().includes(needle),
    );
  }, [recipients, filter]);

  /** Payees differing only in case — the ones usually worth merging. */
  const variantGroups = useMemo(() => {
    const groups = new Map<string, Recipient[]>();
    for (const r of recipients) {
      const key = r.recipient.toLowerCase();
      groups.set(key, [...(groups.get(key) || []), r]);
    }
    return new Set(
      [...groups.values()].filter((g) => g.length > 1).flatMap((g) => g.map((r) => r.recipient)),
    );
  }, [recipients]);

  const previewMutation = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      transactionsAPI.renameRecipient(from, to, false),
    onSuccess: (response) => setPreview(response.data),
    onError: (error: any) =>
      toast.error(error.response?.data?.detail || "Could not check that rename"),
  });

  const applyMutation = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      transactionsAPI.renameRecipient(from, to, true),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["recipients-management"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
      toast.success(response.data.message);
      close();
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.detail || "Could not rename"),
  });

  const open = (recipient: Recipient) => {
    setEditing(recipient);
    setNewName(recipient.recipient);
    setPreview(null);
  };

  const close = () => {
    setEditing(null);
    setNewName("");
    setPreview(null);
  };

  const unchanged = !editing || newName.trim() === editing.recipient;

  if (isLoading) {
    return <p className="text-sm text-foreground-muted">Loading payees…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-foreground-muted shrink-0" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a payee..."
        />
      </div>

      {variantGroups.size > 0 && (
        <p className="text-sm text-warning flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Some payees differ only in capitalisation. Renaming one to match
            another merges them.
          </span>
        </p>
      )}

      <ul className="divide-y divide-border rounded border border-border">
        {visible.map((r) => (
          <li
            key={r.recipient}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <div className="min-w-0">
              <span className="font-medium">{r.recipient}</span>
              {variantGroups.has(r.recipient) && (
                <Merge
                  className="inline w-3.5 h-3.5 ml-1.5 text-warning"
                  aria-label="another payee differs only in capitalisation"
                />
              )}
              <p className="text-xs text-foreground-muted">
                {r.transaction_count} transaction
                {r.transaction_count !== 1 ? "s" : ""} · {r.first_seen} to{" "}
                {r.last_seen}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => open(r)}>
              <Pencil className="w-4 h-4 mr-1.5" />
              Rename
            </Button>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-foreground-muted">
            No payee matches “{filter}”.
          </li>
        )}
      </ul>

      <Dialog open={!!editing} onOpenChange={(o) => !o && close()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Rename this payee</DialogTitle>
            <DialogDescription>
              Every transaction using “{editing?.recipient}” will carry the new
              name.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-recipient">New name</Label>
              <Input
                id="new-recipient"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setPreview(null);
                }}
                autoFocus
              />
            </div>

            {preview && (
              <div className="rounded border border-warning/40 bg-warning/10 p-3 space-y-2">
                <p className="flex items-start gap-2 text-sm font-medium text-warning">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  Confirm before this goes ahead
                </p>
                <p className="text-sm">
                  <strong>{preview.affected}</strong> transaction
                  {preview.affected !== 1 ? "s" : ""} will be renamed from “
                  {preview.old_name}” to “{preview.new_name}”.
                </p>
                {preview.merges_into_existing && (
                  <p className="text-sm">
                    “{preview.new_name}” already covers{" "}
                    <strong>{preview.existing_count}</strong> transaction
                    {preview.existing_count !== 1 ? "s" : ""} — the two payees
                    will be merged into one.
                  </p>
                )}
                <p className="text-sm text-foreground-muted">
                  This cannot be undone. Amounts, accounts and balances are not
                  affected.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              {!preview ? (
                <Button
                  disabled={unchanged || previewMutation.isPending}
                  onClick={() =>
                    editing &&
                    previewMutation.mutate({
                      from: editing.recipient,
                      to: newName.trim(),
                    })
                  }
                >
                  {previewMutation.isPending ? "Checking…" : "Review change"}
                </Button>
              ) : (
                <Button
                  disabled={applyMutation.isPending}
                  onClick={() =>
                    editing &&
                    applyMutation.mutate({
                      from: editing.recipient,
                      to: newName.trim(),
                    })
                  }
                >
                  {applyMutation.isPending
                    ? "Renaming…"
                    : `Rename ${preview.affected} transaction${preview.affected !== 1 ? "s" : ""}`}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
