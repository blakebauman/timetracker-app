import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EntryRow } from "./EntryRow";
import { EntryDescriptionGroup } from "./EntryDescriptionGroup";
import { formatSeconds } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import type { DescriptionGroup } from "@/hooks/useEntries";

interface EntryGroupProps {
  label: string;
  groups: DescriptionGroup[];
  totalSeconds: number;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function EntryGroup({ label, groups, totalSeconds, selectedIds, onToggleSelect }: EntryGroupProps) {
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
        {groups.map((group) =>
          group.entries.length === 1 ? (
            <EntryRow
              key={group.key}
              entry={group.entries[0]}
              isSelected={selectedIds?.has(group.entries[0].id)}
              onToggleSelect={onToggleSelect}
            />
          ) : (
            <EntryDescriptionGroup
              key={group.key}
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
