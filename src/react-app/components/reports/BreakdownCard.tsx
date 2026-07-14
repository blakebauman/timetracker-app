import { PieChart, Pie, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDurationShort } from "@/lib/dateUtils";
import { formatCurrency } from "@/lib/currency";
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
            <div className="flex h-full items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                No tracked time for this period
              </p>
            </div>
          ) : (
            <>
              {sorted.map((row, i) => {
                const pct = totalSeconds
                  ? Math.round((row.totalSeconds / totalSeconds) * 100)
                  : 0;
                return (
                  <div key={row.id ?? `none-${i}`} className="flex items-center gap-2">
                    <ColorDot color={colorFor(row, i)} />
                    <span className="min-w-0 flex-1 shrink-0 truncate text-sm">
                      {row.name}
                    </span>
                    {showAmount && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatCurrency(row.billableAmount, currency)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{pct}%</span>
                    <span className="min-w-12 text-right text-sm font-medium">
                      {formatDurationShort(row.totalSeconds)}
                    </span>
                  </div>
                );
              })}

              {/* Total row */}
              <div className="mt-2 flex items-center gap-2 border-t pt-2">
                <span className="h-2.5 w-2.5 shrink-0" />
                <span className="min-w-0 flex-1 shrink-0 truncate text-sm font-medium">
                  Total
                </span>
                {showAmount && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatCurrency(
                      sorted.reduce((s, r) => s + r.billableAmount, 0),
                      currency
                    )}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">100%</span>
                <span className="min-w-12 text-right text-sm font-semibold">
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
