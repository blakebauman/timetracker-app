import { useState } from "react";
import { Calendar, Download, FileText, FileSpreadsheet, Printer } from "lucide-react";
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

export type ExportFormat = "csv" | "excel" | "print";

interface ReportHeaderProps {
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  onExport?: (format: ExportFormat) => void;
  /** Extra actions rendered inline with the date/export controls (e.g. AI summary). */
  actions?: React.ReactNode;
}

export function ReportHeader({
  range,
  onRangeChange,
  onExport,
  actions,
}: ReportHeaderProps) {
  const presets = getDateRangePresets();
  const [customSince, setCustomSince] = useState("");
  const [customUntil, setCustomUntil] = useState("");

  const handleCustomSince = (value: string) => {
    setCustomSince(value);
    if (value && customUntil) {
      onRangeChange({ since: value, until: customUntil, label: "Custom range" });
    }
  };

  const handleCustomUntil = (value: string) => {
    setCustomUntil(value);
    if (customSince && value) {
      onRangeChange({ since: customSince, until: value, label: "Custom range" });
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">{range.label}</p>
      </div>

      <div className="flex items-center gap-2 print:hidden">
        {range.label === "Custom range" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              aria-label="Start date"
              value={customSince}
              onChange={(e) => handleCustomSince(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm bg-background"
            />
            <span className="text-sm text-muted-foreground">–</span>
            <input
              type="date"
              aria-label="End date"
              value={customUntil}
              onChange={(e) => handleCustomUntil(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm bg-background"
            />
          </div>
        )}

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
            <DropdownMenuItem
              onClick={() => {
                setCustomSince("");
                setCustomUntil("");
                onRangeChange({ since: "", until: "", label: "Custom range" });
              }}
            >
              Custom range
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {onExport && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExport("csv")}>
                <FileText className="h-4 w-4" />
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("excel")}>
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("print")}>
                <Printer className="h-4 w-4" />
                Print / PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {actions}
      </div>
    </div>
  );
}
