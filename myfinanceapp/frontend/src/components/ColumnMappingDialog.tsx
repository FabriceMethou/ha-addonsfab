import { useEffect, useState } from "react";
import { AlertCircle, Check } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "./shadcn";

/** What /reconciliation/inspect tells us about an uploaded file. */
export interface CsvInspection {
  headers: string[];
  sample_rows: Record<string, string>[];
  mappable_fields: Record<string, string>;
  matched_profile: SavedProfile | null;
  suggested_map: Record<string, string>;
}

export interface SavedProfile {
  id: number;
  name: string;
  column_map: Record<string, string>;
  amount_format: string;
  date_format: string | null;
  invert_amount: boolean;
}

interface Props {
  open: boolean;
  inspection: CsvInspection;
  /** Pre-fills the name field; usually the bank of the selected account. */
  defaultName?: string;
  onCancel: () => void;
  onSave: (profile: {
    name: string;
    headers: string[];
    column_map: Record<string, string>;
    amount_format: string;
    invert_amount: boolean;
  }) => void;
  saving?: boolean;
}

const NONE = "__none__";

/**
 * Asks which column means what, once per bank.
 *
 * Reconciliation previously understood two hard-coded layouts, so any other
 * bank simply could not be imported. The mapping is saved and matched against
 * the file's header row next time, making this a one-off step per bank.
 */
export default function ColumnMappingDialog({
  open,
  inspection,
  defaultName = "",
  onCancel,
  onSave,
  saving = false,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [amountFormat, setAmountFormat] = useState("european");
  const [invertAmount, setInvertAmount] = useState(false);

  // Start from the server's guess so the common case is one click.
  useEffect(() => {
    if (open) {
      setName(defaultName);
      setColumnMap(inspection.suggested_map || {});
      setAmountFormat("european");
      setInvertAmount(false);
    }
  }, [open, inspection, defaultName]);

  const setField = (field: string, header: string) =>
    setColumnMap((current) => {
      const next = { ...current };
      if (header === NONE) delete next[field];
      else next[field] = header;
      return next;
    });

  const missingRequired = ["date", "amount"].filter((f) => !columnMap[f]);
  const canSave = name.trim().length > 0 && missingRequired.length === 0;

  /** First non-empty value for a column, so the user can see what they're mapping. */
  const preview = (header?: string) => {
    if (!header) return null;
    const row = inspection.sample_rows.find((r) => (r[header] || "").trim());
    return row ? row[header] : null;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Map this bank&apos;s columns</DialogTitle>
          <DialogDescription>
            We don&apos;t recognise this file&apos;s layout yet. Tell us which
            column holds what — we&apos;ll remember it for next time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Name this layout</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Danske Bank current account"
          />
        </div>

        <div className="space-y-3">
          {Object.entries(inspection.mappable_fields).map(([field, label]) => {
            const required = field === "date" || field === "amount";
            const sample = preview(columnMap[field]);
            return (
              <div key={field} className="grid grid-cols-[1fr_1.2fr] gap-3 items-start">
                <Label className="pt-2 text-sm">
                  {label}
                  {required && <span className="text-error ml-1">*</span>}
                </Label>
                <div className="space-y-1">
                  <Select
                    value={columnMap[field] || NONE}
                    onValueChange={(v) => setField(field, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Not in this file" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not in this file</SelectItem>
                      {inspection.headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sample && (
                    <p className="text-xs text-foreground-muted truncate">
                      e.g. {sample}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="grid grid-cols-[1fr_1.2fr] gap-3 items-center">
            <Label className="text-sm">Number format</Label>
            <Select value={amountFormat} onValueChange={setAmountFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="european">1.234,56 — comma decimals</SelectItem>
                <SelectItem value="us">1,234.56 — dot decimals</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Amounts are unsigned</Label>
              <p className="text-xs text-foreground-muted">
                Turn on if payments out appear as positive numbers.
              </p>
            </div>
            <Switch checked={invertAmount} onChange={setInvertAmount} />
          </div>
        </div>

        {missingRequired.length > 0 && (
          <div className="flex items-start gap-2 text-sm text-warning">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Still needed: {missingRequired.join(" and ")}. Without them we can't
              read the statement.
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSave({
                name: name.trim(),
                headers: inspection.headers,
                column_map: columnMap,
                amount_format: amountFormat,
                invert_amount: invertAmount,
              })
            }
            disabled={!canSave || saving}
          >
            <Check className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save and continue"}
          </Button>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
