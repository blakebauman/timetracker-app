import { useState, useRef } from "react";
import { X, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: allTags = [] } = useTags();

  const suggestions = allTags
    .map((t) => t.name)
    .filter(
      (name) =>
        name.toLowerCase().includes(input.toLowerCase()) &&
        !value.includes(name)
    );

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
    if (e.key === "Enter" && input) {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && value.length) {
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
            <span>{value.length} tag{value.length > 1 ? "s" : ""}</span>
          ) : (
            <span>Tags</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        {/* Selected tags */}
        {value.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {value.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="gap-1 text-xs font-normal"
              >
                {tag}
                <button onClick={() => removeTag(tag)}>
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Input */}
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a tag..."
          className="h-7 text-sm"
          autoFocus
        />

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {suggestions.slice(0, 8).map((tag) => (
              <button
                key={tag}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
                onClick={() => addTag(tag)}
              >
                <Tag className="h-3 w-3 text-muted-foreground" />
                {tag}
              </button>
            ))}
          </div>
        )}

        {input && !suggestions.find((s) => s === input) && (
          <button
            className="mt-1 flex w-full items-center gap-2 rounded px-2 py-1 text-sm text-primary hover:bg-accent"
            onClick={() => addTag(input)}
          >
            <Tag className="h-3 w-3" />
            Create "{input}"
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
