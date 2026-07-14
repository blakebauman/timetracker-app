import { useState } from "react";
import { X, Tag, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useTags } from "@/hooks/useProjects";

interface TagPickerProps {
  value: string[];
  onChange: (tags: string[]) => void;
  className?: string;
}

export function TagPicker({ value, onChange, className }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { data: allTags = [] } = useTags();

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
                    <Tag className="h-3 w-3 text-muted-foreground" />
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
