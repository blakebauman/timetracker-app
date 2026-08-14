import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EntryRow } from "./EntryRow";
import { EntryDescriptionGroup } from "./EntryDescriptionGroup";
import { formatDurationShort, localDayKey } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { useTimerStore } from "@/stores/timerStore";
import type { DescriptionGroup } from "@/hooks/useEntries";

// The day total, kept live for the day the running timer belongs to. The store
// selector returns a stable 0 for every other day, so only this span — for the
// running day — re-renders each tick; EntryGroup and its rows never re-render.
// `dateKey` matches groupEntriesByDay's `localDayKey(start)` bucketing.
function DayTotal({ dateKey, totalSeconds }: { dateKey: string; totalSeconds: number }) {
  const liveExtra = useTimerStore((s) =>
    s.runningEntry && localDayKey(s.runningEntry.start) === dateKey ? s.elapsed : 0
  );
  return (
    <span className="font-mono text-sm text-muted-foreground">
      {formatDurationShort(totalSeconds + liveExtra)}
    </span>
  );
}

interface EntryGroupProps {
  dateKey: string;
  label: string;
  groups: DescriptionGroup[];
  totalSeconds: number;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function EntryGroup({ dateKey, label, groups, totalSeconds, selectedIds, onToggleSelect }: EntryGroupProps) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-2">
      {/* Day header — acts as collapse trigger */}
      <CollapsibleTrigger className="flex w-full items-center justify-between bg-muted/50 px-4 py-1.5 hover:bg-muted/70 transition-colors">
        <div className="flex items-center gap-2">
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-fast ease-out-quart",
              !open && "-rotate-90"
            )}
          />
          <span className="text-sm font-semibold">{label}</span>
        </div>
        <DayTotal dateKey={dateKey} totalSeconds={totalSeconds} />
      </CollapsibleTrigger>

      <CollapsibleContent>
        {/* Keyed by `anchorId`, never `key` — see DescriptionGroup.anchorId.
            `key` is built from the description and project the row edits inline,
            so keying by it made every rename look like a delete-and-recreate. */}
        {groups.map((group) =>
          group.entries.length === 1 ? (
            <EntryRow
              key={group.anchorId}
              entry={group.entries[0]}
              isSelected={selectedIds?.has(group.entries[0].id)}
              onToggleSelect={onToggleSelect}
            />
          ) : (
            <EntryDescriptionGroup
              key={group.anchorId}
              group={group}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
            />
          )
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
