import { Calendar, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDateRangePresets } from "@/lib/dateUtils";

interface DateRange {
  since: string;
  until: string;
  label: string;
}

interface ReportHeaderProps {
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  onExport?: () => void;
}

export function ReportHeader({
  range,
  onRangeChange,
  onExport,
}: ReportHeaderProps) {
  const presets = getDateRangePresets();

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">{range.label}</p>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Calendar className="h-4 w-4" />
              {range.label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {Object.entries(presets).map(([key, preset]) => (
              <DropdownMenuItem
                key={key}
                onClick={() =>
                  onRangeChange({
                    since: preset.since,
                    until: preset.until,
                    label: preset.label,
                  })
                }
              >
                {preset.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {onExport && (
          <Button variant="outline" size="sm" onClick={onExport} className="gap-1.5">
            <Download className="h-4 w-4" />
            Export
          </Button>
        )}
      </div>
    </div>
  );
}
