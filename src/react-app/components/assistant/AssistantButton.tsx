import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssistantStore } from "@/stores/assistantStore";
import { useAssistantNudges } from "@/hooks/useAssistant";

/**
 * The always-visible entry point to Aski, mounted in the timer bar. The badge
 * count is a live indicator (like the running-timer pulse), which is what the
 * brand red is reserved for.
 */
export function AssistantButton() {
  const toggleOpen = useAssistantStore((s) => s.toggleOpen);
  const { nudges } = useAssistantNudges();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative text-muted-foreground"
          onClick={toggleOpen}
          aria-label={
            nudges.length > 0
              ? `Open AI Assistant — ${nudges.length} ${nudges.length === 1 ? "nudge" : "nudges"}`
              : "Open AI Assistant"
          }
        >
          <Sparkles className="h-4 w-4" />
          {nudges.length > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground"
            >
              {nudges.length > 9 ? "9+" : nudges.length}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>AI Assistant — your tracking helper</TooltipContent>
    </Tooltip>
  );
}
