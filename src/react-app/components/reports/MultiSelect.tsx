import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { ColorDot } from "@/components/ColorDot";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  color?: string;
}

interface MultiSelectProps {
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}

/**
 * Generic multi-select combobox (Popover + Command) with removable badge
 * chips. Used by the reports filter bar for clients / projects / tasks / tags.
 */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  const selectedOptions = value
    .map((v) => options.find((o) => o.value === v))
    .filter((o): o is MultiSelectOption => Boolean(o));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-sm",
            value.length === 0 && "text-muted-foreground",
            className
          )}
        >
          <span>{label}</span>
          {value.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-0.5 h-5 min-w-5 justify-center px-1 tabular-nums"
            >
              {value.length}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        {selectedOptions.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b p-2">
            {selectedOptions.map((o) => (
              <Badge
                key={o.value}
                variant="secondary"
                className="gap-1 text-xs font-normal"
              >
                {o.color && <ColorDot color={o.color} />}
                <span className="max-w-32 truncate">{o.label}</span>
                <button
                  type="button"
                  onClick={() => toggle(o.value)}
                  aria-label={`Remove ${o.label}`}
                  className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}...`} className="h-9" />
          <CommandList>
            <CommandEmpty>No {label.toLowerCase()} found</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  keywords={[o.label]}
                  onSelect={() => toggle(o.value)}
                >
                  {o.color && <ColorDot color={o.color} />}
                  <span className="truncate">{o.label}</span>
                  {value.includes(o.value) && (
                    <Check className="ml-auto h-3.5 w-3.5 shrink-0" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
