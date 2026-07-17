import { useState } from "react";
import { X, Tag, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useTags, useUpdateTag } from "@/hooks/useProjects";
import { PROJECT_COLORS, PROJECT_COLOR_NAMES } from "@/lib/colorUtils";

interface TagPickerProps {
  value: string[];
  onChange: (tags: string[]) => void;
  className?: string;
}

export function TagPicker({ value, onChange, className }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  // Tag name currently being recolored via the inline swatch row, if any.
  const [recoloring, setRecoloring] = useState<string | null>(null);
  const { data: allTags = [] } = useTags();
  const updateTag = useUpdateTag();

  const byName = new Map(allTags.map((t) => [t.name, t]));
  const colorOf = (name: string) => byName.get(name)?.color ?? "#64748b";

  const query = input.trim();
  const suggestions = allTags
    .map((t) => t.name)
    .filter(
      (name) =>
        name.toLowerCase().includes(query.toLowerCase()) && !value.includes(name)
    );
  const canCreate = query.length > 0 && !suggestions.some((s) => s === query);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !input && value.length) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 gap-1.5 px-2 text-sm text-muted-foreground",
            value.length > 0 && "text-foreground",
            className
          )}
        >
          <Tag className="h-3.5 w-3.5" />
          {value.length > 0 ? (
            <span>
              {value.length} tag{value.length > 1 ? "s" : ""}
            </span>
          ) : (
            <span>Tags</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        {value.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b p-2">
            {value.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="gap-1 text-xs font-normal"
              >
                {/* Recolor is only possible once the tag exists server-side (it's
                    created when the entry saves); before that, show a static dot. */}
                {byName.has(tag) ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Recolor ${tag}`}
                        onClick={() => setRecoloring((cur) => (cur === tag ? null : tag))}
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-offset-1 transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        style={{ backgroundColor: colorOf(tag) }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>Change color</TooltipContent>
                  </Tooltip>
                ) : (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colorOf(tag) }}
                  />
                )}
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove ${tag}`}
                  className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Inline recolor palette for the tag whose dot was clicked. */}
        {recoloring && byName.has(recoloring) && (
          <div className="flex flex-wrap gap-1.5 border-b p-2">
            {PROJECT_COLORS.map((c) => (
              <Tooltip key={c}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Set ${recoloring} to ${PROJECT_COLOR_NAMES[c] ?? c}`}
                    onClick={() => {
                      const t = byName.get(recoloring);
                      if (t) updateTag.mutate({ id: t.id, color: c });
                      setRecoloring(null);
                    }}
                    className={cn(
                      "h-5 w-5 rounded-full ring-2 ring-offset-1 transition-transform hover:scale-110",
                      colorOf(recoloring) === c ? "ring-foreground" : "ring-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                </TooltipTrigger>
                <TooltipContent>{PROJECT_COLOR_NAMES[c] ?? c}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
        <Command shouldFilter={false}>
          <CommandInput
            value={input}
            onValueChange={setInput}
            onKeyDown={handleKeyDown}
            placeholder="Add a tag..."
            className="h-9"
          />
          <CommandList>
            {!suggestions.length && !canCreate && (
              <CommandEmpty>No tags found</CommandEmpty>
            )}
            {suggestions.length > 0 && (
              <CommandGroup>
                {suggestions.slice(0, 8).map((tag) => (
                  <CommandItem key={tag} value={tag} onSelect={() => addTag(tag)}>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorOf(tag) }}
                    />
                    {tag}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {canCreate && (
              <CommandGroup>
                <CommandItem
                  value={`create-${query}`}
                  onSelect={() => addTag(query)}
                  className="text-primary"
                >
                  <Plus className="h-3 w-3" />
                  Create "{query}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
