import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorDot } from "@/components/ColorDot";
import { cn } from "@/lib/utils";
import { formatDurationShort } from "@/lib/dateUtils";
import { formatCurrency } from "@/lib/currency";
import { useUIStore } from "@/stores/uiStore";
import type { GroupedReport, GroupRow } from "@/hooks/useReports";

interface SummaryTreeProps {
  data: GroupedReport;
  showAmount?: boolean;
  header?: React.ReactNode;
}

export function SummaryTree({ data, showAmount = true, header }: SummaryTreeProps) {
  const currency = useUIStore((s) => s.currency);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const hasSub = data.subGroup !== "none";
  const total = data.totalSeconds || 0;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pct = (secs: number) => (total ? Math.round((secs / total) * 100) : 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Grouped</CardTitle>
        {header}
      </CardHeader>
      <CardContent>
        {data.groups.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No tracked time for this period
          </div>
        ) : (
          <div className="divide-y">
            {data.groups.map((g, i) => {
              const key = g.id ?? `none-${i}`;
              const open = expanded.has(key);
              return (
                <div key={key}>
                  <button
                    type="button"
                    disabled={!hasSub || !g.subGroups?.length}
                    onClick={() => toggle(key)}
                    className={cn(
                      "flex w-full items-center gap-2 py-2 text-left",
                      hasSub && g.subGroups?.length && "cursor-pointer"
                    )}
                  >
                    {hasSub ? (
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-fast ease-out-quart",
                          open && "rotate-90",
                          !g.subGroups?.length && "opacity-0"
                        )}
                      />
                    ) : (
                      <ColorDot color={g.color} />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {g.name}
                    </span>
                    {showAmount && (
                      <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                        {formatCurrency(g.billableAmount, currency)}
                      </span>
                    )}
                    <span className="w-16 text-right text-sm font-semibold tabular-nums">
                      {formatDurationShort(g.totalSeconds)}
                    </span>
                    {/* Share of TIME — kept next to the duration it describes,
                        not next to the amount it doesn't. */}
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {pct(g.totalSeconds)}%
                    </span>
                  </button>

                  {hasSub && open && (
                    <div className="pb-1.5">
                      {g.subGroups!.map((s: GroupRow, j) => (
                        <div
                          key={s.id ?? `sub-${j}`}
                          className="flex items-center gap-2 py-1.5 pl-9 pr-0"
                        >
                          <ColorDot color={s.color} />
                          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                            {s.name}
                          </span>
                          {showAmount && (
                            <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                              {formatCurrency(s.billableAmount, currency)}
                            </span>
                          )}
                          <span className="w-16 text-right text-sm tabular-nums">
                            {formatDurationShort(s.totalSeconds)}
                          </span>
                          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                            {pct(s.totalSeconds)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Total */}
            <div className="flex items-center gap-2 py-2">
              <span className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">Total</span>
              {showAmount && (
                <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(data.billableAmount, currency)}
                </span>
              )}
              <span className="w-16 text-right text-sm font-semibold tabular-nums">
                {formatDurationShort(data.totalSeconds)}
              </span>
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                100%
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
