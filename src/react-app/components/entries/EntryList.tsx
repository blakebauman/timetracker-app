import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Trash2, X, DollarSign, Upload, Clock } from "lucide-react";
import { EntryGroup } from "./EntryGroup";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useGroupedEntriesRange,
  useBulkDeleteEntries,
  useBulkUpdateEntries,
  useCreateEntry,
} from "@/hooks/useEntries";
import { useIntegrations, usePushEntries } from "@/hooks/useIntegrations";
import { useTimerStore } from "@/stores/timerStore";
import { toCreatePayload } from "@/lib/entryUtils";

interface EntryListProps {
  since: Date;
  until: Date;
}

// The day-grouped entry list body for a single period. Period navigation, the
// logged bar, and the add buttons live in the shared TimerWorkspace header — this
// component only renders the list + bulk actions for [since, until].
export function EntryList({ since, until }: EntryListProps) {
  const { days, entries, isLoading, error } = useGroupedEntriesRange(
    since.toISOString(),
    until.toISOString()
  );
  const { runningEntry } = useTimerStore();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bulkDelete = useBulkDeleteEntries();
  const bulkUpdate = useBulkUpdateEntries();
  const pushEntries = usePushEntries();
  const createEntry = useCreateEntry();
  const { data: integrations = [] } = useIntegrations();

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
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-destructive">Failed to load entries</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Check your connection and try again
        </p>
      </div>
    );
  }

  if (days.length === 0 && !runningEntry) {
    return (
      <EmptyState
        icon={Clock}
        title="No entries this week"
        description="Start the timer, add an entry, or navigate to another week"
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

      <ScrollArea className="flex-1">
        <div className="divide-y">
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
      </ScrollArea>
    </div>
  );
}
