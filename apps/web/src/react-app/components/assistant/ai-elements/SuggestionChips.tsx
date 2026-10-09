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
          // h-auto so a long suggestion wraps; min-h-8 and the coarse-pointer
          // pseudo-element keep it a real target under a thumb (it was 26px).
          className="relative h-auto min-h-8 rounded-full py-1.5 text-xs font-normal text-muted-foreground pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']"
          disabled={disabled}
          onClick={() => onSelect(s)}
        >
          {s}
        </Button>
      ))}
    </div>
  );
}
