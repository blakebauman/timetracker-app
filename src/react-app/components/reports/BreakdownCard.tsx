import { PieChart, Pie, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Inbox } from "lucide-react";
import { formatDurationShort } from "@/lib/dateUtils";
import { formatCurrency } from "@/lib/currency";
import { EmptyState } from "@/components/ui/empty-state";
import { ColorDot } from "@/components/ColorDot";
import { useUIStore } from "@/stores/uiStore";
import type { BreakdownRow } from "@/hooks/useReports";

// Palette for dimensions whose rows have no intrinsic color (client/task/tag).
const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

interface BreakdownCardProps {
  title: string;
  rows: BreakdownRow[];
  totalSeconds: number;
  showAmount?: boolean;
  header?: React.ReactNode;
}

const EMPTY_DONUT = [{ name: "No data", value: 1 }];

const chartConfig = {
  totalSeconds: { label: "Time" },
} satisfies ChartConfig;

export function BreakdownCard({
  title,
  rows,
  totalSeconds,
  showAmount = false,
  header,
}: BreakdownCardProps) {
  const currency = useUIStore((s) => s.currency);
  const sorted = [...rows].sort((a, b) => b.totalSeconds - a.totalSeconds);
  const isEmpty = totalSeconds === 0;
  const colorFor = (row: BreakdownRow, i: number) =>
    row.color ?? PALETTE[i % PALETTE.length];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {header}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:flex-row md:items-start">
        {/* Donut chart */}
        <div className="shrink-0">
          <ChartContainer config={chartConfig} className="aspect-square h-40 w-40">
            <PieChart>
              {isEmpty ? (
                <Pie
                  data={EMPTY_DONUT}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={70}
                  dataKey="value"
                  stroke="none"
                >
                  <Cell fill="var(--muted)" />
                </Pie>
              ) : (
                <Pie
                  data={sorted}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={70}
                  dataKey="totalSeconds"
                  nameKey="name"
                  stroke="none"
                >
                  {sorted.map((row, i) => (
                    <Cell key={row.id ?? i} fill={colorFor(row, i)} />
                  ))}
                </Pie>
              )}
              {!isEmpty && (
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name) => (
                        <>
                          <span className="text-muted-foreground">{name}</span>
                          <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
                            {formatDurationShort(Number(value))}
                          </span>
                        </>
                      )}
                    />
                  }
                />
              )}
            </PieChart>
          </ChartContainer>
        </div>

        {/* Row table */}
        <div className="flex-1 space-y-1.5">
          {isEmpty ? (
            <EmptyState
              icon={Inbox}
              title="No tracked time"
              description="Nothing recorded for this period yet."
              className="h-full py-8"
            />
          ) : (
            <>
              {sorted.map((row, i) => {
                const pct = totalSeconds
                  ? Math.round((row.totalSeconds / totalSeconds) * 100)
                  : 0;
                return (
                  <div key={row.id ?? `none-${i}`} className="flex items-start gap-2">
                    <ColorDot color={colorFor(row, i)} className="mt-1" />
                    {/* Long project names wrap to new lines instead of overflowing
                        the card; the metrics stay pinned top-right. */}
                    <span className="min-w-0 flex-1 wrap-anywhere text-sm">
                      {row.name}
                    </span>
                    {showAmount && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatCurrency(row.billableAmount, currency)}
                      </span>
                    )}
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {pct}%
                    </span>
                    <span className="min-w-12 shrink-0 text-right text-sm font-medium tabular-nums">
                      {formatDurationShort(row.totalSeconds)}
                    </span>
                  </div>
                );
              })}

              {/* Total row */}
              <div className="mt-2 flex items-start gap-2 border-t pt-2">
                <span className="mt-1 h-2.5 w-2.5 shrink-0" />
                <span className="min-w-0 flex-1 text-sm font-medium">Total</span>
                {showAmount && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatCurrency(
                      sorted.reduce((s, r) => s + r.billableAmount, 0),
                      currency
                    )}
                  </span>
                )}
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  100%
                </span>
                <span className="min-w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {formatDurationShort(totalSeconds)}
                </span>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
