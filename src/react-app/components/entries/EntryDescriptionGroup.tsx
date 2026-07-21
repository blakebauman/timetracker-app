import { useState } from "react";
import { ChevronRight, Play, Trash2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EntryRow } from "./EntryRow";
import { AssignProjectChip } from "./ProjectPicker";
import { formatDurationShort } from "@/lib/dateUtils";
import { useTimer } from "@/hooks/useTimer";
import { useBulkDeleteEntries, useBulkUpdateEntries } from "@/hooks/useEntries";
import { cn } from "@/lib/utils";
import { ColorDot } from "@/components/ColorDot";
import { ProjectBadge } from "@/components/ProjectBadge";
import type { DescriptionGroup } from "@/hooks/useEntries";

interface EntryDescriptionGroupProps {
  group: DescriptionGroup;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function EntryDescriptionGroup({
  group,
  selectedIds,
  onToggleSelect,
}: EntryDescriptionGroupProps) {
  const [open, setOpen] = useState(false);
  const { startTimer } = useTimer();
  const bulkDelete = useBulkDeleteEntries();
  const bulkUpdate = useBulkUpdateEntries();

  const allSelected = group.entries.every((e) => selectedIds?.has(e.id));
  const someSelected = group.entries.some((e) => selectedIds?.has(e.id));

  const handleGroupSelect = () => {
    if (!onToggleSelect) return;
    // If all selected → deselect all; otherwise select all
    for (const e of group.entries) {
      const isSelected = selectedIds?.has(e.id) ?? false;
      if (allSelected ? isSelected : !isSelected) {
        onToggleSelect(e.id);
      }
    }
  };

  const handleContinue = () => {
    startTimer({
      description: group.description,
      projectId: group.projectId,
      billable: group.billable,
    });
  };

  const handleDeleteAll = () => {
    bulkDelete.mutate(group.entries.map((e) => e.id));
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "group flex animate-fade-up items-center gap-3 border-b border-border-strong px-4 py-2.5 transition-colors hover:bg-accent/40",
          someSelected && "bg-accent/60"
        )}
      >
        {/* Checkbox */}
        {onToggleSelect && (
          <button
            type="button"
            role="checkbox"
            aria-checked={allSelected ? true : someSelected ? "mixed" : false}
            aria-label="Select all entries in group"
            onClick={handleGroupSelect}
            className={cn(
              // Matches EntryRow: the 16x16 box fails WCAG 2.2 AA's 24px floor
              // (SC 2.5.8), so ::before expands the hit target to 28x28 without
              // changing the checkbox's visual weight.
              "relative flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors before:absolute before:-inset-1.5 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              allSelected
                ? "border-primary bg-primary text-primary-foreground"
                : someSelected
                ? "border-primary bg-primary/40"
                : "border-muted-foreground/40 tt-reveal hover:border-primary"
            )}
          >
            {(allSelected || someSelected) && (
              <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
                <path
                  d={allSelected ? "M2 5l2.5 2.5L8 3" : "M2 5h6"}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        )}

        {/* Project color dot */}
        <ColorDot color={group.projectColor} className="h-3 w-3" />

        {/* Description + project */}
        <CollapsibleTrigger className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <ChevronRight
              className={cn(
                "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150",
                open && "rotate-90"
              )}
            />
            <span className="text-sm">
              {group.description || (
                <span className="italic text-muted-foreground">No description</span>
              )}
            </span>
          </div>
          {group.projectName && (
            <div className="mt-0.5 pl-4">
              <ProjectBadge name={group.projectName} color={group.projectColor} />
            </div>
          )}
        </CollapsibleTrigger>

        {/* Sibling of the trigger (a button can't nest inside a button):
            assigns the project to every entry in the group at once. */}
        {!group.projectId && (
          <AssignProjectChip
            ariaLabel={`Assign project to all ${group.entries.length} entries`}
            onAssign={(projectId) =>
              bulkUpdate.mutate({
                ids: group.entries.map((e) => e.id),
                patch: { projectId },
              })
            }
          />
        )}

        {/* Billable indicator */}
        {group.billable && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[11px] font-semibold text-primary-ink">
                <span aria-hidden>$</span>
                <span className="sr-only">Billable</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>Billable</TooltipContent>
          </Tooltip>
        )}

        {/* Count badge */}
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
          {group.entries.length}×
        </span>

        {/* Total duration */}
        <span className="min-w-16 text-right font-mono text-sm tabular-nums">
          {formatDurationShort(group.totalSeconds)}
        </span>

        {/* Actions */}
        <div className="tt-reveal flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Continue timing this entry"
                onClick={handleContinue}
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Continue</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Entry group actions">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleContinue}>
                <Play className="mr-2 h-3.5 w-3.5" />
                Continue
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={handleDeleteAll}
                disabled={bulkDelete.isPending}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete all ({group.entries.length})
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <CollapsibleContent>
        <div className="border-l ml-7 border-muted">
          {group.entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              isSelected={selectedIds?.has(entry.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
