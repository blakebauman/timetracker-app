import { Button } from "@/components/ui/button";

/**
 * AI Elements' Suggestion: a prompt you send without typing. One row above the
 * composer that scrolls sideways when it doesn't fit — `scroll-fade-x` fades the
 * edge with more to show, `shrink-0` keeps each label on one line — so the
 * suggestions sit where the answer to "what can I ask?" is needed, at the field.
 */
export function SuggestionChips({
  suggestions,
  onSelect,
  disabled,
}: {
  suggestions: string[];
  onSelect: (s: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Suggestions"
      // The negative inline margin lets the row bleed to the sheet's edge, so
      // the fade reads as "more this way" rather than a clipped chip.
      className="-mx-3 flex scroll-fade-x gap-2 overflow-x-auto overscroll-x-contain px-3"
    >
      {suggestions.map((s) => (
        <Button
          key={s}
          variant="outline"
          size="sm"
          className="shrink-0 font-normal text-muted-foreground hover:text-foreground"
          disabled={disabled}
          onClick={() => onSelect(s)}
        >
          {s}
        </Button>
      ))}
    </div>
  );
}
