import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ColorDot } from "@/components/ColorDot";
import { useEntrySuggestions } from "@/hooks/useEntries";
import type { EntrySuggestion } from "@shared/schemas";

interface ResumeLastButtonProps {
  onResume: (suggestion: EntrySuggestion) => void;
}

/**
 * Pick up the last thing you tracked, from the timer bar.
 *
 * The entry list already has a per-row Continue, but the Timer workspace has
 * five views and three of them — calendar, timesheet, planner — put no entry row
 * on screen at all, so "start again on what I was just doing", which is what a
 * consultant does at the top of the morning, had no affordance there.
 *
 * The data is free: `useEntrySuggestions` is already fetched by the description
 * autocomplete in the same bar and the server returns it `ORDER BY last_used
 * DESC`, so `[0]` is the most recently tracked description carrying the
 * project/task/billable combo it's usually logged against plus its newest tags.
 * That's a better thing to resume than the literal last row, which might be a
 * one-off correction.
 *
 * Deliberately not auto-filling the bar with it: a pre-filled description the
 * user doesn't notice gets time logged against the wrong thing, which is worse
 * than a blank bar. The glyph is `RotateCcw`, not the `Play` the entry row uses,
 * because a second play triangle beside the Start disc reads as a second start
 * button — but the verb stays "Continue" so the two surfaces say the same word.
 */
export function ResumeLastButton({ onResume }: ResumeLastButtonProps) {
  const { data: suggestions = [] } = useEntrySuggestions();
  const last = suggestions[0];
  if (!last) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="tt-touch shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => onResume(last)}
          // The tooltip is decoration for a mouse; this is what a screen reader
          // and a keyboard user get, so it names the actual entry rather than
          // leaving a bare "Continue" that could mean anything.
          aria-label={`Continue "${last.description}"${
            last.projectName ? ` on ${last.projectName}` : ""
          }`}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex max-w-64 items-center gap-1.5">
        <span className="shrink-0">Continue</span>
        {last.projectColor && <ColorDot color={last.projectColor} />}
        <span className="truncate font-medium">{last.description}</span>
      </TooltipContent>
    </Tooltip>
  );
}
