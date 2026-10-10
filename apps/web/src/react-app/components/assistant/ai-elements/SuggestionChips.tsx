import { Button } from "@/components/ui/button";

/**
 * Horizontal row of tappable prompt suggestions (fold.run ai-elements/suggestion,
 * trimmed to our Button + theme). Shown on an empty conversation to prime the Assistant.
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
          // h-auto so a long suggestion wraps; min-h-8 keeps it a real target,
          // and the sm size's coarse-pointer hit area takes it to 44px under a
          // thumb (it was 26px).
          className="h-auto min-h-8 rounded-full py-1.5 text-xs font-normal text-muted-foreground"
          disabled={disabled}
          onClick={() => onSelect(s)}
        >
          {s}
        </Button>
      ))}
    </div>
  );
}
