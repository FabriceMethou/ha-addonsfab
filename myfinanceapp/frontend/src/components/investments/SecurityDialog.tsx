// Add or edit a security.
import { Button, Input, Label, Spinner, Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../shadcn";
import type { InvestmentsState } from "./useInvestments";

export default function SecurityDialog({ inv }: { inv: InvestmentsState }) {
  const {
    securityDialog,
    setSecurityDialog,
    editingSecurity,
    securityForm,
    setSecurityForm,
    lookingUpISIN,
    handleSecurityISINLookup,
    createSecurityMutation,
    updateSecurityMutation,
    handleSubmitSecurity,
  } = inv;

  return (
    <>
      {/* Add/Edit Security Dialog */}
      <Dialog open={securityDialog} onOpenChange={setSecurityDialog}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {editingSecurity ? "Edit Security" : "Add Security"}
            </DialogTitle>
            <DialogDescription>
              {editingSecurity
                ? "Update security details in your master list."
                : "Add a new security to your master list for easy holding creation."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="securitySymbol">Symbol</Label>
                <Input
                  id="securitySymbol"
                  value={securityForm.symbol}
                  onChange={(e) =>
                    setSecurityForm({
                      ...securityForm,
                      symbol: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="e.g., AAPL, MSFT"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="securityName">Name</Label>
                <Input
                  id="securityName"
                  value={securityForm.name}
                  onChange={(e) =>
                    setSecurityForm({ ...securityForm, name: e.target.value })
                  }
                  placeholder="e.g., Apple Inc."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="security-type">Type</Label>
                <Select
                  value={securityForm.investment_type}
                  onValueChange={(value) =>
                    setSecurityForm({ ...securityForm, investment_type: value })
                  }
                >
                  <SelectTrigger id="security-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock">Stock</SelectItem>
                    <SelectItem value="etf">ETF</SelectItem>
                    <SelectItem value="mutual_fund">Mutual Fund</SelectItem>
                    <SelectItem value="bond">Bond</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="securityISIN">
                  ISIN (Optional)
                  <span className="text-xs text-foreground-muted ml-1">
                    12-character code (e.g., US0378331005)
                  </span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="securityISIN"
                    value={securityForm.isin}
                    onChange={(e) =>
                      setSecurityForm({
                        ...securityForm,
                        isin: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="e.g., US0378331005"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSecurityISINLookup}
                    disabled={lookingUpISIN}
                  >
                    {lookingUpISIN ? <Spinner size="sm" /> : "Lookup"}
                  </Button>
                </div>
                <p className="text-xs text-foreground-muted mt-1">
                  ISIN lookup works best for stocks, ETFs, and some mutual
                  funds. For bonds and crypto, enter details manually.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="securityExchange">Exchange (Optional)</Label>
                <Input
                  id="securityExchange"
                  value={securityForm.exchange}
                  onChange={(e) =>
                    setSecurityForm({
                      ...securityForm,
                      exchange: e.target.value,
                    })
                  }
                  placeholder="e.g., NASDAQ, NYSE"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="security-currency">Currency</Label>
                <Select
                  value={securityForm.currency}
                  onValueChange={(value) =>
                    setSecurityForm({ ...securityForm, currency: value })
                  }
                >
                  <SelectTrigger id="security-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="CHF">CHF</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="securitySector">Sector (Optional)</Label>
                <Input
                  id="securitySector"
                  value={securityForm.sector}
                  onChange={(e) =>
                    setSecurityForm({ ...securityForm, sector: e.target.value })
                  }
                  placeholder="e.g., Technology, Finance"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="securityCountry">Country (Optional)</Label>
                <Input
                  id="securityCountry"
                  value={securityForm.country}
                  onChange={(e) =>
                    setSecurityForm({
                      ...securityForm,
                      country: e.target.value,
                    })
                  }
                  placeholder="e.g., United States, Germany"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="securityNotes">Notes (Optional)</Label>
              <Textarea
                id="securityNotes"
                value={securityForm.notes}
                onChange={(e) =>
                  setSecurityForm({ ...securityForm, notes: e.target.value })
                }
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSecurityDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitSecurity}
              disabled={
                createSecurityMutation.isPending ||
                updateSecurityMutation.isPending
              }
            >
              {editingSecurity ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
