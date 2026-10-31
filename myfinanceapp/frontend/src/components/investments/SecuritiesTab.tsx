// The master list of securities.
import { Plus, Pencil, Trash2, LineChart, ChevronDown, ChevronUp } from "lucide-react";
import { Button, Card, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TabsContent, EmptyState } from "../shadcn";
import { TAB_SECURITIES, investmentTypeLabel } from "./shared";
import type { InvestmentsState } from "./useInvestments";

export default function SecuritiesTab({ inv }: { inv: InvestmentsState }) {
  const {
    isMobile,
    expandedSecurity,
    setExpandedSecurity,
    setSecurityDialog,
    setEditingSecurity,
    setDeleteConfirm,
    securitiesData,
    resetSecurityForm,
    handleEditSecurity,
  } = inv;

  return (
    <>
          {/* Securities Tab */}
          <TabsContent value={TAB_SECURITIES}>
            <div className="flex justify-end mb-4">
              <Button
                onClick={() => {
                  setEditingSecurity(null);
                  resetSecurityForm();
                  setSecurityDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Security
              </Button>
            </div>

            {securitiesData && securitiesData.length > 0 ? (
              isMobile ? (
                <div className="space-y-2">
                  {securitiesData.map((security: any) => {
                    const isExpanded = expandedSecurity === security.id;
                    return (
                      <Card
                        key={security.id}
                        className={`rounded-xl overflow-hidden border border-border bg-card/50 backdrop-blur-sm transition-all ${isExpanded ? "ring-2 ring-primary/50" : ""}`}
                      >
                        <div
                          className="p-4 cursor-pointer hover:bg-surface-hover transition-colors"
                          onClick={() =>
                            setExpandedSecurity(isExpanded ? null : security.id)
                          }
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-foreground">
                                {security.symbol}
                              </p>
                              <p className="text-xs text-foreground-muted truncate">
                                {security.name}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge variant="default" size="sm">
                                {investmentTypeLabel(security.investment_type)}
                              </Badge>
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
                                  ISIN
                                </p>
                                <p className="text-sm">
                                  {security.isin || "-"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-foreground-muted">
                                  Exchange
                                </p>
                                <p className="text-sm">
                                  {security.exchange || "-"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-foreground-muted">
                                  Currency
                                </p>
                                <p className="text-sm">
                                  {security.currency || "-"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-foreground-muted">
                                  Sector
                                </p>
                                <p className="text-sm">
                                  {security.sector || "-"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-foreground-muted">
                                  Country
                                </p>
                                <p className="text-sm">
                                  {security.country || "-"}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-1 pt-2 border-t border-border">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditSecurity(security)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirm(security)}
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
                        <TableHead>Symbol</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>ISIN</TableHead>
                        <TableHead>Exchange</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Sector</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {securitiesData.map((security: any) => (
                        <TableRow key={security.id}>
                          <TableCell className="font-semibold">
                            {security.symbol}
                          </TableCell>
                          <TableCell>{security.name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {investmentTypeLabel(security.investment_type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {security.isin || "-"}
                          </TableCell>
                          <TableCell>{security.exchange || "-"}</TableCell>
                          <TableCell>{security.currency}</TableCell>
                          <TableCell>{security.sector || "-"}</TableCell>
                          <TableCell>{security.country || "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditSecurity(security)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirm(security)}
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
              <EmptyState
                icon={LineChart}
                title="No securities yet"
                description="Add securities to your master list to easily create holdings."
                action={{
                  label: "Add Security",
                  onClick: () => {
                    setEditingSecurity(null);
                    resetSecurityForm();
                    setSecurityDialog(true);
                  },
                }}
              />
            )}
          </TabsContent>
    </>
  );
}
