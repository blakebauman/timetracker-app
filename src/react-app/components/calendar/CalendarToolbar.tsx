import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarViewType } from "./CalendarView";

interface CalendarToolbarProps {
  title: string;
  view: CalendarViewType;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarViewType) => void;
  onAdd: () => void;
}

const VIEWS: { value: CalendarViewType; label: string }[] = [
  { value: "timeGridWeek", label: "Week" },
  { value: "timeGridDay", label: "Day" },
];

export function CalendarToolbar({
  title,
  view,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onAdd,
}: CalendarToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onPrev}
            aria-label="Previous period"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onNext}
            aria-label="Next period"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="h-8" onClick={onToday}>
          Today
        </Button>
        <h2 className="ml-1 text-base font-semibold tracking-tight">{title}</h2>
      </div>

      <div className="flex items-center gap-2">
        {/* Segmented view toggle */}
        <div className="inline-flex items-center rounded-md border bg-muted/40 p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => onViewChange(v.value)}
              className={cn(
                "rounded px-3 py-1 text-sm font-medium transition-colors",
                view === v.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <Button size="sm" className="h-8 gap-1.5" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add entry
        </Button>
      </div>
    </div>
  );
}
