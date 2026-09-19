import { Button } from "@/components/ui/button";

/**
 * Horizontal row of tappable prompt suggestions (fold.run ai-elements/suggestion,
 * trimmed to our Button + theme). Shown on an empty conversation to prime the assistant.
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
    <div className="flex flex-wrap gap-2">
      {suggestions.map((s) => (
        <Button
          key={s}
          variant="outline"
          size="sm"
          className="h-auto rounded-full py-1 text-xs font-normal text-muted-foreground"
          disabled={disabled}
          onClick={() => onSelect(s)}
        >
          {s}
        </Button>
      ))}
    </div>
  );
}
