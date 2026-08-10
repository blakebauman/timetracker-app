import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LIST_RANGE_LABELS,
  LIST_RANGE_GROUPS,
  type ListRangeKey,
} from "@/lib/dateUtils";
import { format } from "date-fns";

interface ListRangePickerProps {
  value: ListRangeKey;
  customSince: string | null;
  customUntil: string | null;
  onChange: (key: ListRangeKey, since?: string | null, until?: string | null) => void;
}

// Date-scope selector for the Timer list view. Presets resolve against "now" on
// read; the custom range holds two bare "YYYY-MM-DD" inputs. Mirrors the Reports
// header picker so the two ranges feel like one control in two places.
export function ListRangePicker({
  value,
  customSince,
  customUntil,
  onChange,
}: ListRangePickerProps) {
  const [open, setOpen] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");

  const selectPreset = (key: ListRangeKey) => {
    onChange(key);
    setOpen(false);
  };

  // Committing one side of the custom range keeps the other side as-is, falling
  // back to today so a half-filled range still resolves to a real window.
  const setCustom = (side: "since" | "until", v: string) => {
    const since = side === "since" ? v : (customSince ?? today);
    const until = side === "until" ? v : (customUntil ?? today);
    onChange("custom", since, until);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" aria-label="Date range">
          {LIST_RANGE_LABELS[value]}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {LIST_RANGE_GROUPS.map((group, i) => (
          <div key={group.label}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.keys.map((key) => (
              <DropdownMenuItem key={key} onSelect={() => selectPreset(key)}>
                {LIST_RANGE_LABELS[key]}
                {value === key && <Check className="ml-auto h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
          </div>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2 text-xs font-medium">
          Custom range
          {value === "custom" && <Check className="ml-auto h-3.5 w-3.5" />}
        </DropdownMenuLabel>
        {/* Kept inside the menu but non-dismissing: picking a date shouldn't
            close the popover before the second date is chosen. */}
        <div
          className="space-y-1.5 px-2 pb-2"
          onKeyDown={(e) => e.stopPropagation()}
        >
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-8">From</span>
            <input
              type="date"
              max={today}
              value={customSince ?? ""}
              onChange={(e) => setCustom("since", e.target.value)}
              className="h-7 flex-1 rounded-md border bg-background px-2 text-xs text-foreground"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-8">To</span>
            <input
              type="date"
              max={today}
              value={customUntil ?? ""}
              onChange={(e) => setCustom("until", e.target.value)}
              className="h-7 flex-1 rounded-md border bg-background px-2 text-xs text-foreground"
            />
          </label>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
