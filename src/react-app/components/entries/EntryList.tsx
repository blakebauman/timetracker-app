import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Trash2, X, DollarSign, Upload, Clock, AlertTriangle } from "lucide-react";
import { EntryGroup } from "./EntryGroup";
import { EntryForm } from "./EntryForm";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FirstProjectPrompt } from "./FirstProjectPrompt";
import {
  useGroupedEntriesRange,
  useBulkDeleteEntries,
  useBulkUpdateEntries,
  useCreateEntry,
} from "@/hooks/useEntries";
import { useIntegrations, usePushEntries } from "@/hooks/useIntegrations";
import { useProjects } from "@/hooks/useProjects";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { toCreatePayload } from "@/lib/entryUtils";
import { ENTRY_LIST_LIMIT } from "@shared/schemas";

interface EntryListProps {
  since: Date;
  until: Date;
  /** Opens the Add-entry dialog from the empty state's primary action. */
  onAddEntry?: () => void;
}

// The day-grouped entry list body for a single period. Period navigation, the
// logged bar, and the add buttons live in the shared TimerWorkspace header — this
// component only renders the list + bulk actions for [since, until].
export function EntryList({ since, until, onAddEntry }: EntryListProps) {
  const { days, entries, isLoading, error, refetch } = useGroupedEntriesRange(
    since.toISOString(),
    until.toISOString()
  );
  const { runningEntry } = useTimerStore();
  // Cached app-wide (the pickers and header already subscribe), so this is a
  // read of existing state rather than a first-run-only fetch.
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bulkDelete = useBulkDeleteEntries();
  const bulkUpdate = useBulkUpdateEntries();
  const pushEntries = usePushEntries();
  const createEntry = useCreateEntry();
  const { data: integrations = [] } = useIntegrations();

  // The edit sheet is hosted here rather than inside EntryRow. A row unmounts
  // whenever its day or grouping changes — which the sheet itself can cause, by
  // editing the date or the description — and taking the open sheet down with it
  // dropped the mutation's `onSuccess: onClose`, leaving `editEntryId` set so the
  // sheet immediately reopened on the remounted row.
  const editEntryId = useUIStore((s) => s.editEntryId);
  const closeEntryEditor = useUIStore((s) => s.closeEntryEditor);
  const editingEntry = editEntryId
    ? (entries.find((e) => e.id === editEntryId) ?? null)
    : null;

  const onToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = () => {
    const ids = [...selectedIds];
    const payloads = entries
      .filter((e) => selectedIds.has(e.id))
      .map(toCreatePayload);
    bulkDelete.mutate(ids, { onSuccess: clearSelection });
    toast.success(`${ids.length} ${ids.length === 1 ? "entry" : "entries"} deleted`, {
      action: {
        label: "Undo",
        onClick: () => payloads.forEach((p) => createEntry.mutate(p)),
      },
    });
  };

  const handleBulkBillable = (billable: boolean) => {
    const ids = [...selectedIds];
    bulkUpdate.mutate({ ids, patch: { billable } }, { onSuccess: clearSelection });
  };

  const handleBulkPush = () => {
    const ids = [...selectedIds];
    pushEntries.mutate({ entryIds: ids }, { onSuccess: clearSelection });
  };

  const selectionCount = selectedIds.size;

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load your entries"
        description="The request didn't get through. Your tracked time is safe."
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        }
        className="py-20"
      />
    );
  }

  if (days.length === 0 && !runningEntry) {
    // A workspace with no projects at all is a first run, not a quiet week —
    // and the two want different advice. Wait for the projects query so the
    // prompt doesn't flash before the list is known to be genuinely empty.
    if (!projectsLoading && projects.length === 0) {
      return <FirstProjectPrompt onAddEntry={onAddEntry} />;
    }
    return (
      <EmptyState
        icon={Clock}
        title="Nothing tracked in this period"
        description="Start the timer to track as you work, or add an entry for time you've already spent."
        action={
          <Button variant="outline" size="sm" onClick={onAddEntry}>
            Add an entry
          </Button>
        }
        className="py-24"
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Bulk action bar */}
      {selectionCount > 0 && (
        <div className="flex items-center gap-2 border-b bg-accent/60 px-4 py-2">
          <span className="text-sm font-medium">
            {selectionCount} {selectionCount === 1 ? "entry" : "entries"} selected
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => handleBulkBillable(true)}
              disabled={bulkUpdate.isPending}
            >
              <DollarSign className="h-3 w-3" />
              Mark billable
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => handleBulkBillable(false)}
              disabled={bulkUpdate.isPending}
            >
              <DollarSign className="h-3 w-3 line-through opacity-50" />
              Non-billable
            </Button>
            {integrations.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleBulkPush}
                disabled={pushEntries.isPending}
              >
                <Upload className="h-3 w-3" />
                Push to integration
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={handleBulkDelete}
              disabled={bulkDelete.isPending}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear selection"
              onClick={clearSelection}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="divide-y divide-border-strong">
          {days.map(({ dateKey, label, groups, totalSeconds }) => (
            <EntryGroup
              key={dateKey}
              dateKey={dateKey}
              label={label}
              groups={groups}
              totalSeconds={totalSeconds}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
        {/* The list endpoint caps at ENTRY_LIST_LIMIT rows (newest first). Wide
            ranges like "All dates" can hit it, so say so rather than letting the
            oldest entries vanish silently. */}
        {entries.length >= ENTRY_LIST_LIMIT && (
          <p className="border-t px-4 py-3 text-center text-xs text-muted-foreground">
            Showing the {ENTRY_LIST_LIMIT} most recent entries. Narrow the date range to
            see older ones.
          </p>
        )}
      </ScrollArea>

      {/* Keyed by entry id so switching targets rebuilds the draft rather than
          leaving the previous entry's values in the fields. */}
      {editingEntry && (
        <EntryForm
          key={editingEntry.id}
          entry={editingEntry}
          open
          onClose={closeEntryEditor}
        />
      )}
    </div>
  );
}
