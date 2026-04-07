import { useState, useCallback } from "react";
import { Trash2, X, DollarSign } from "lucide-react";
import { EntryGroup } from "./EntryGroup";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useGroupedEntries, useBulkDeleteEntries, useBulkUpdateEntries } from "@/hooks/useEntries";
import { useTimerStore } from "@/stores/timerStore";
import { Clock } from "lucide-react";

export function EntryList() {
  const { days, isLoading, error } = useGroupedEntries(30);
  const { runningEntry } = useTimerStore();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bulkDelete = useBulkDeleteEntries();
  const bulkUpdate = useBulkUpdateEntries();

  const onToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = () => {
    const ids = [...selectedIds];
    bulkDelete.mutate(ids, { onSuccess: clearSelection });
  };

  const handleBulkBillable = (billable: boolean) => {
    const ids = [...selectedIds];
    bulkUpdate.mutate({ ids, patch: { billable } }, { onSuccess: clearSelection });
  };

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
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Clock className="mb-4 h-12 w-12 text-muted-foreground/30" />
        <h3 className="font-semibold">No time entries yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Start the timer or add an entry manually
        </p>
      </div>
    );
  }

  const selectionCount = selectedIds.size;

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
              size="icon"
              className="h-7 w-7"
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
