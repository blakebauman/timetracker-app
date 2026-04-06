import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EntryRow } from "./EntryRow";
import { formatSeconds } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import type { TimeEntry } from "@shared/schemas";

interface EntryGroupProps {
  label: string;
  entries: TimeEntry[];
  totalSeconds: number;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function EntryGroup({ label, entries, totalSeconds, selectedIds, onToggleSelect }: EntryGroupProps) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-2">
      {/* Day header — acts as collapse trigger */}
      <CollapsibleTrigger className="flex w-full items-center justify-between bg-muted/50 px-4 py-1.5 hover:bg-muted/70 transition-colors">
        <div className="flex items-center gap-2">
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
              !open && "-rotate-90"
            )}
          />
          <span className="text-sm font-semibold">{label}</span>
        </div>
        <span className="font-mono text-sm text-muted-foreground">
          {formatSeconds(totalSeconds)}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {entries.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            isSelected={selectedIds?.has(entry.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
