// Recipients Page - add, rename, merge and delete the payees typed on transactions
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  Contact,
  ExternalLink,
  Merge,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  Autocomplete,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  KPICard,
  Label,
  PageHeader,
  QueryError,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from '../components/shadcn';
import { recipientsAPI } from '../services/api';
import { useToast } from '../contexts/ToastContext';

interface Recipient {
  id: number;
  name: string;
  transaction_count: number;
  first_used: string | null;
  last_used: string | null;
  /** Transactions filed under this recipient with another spelling. */
  variant_count: number;
}

interface RenamePreview {
  old_name: string;
  new_name: string;
  affected: number;
  existing_count: number;
  merges_into_existing: boolean;
}

interface DuplicateGroup {
  id: number;
  name: string;
  keep: string;
  spellings: { name: string; transaction_count: number }[];
  affected: number;
}

type EditMode = 'rename' | 'merge';

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`;

const errorDetail = (error: any) =>
  error.response?.data?.detail || error.message || 'Unknown error';

export default function RecipientsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<number | string>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [newRecipient, setNewRecipient] = useState('');
  const [editing, setEditing] = useState<{ recipient: Recipient; mode: EditMode } | null>(null);
  const [newName, setNewName] = useState('');
  const [preview, setPreview] = useState<RenamePreview | null>(null);
  const [deleting, setDeleting] = useState<Recipient | null>(null);
  const [unifyOpen, setUnifyOpen] = useState(false);

  const {
    data: recipients = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['recipients-manage'],
    queryFn: async () => {
      const response = await recipientsAPI.getAll();
      return response.data.recipients as Recipient[];
    },
  });

  const { data: duplicates, isLoading: duplicatesLoading } = useQuery({
    queryKey: ['recipient-duplicates'],
    queryFn: async () => {
      const response = await recipientsAPI.getDuplicates();
      return response.data.duplicates as DuplicateGroup[];
    },
    enabled: unifyOpen,
  });

  // A change to recipients relabels transactions and changes what the
  // recipient field of the transaction form offers.
  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['recipients-manage'] });
    queryClient.invalidateQueries({ queryKey: ['recipient-duplicates'] });
    queryClient.invalidateQueries({ queryKey: ['recipients'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
  };

  const createMutation = useMutation({
    mutationFn: (name: string) => recipientsAPI.create(name),
    onSuccess: (response) => {
      refreshAll();
      setAddOpen(false);
      setNewRecipient('');
      toast.success(`Recipient "${response.data.name}" added`);
    },
    onError: (error: any) => toast.error(`Failed to add recipient: ${errorDetail(error)}`),
  });

  const previewMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      recipientsAPI.rename(id, name, false),
    onSuccess: (response) => setPreview(response.data),
    onError: (error: any) => toast.error(`Could not check that change: ${errorDetail(error)}`),
  });

  const applyMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      recipientsAPI.rename(id, name, true),
    onSuccess: (response) => {
      refreshAll();
      closeEdit();
      toast.success(response.data.message);
    },
    onError: (error: any) => toast.error(`Failed to rename: ${errorDetail(error)}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => recipientsAPI.delete(id),
    onSuccess: () => {
      refreshAll();
      toast.success(`Recipient "${deleting?.name}" deleted`);
      setDeleting(null);
    },
    onError: (error: any) => toast.error(`Failed to delete recipient: ${errorDetail(error)}`),
  });

  const unifyMutation = useMutation({
    mutationFn: () => recipientsAPI.unifyDuplicates(),
    onSuccess: (response) => {
      refreshAll();
      setUnifyOpen(false);
      toast.success(response.data.message);
    },
    onError: (error: any) => toast.error(`Failed to unify: ${errorDetail(error)}`),
  });

  const openEdit = (recipient: Recipient, mode: EditMode) => {
    setEditing({ recipient, mode });
    setNewName(mode === 'rename' ? recipient.name : '');
    setPreview(null);
  };

  const closeEdit = () => {
    setEditing(null);
    setNewName('');
    setPreview(null);
  };

  const viewTransactions = (recipient: Recipient) =>
    navigate('/transactions', { state: { presetFilters: { recipient: recipient.name } } });

  const inUse = recipients.filter((r) => r.transaction_count > 0).length;
  const unused = recipients.length - inUse;
  const withVariants = recipients.filter((r) => r.variant_count > 0).length;

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return recipients.filter(
      (r) =>
        (filterTab === 'all' || r.transaction_count === 0) &&
        (!needle || r.name.toLowerCase().includes(needle)),
    );
  }, [recipients, search, filterTab]);

  const mergeTargets = useMemo(
    () => recipients.filter((r) => r.id !== editing?.recipient.id).map((r) => r.name),
    [recipients, editing],
  );

  const unchanged =
    !editing || !newName.trim() || newName.trim() === editing.recipient.name;

  if (isError) {
    return <QueryError message="Failed to load recipients." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recipients"
        description="Who you pay and who pays you. Transfers, investments and debt payments carry their own names and are not listed here."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Recipient
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <KPICard
          title="Recipients"
          value={recipients.length.toString()}
          icon={<Contact size={24} className="text-blue-500" />}
          iconColor="bg-blue-500"
          loading={isLoading}
        />
        <KPICard
          title="In use"
          value={inUse.toString()}
          icon={<CheckCircle2 size={24} className="text-emerald-500" />}
          iconColor="bg-emerald-500"
          loading={isLoading}
        />
        <KPICard
          title="Unused (can be deleted)"
          value={unused.toString()}
          icon={<Trash2 size={24} className="text-rose-500" />}
          iconColor="bg-rose-500"
          loading={isLoading}
        />
      </div>

      {withVariants > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg bg-warning/10 border border-warning/20">
          <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />
          <p className="text-sm text-foreground flex-1">
            {plural(withVariants, 'recipient')} {withVariants !== 1 ? 'have' : 'has'} older
            transactions saved with a different capitalisation, like "Lidl" and "LIDL".
            They already count as one recipient; unifying makes every transaction use
            the same spelling.
          </p>
          <Button variant="outline" size="sm" onClick={() => setUnifyOpen(true)}>
            Review and unify
          </Button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Tabs value={filterTab} onValueChange={setFilterTab}>
          <TabsList>
            <TabsTrigger value="all">All ({recipients.length})</TabsTrigger>
            <TabsTrigger value="unused">Unused ({unused})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a recipient..."
            className="pl-9"
            aria-label="Find a recipient"
          />
        </div>
      </div>

      <Card className="p-2 sm:p-4 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="w-6 h-6" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Contact}
            title={recipients.length === 0 ? 'No recipients yet' : 'No recipient matches'}
            description={
              recipients.length === 0
                ? 'Recipients appear here as you add transactions, or you can add one now.'
                : 'Try another search or filter.'
            }
            action={
              recipients.length === 0
                ? { label: 'Add Recipient', onClick: () => setAddOpen(true) }
                : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead hiddenOnMobile>Last used</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{r.name}</span>
                      {r.variant_count > 0 && (
                        <Badge variant="warning" size="sm">
                          {r.variant_count} spelled differently
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.transaction_count > 0 ? (
                      r.transaction_count
                    ) : (
                      <span className="text-foreground-muted">Unused</span>
                    )}
                  </TableCell>
                  <TableCell hiddenOnMobile className="text-foreground-muted">
                    {r.last_used ? format(parseISO(r.last_used), 'MMM d, yyyy') : '-'}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => viewTransactions(r)}
                      disabled={r.transaction_count === 0}
                      title="View transactions"
                      aria-label={`View transactions for ${r.name}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(r, 'rename')}
                      title="Rename"
                      aria-label={`Rename ${r.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(r, 'merge')}
                      disabled={recipients.length < 2}
                      title="Merge into another recipient"
                      aria-label={`Merge ${r.name} into another recipient`}
                    >
                      <Merge className="h-4 w-4" />
                    </Button>
                    {/* A disabled button shows no tooltip, so the reason sits on a wrapper. */}
                    <span
                      className="inline-block"
                      title={
                        r.transaction_count > 0
                          ? `Used by ${plural(r.transaction_count, 'transaction')}. Merge it into another recipient first.`
                          : 'Delete'
                      }
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleting(r)}
                        disabled={r.transaction_count > 0}
                        className="text-error hover:text-error"
                        aria-label={`Delete ${r.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Add Recipient</DialogTitle>
            <DialogDescription>
              It will be offered in the recipient field of new transactions.
            </DialogDescription>
          </DialogHeader>
          <form
            className="py-4 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newRecipient.trim()) createMutation.mutate(newRecipient);
            }}
          >
            <Label htmlFor="recipient-name">Name</Label>
            <Input
              id="recipient-name"
              value={newRecipient}
              onChange={(e) => setNewRecipient(e.target.value)}
              placeholder="e.g., Lidl, Landlord, Employer"
              autoFocus
            />
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(newRecipient)}
              loading={createMutation.isPending}
              disabled={!newRecipient.trim()}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename / Merge Dialog: nothing changes until the preview is confirmed */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {editing?.mode === 'merge' ? 'Merge Recipient' : 'Rename Recipient'}
            </DialogTitle>
            <DialogDescription>
              {editing?.mode === 'merge'
                ? `Every transaction of "${editing?.recipient.name}" moves to the recipient you pick, and "${editing?.recipient.name}" is removed.`
                : `Every transaction of "${editing?.recipient.name}" will carry the new name.`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipient-new-name">
                {editing?.mode === 'merge' ? 'Merge into' : 'New name'}
              </Label>
              {editing?.mode === 'merge' ? (
                <Autocomplete
                  id="recipient-new-name"
                  options={mergeTargets}
                  value={newName}
                  // Autocomplete re-reports its value on any click outside it,
                  // the Merge button included: only a real change voids the preview.
                  onChange={(value) => {
                    if (value === newName) return;
                    setNewName(value);
                    setPreview(null);
                  }}
                  placeholder="Search recipient..."
                />
              ) : (
                <Input
                  id="recipient-new-name"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setPreview(null);
                  }}
                  autoFocus
                />
              )}
            </div>

            {preview && (
              <div className="rounded-lg border border-warning/20 bg-warning/10 p-4 space-y-2">
                <p className="flex items-start gap-2 text-sm font-medium text-warning">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  Confirm before this goes ahead
                </p>
                <p className="text-sm text-foreground">
                  <strong>{plural(preview.affected, 'transaction')}</strong> will move from "
                  {preview.old_name}" to "{preview.new_name}".
                </p>
                {preview.merges_into_existing && (
                  <p className="text-sm text-foreground">
                    "{preview.new_name}" already has{' '}
                    <strong>{plural(preview.existing_count, 'transaction')}</strong>: the two
                    recipients become one.
                  </p>
                )}
                <p className="text-sm text-foreground-muted">
                  This cannot be undone. Amounts, accounts and balances are not affected.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
            {!preview ? (
              <Button
                onClick={() =>
                  editing &&
                  previewMutation.mutate({ id: editing.recipient.id, name: newName.trim() })
                }
                loading={previewMutation.isPending}
                disabled={unchanged}
              >
                Review change
              </Button>
            ) : (
              <Button
                onClick={() =>
                  editing &&
                  applyMutation.mutate({ id: editing.recipient.id, name: newName.trim() })
                }
                loading={applyMutation.isPending}
              >
                {preview.merges_into_existing ? 'Merge' : 'Rename'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete Recipient</DialogTitle>
            <DialogDescription className="sr-only">
              Confirm deletion of this recipient.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 text-warning border border-warning/20">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">
                Delete "{deleting?.name}"? No transaction uses it, so nothing else changes.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              loading={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unify Duplicates Dialog */}
      <Dialog open={unifyOpen} onOpenChange={setUnifyOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Unify Spellings</DialogTitle>
            <DialogDescription>
              Each recipient keeps the spelling it uses most. You can rename any of them
              afterwards. Transfers, investments and debt payments are not touched.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 max-h-[50vh] overflow-y-auto">
            {duplicatesLoading ? (
              <div className="flex justify-center py-8">
                <Spinner className="w-5 h-5" />
              </div>
            ) : duplicates && duplicates.length > 0 ? (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {duplicates.map((group) => (
                  <li key={group.id} className="px-4 py-3 space-y-1">
                    <p className="text-sm text-foreground">
                      {group.spellings.map((s, i) => (
                        <span key={s.name}>
                          {i > 0 && <span className="text-foreground-muted">, </span>}"{s.name}"{' '}
                          <span className="text-foreground-muted">({s.transaction_count})</span>
                        </span>
                      ))}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      Keeps <strong className="text-foreground">"{group.keep}"</strong>
                      {group.affected > 0 && ` · ${plural(group.affected, 'transaction')} renamed`}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-foreground-muted text-center py-6">
                Every recipient already uses a single spelling.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUnifyOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => unifyMutation.mutate()}
              loading={unifyMutation.isPending}
              disabled={!duplicates || duplicates.length === 0}
            >
              {duplicates && duplicates.length > 0
                ? `Unify ${plural(duplicates.reduce((n, g) => n + g.affected, 0), 'transaction')}`
                : 'Unify'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
