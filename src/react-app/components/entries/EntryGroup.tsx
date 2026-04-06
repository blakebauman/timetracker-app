import { EntryRow } from "./EntryRow";
import { formatSeconds } from "@/lib/dateUtils";
import type { TimeEntry } from "@shared/schemas";

interface EntryGroupProps {
  label: string;
  entries: TimeEntry[];
  totalSeconds: number;
}

export function EntryGroup({ label, entries, totalSeconds }: EntryGroupProps) {
  return (
    <div className="mb-2">
      {/* Day header */}
      <div className="flex items-center justify-between bg-muted/50 px-4 py-1.5">
        <span className="text-sm font-semibold">{label}</span>
        <span className="font-mono text-sm text-muted-foreground">
          {formatSeconds(totalSeconds)}
        </span>
      </div>

      {/* Entries */}
      {entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
