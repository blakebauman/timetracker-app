import { EntryGroup } from "./EntryGroup";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGroupedEntries } from "@/hooks/useEntries";
import { useTimerStore } from "@/stores/timerStore";
import { Clock } from "lucide-react";

export function EntryList() {
  const { days, isLoading, error } = useGroupedEntries(30);
  const { runningEntry } = useTimerStore();

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

  return (
    <ScrollArea className="h-full">
      <div className="divide-y">
        {days.map(({ dateKey, label, entries, totalSeconds }) => (
          <EntryGroup
            key={dateKey}
            label={label}
            entries={entries}
            totalSeconds={totalSeconds}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
