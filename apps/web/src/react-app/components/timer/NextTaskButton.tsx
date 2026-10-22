import { useMemo } from "react";
import { ListStart } from "lucide-react";
import type { Task } from "@timetracker/core/schemas";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ColorDot } from "@/components/ColorDot";
import { useAllTasks } from "@/hooks/useTasks";
import { useDayRollover } from "@/hooks/useDayRollover";
import { useUIStore } from "@/stores/uiStore";
import { formatMinute } from "@/lib/taskUtils";
import { pickNextTask } from "@/lib/planState";

interface NextTaskButtonProps {
  onStart: (task: Task) => void;
}

/**
 * Start the next planned task, from the idle timer strip.
 *
 * Its glyph is ListStart, not the ListChecks that means "the plan" on the
 * rail, the column and the plan sheet: this one starts something.
 *
 * Beside Continue and drawn the same way — an icon, with the task in the
 * tooltip and the accessible name — so the strip keeps its shape at every
 * width and the red disc stays the one lit control. Continue answers "what
 * was I doing"; this answers "what did I mean to do next". Absent when the
 * plan has nothing for today: an empty slot is better than a guess.
 */
export function NextTaskButton({ onStart }: NextTaskButtonProps) {
  const { data: tasks } = useAllTasks();
  const today = useDayRollover();
  const timeFormat = useUIStore((s) => s.timeFormat);
  // Re-picked when the list or the day changes; a block ending mid-idle is
  // re-evaluated on the next task refetch or hover, which is soon enough for
  // a suggestion.
  const next = useMemo(() => (tasks ? pickNextTask(tasks, today) : null), [tasks, today]);
  if (!next) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => onStart(next)}
          aria-label={`Start next task "${next.name}"${next.projectName ? ` on ${next.projectName}` : ""}`}
        >
          <ListStart className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex max-w-64 items-center gap-1.5">
        <span className="shrink-0">Next up</span>
        {next.projectColor && <ColorDot color={next.projectColor} />}
        <span className="truncate font-medium">{next.name}</span>
        {next.scheduledMinute !== null && next.dueDate === today && (
          <span className="shrink-0 font-mono tabular-nums opacity-60">
            {formatMinute(next.scheduledMinute, timeFormat)}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
