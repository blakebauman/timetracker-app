import { useState } from "react";
import { Calendar, Download, FileText, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getDateRangePresets } from "@/lib/dateUtils";

interface DateRange {
  since: string;
  until: string;
  label: string;
}

export type ExportFormat = "csv" | "excel" | "print";

interface ReportHeaderProps {
  onExport?: (format: ExportFormat) => void;
  /** Extra actions rendered inline with the export control (e.g. AI summary). */
  actions?: React.ReactNode;
}

interface ReportRangeControlProps {
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
}

/*
 * The eight controls above this page's data used to sit in two rows split
 * across no discernible seam: the date range shared row one with Export and the
 * AI summary, while search, Filters, Rounding and Saved reports shared row two.
 * Scope was on both rows and presentation was mixed in with actions, so there
 * was nothing to learn from the arrangement and eight options to read.
 *
 * One job per row now. The header is what you DO with a report — export it, ask
 * for a summary, save the configuration. The query row below is what the report
 * IS — the range first, then search and filters, then how the numbers are
 * rendered. The range moves down because it belongs with the query, not because
 * it matters less; it is still the first control under the title.
 */
export function ReportRangeControl({ range, onRangeChange }: ReportRangeControlProps) {
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
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {range.label === "Custom range" && (
        // Was a pair of bare <input>s with a hand-rolled border and rounded-md,
        // which put square corners and no focus ring beside the pill controls
        // they sit next to. An input is a control, so it takes the control
        // radius (DESIGN.md §5) — and the shared component already knows that,
        // along with the focus ring and the disabled state the raw ones lacked.
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label="Start date"
            value={customSince}
            onChange={(e) => handleCustomSince(e.target.value)}
            className="h-8 w-auto px-3"
          />
          <span className="text-sm text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label="End date"
            value={customUntil}
            onChange={(e) => handleCustomUntil(e.target.value)}
            className="h-8 w-auto px-3"
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
    </div>
  );
}

export function ReportHeader({ onExport, actions }: ReportHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-xl font-semibold">Reports</h1>

      <div className="flex items-center gap-2 print:hidden">
        {onExport && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm" aria-label="Export">
                    <Download className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Export</TooltipContent>
            </Tooltip>
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
