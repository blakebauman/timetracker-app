import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDurationShort, formatPlainDate } from "@/lib/dateUtils";

interface DailyData {
  date: string;
  totalSeconds: number;
  billableSeconds: number;
  entryCount: number;
}

interface DailyBarChartProps {
  data: DailyData[];
  /** The queried range, so days with no entries still get a column. */
  since?: string;
  until?: string;
}

/*
 * The daily query is `GROUP BY date(te.start)`, so a day nobody tracked simply
 * isn't a row. Rendering those rows straight onto a categorical axis drew
 * "Last 7 days" as five bars — Aug 28 then Aug 31 — and the eye reads adjacent
 * columns as adjacent days, so a three-day gap looked like a one-day gap. The
 * axis has to carry every day in the range or it misstates the shape of the
 * week.
 */
function fillRange(data: DailyData[], since?: string, until?: string): DailyData[] {
  if (!since || !until) return data;
  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  const start = new Date(since);
  const end = new Date(until);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return data;
  // A long range would draw more columns than pixels; past that the sparse
  // series is the lesser evil and the label switches to weekday anyway.
  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (span < 0 || span > 92) return data;

  const bySeen = new Map(data.map((d) => [d.date, d]));
  const out: DailyData[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last) {
    const k = key(cursor);
    out.push(
      bySeen.get(k) ?? { date: k, totalSeconds: 0, billableSeconds: 0, entryCount: 0 }
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/*
 * Recharts' default ticks divide the domain into equal fractions, which on a
 * 3h 25m maximum produced "3.4h / 2.55h / 1.7h / 0.85h / 0h" — decimal hours,
 * in an app whose every other duration reads "1h 30m". It only looked correct
 * when the day's maximum happened to land on a whole hour.
 *
 * Snap to durations a timesheet actually uses instead, and let the axis label
 * itself with the same formatter as the rest of the app.
 */
const TICK_STEPS_SECONDS = [
  15 * 60, 30 * 60, 3600, 2 * 3600, 4 * 3600, 8 * 3600, 12 * 3600, 24 * 3600,
];

function niceTicks(maxSeconds: number): number[] {
  if (maxSeconds <= 0) return [0];
  const step =
    TICK_STEPS_SECONDS.find((s) => maxSeconds / s <= 4) ??
    TICK_STEPS_SECONDS[TICK_STEPS_SECONDS.length - 1];
  const top = Math.ceil(maxSeconds / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1; v += step) ticks.push(v / 3600);
  return ticks;
}

/*
 * Same encoding as the weekly chart: the bar height is the day's total, and the
 * split says how much of it you can invoice. One colour language across both
 * charts, and green means the same thing here that it means on the KPI strip's
 * billable bar.
 *
 * These bars used to be painted in the brand red — 500x400px of it, beside a
 * project-coloured donut of the same data. DESIGN.md reserves red for the
 * running state and the primary action, so a wall of red bars made the accent
 * mean nothing while encoding nothing itself.
 */
const chartConfig = {
  billable: { label: "Billable", color: "var(--success)" },
  nonBillable: { label: "Non-billable", color: "var(--chart-ink-soft)" },
} satisfies ChartConfig;

function formatXLabel(dateStr: string, useDayOfWeek: boolean): string {
  return formatPlainDate(dateStr, useDayOfWeek ? "EEE" : "MMM d");
}

export function DailyBarChart({ data, since, until }: DailyBarChartProps) {
  const hasData = data.some((d) => d.totalSeconds > 0);
  if (!hasData) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={BarChart3}
            title="No tracked time"
            description="Track time in this range and your days will chart here."
            className="py-12"
          />
        </CardContent>
      </Card>
    );
  }

  const series = fillRange(data, since, until);
  const useDayOfWeek = series.length > 14;

  const toHours = (seconds: number) => parseFloat((seconds / 3600).toFixed(2));
  const chartData = series.map((d) => ({
    ...d,
    hours: toHours(d.totalSeconds),
    billable: toHours(d.billableSeconds),
    // Derived rather than queried: the stack has to sum to the day's total, and
    // clamping guards against rounding pushing billable past it.
    nonBillable: toHours(Math.max(0, d.totalSeconds - d.billableSeconds)),
    label: formatXLabel(d.date, useDayOfWeek),
  }));

  const avgHours =
    chartData.length > 0
      ? parseFloat(
          (chartData.reduce((s, d) => s + d.hours, 0) / chartData.length).toFixed(2)
        )
      : 0;

  const ticks = niceTicks(Math.max(...chartData.map((d) => d.hours), 0) * 3600);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Daily breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-55 w-full">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              ticks={ticks}
              domain={[0, ticks[ticks.length - 1] ?? 0]}
              tickFormatter={(v: number) =>
                v <= 0 ? "0" : formatDurationShort(Math.round(v * 3600))
              }
            />
            <ChartTooltip
              cursor={{ fill: "var(--accent)" }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    payload?.[0]
                      ? formatPlainDate((payload[0].payload as DailyData).date)
                      : ""
                  }
                  formatter={(value, name, item) => {
                    const d = item.payload as DailyData;
                    const label = name === "billable" ? "Billable" : "Non-billable";
                    return (
                      <div className="flex w-full flex-col gap-0.5">
                        <div className="flex w-full items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                            style={{ background: `var(--color-${name})` }}
                          />
                          <span className="text-muted-foreground">{label}</span>
                          <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
                            {formatDurationShort(Number(value) * 3600)}
                          </span>
                        </div>
                        {/* Only under the last segment, so the day's total and
                            entry count appear once rather than per series. */}
                        {name === "nonBillable" && (
                          <span className="mt-1 border-t pt-1 text-xs text-muted-foreground">
                            {formatDurationShort(d.totalSeconds)} · {d.entryCount}{" "}
                            {d.entryCount === 1 ? "entry" : "entries"}
                          </span>
                        )}
                      </div>
                    );
                  }}
                />
              }
            />
            {avgHours > 0 && (
              /* An unlabelled dashed rule is a quantity the reader has to
                 guess at; it was in no legend and had no caption. */
              <ReferenceLine
                y={avgHours}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 3"
                strokeOpacity={0.6}
                label={{
                  value: `avg ${formatDurationShort(Math.round(avgHours * 3600))}`,
                  position: "insideTopRight",
                  fill: "var(--muted-foreground)",
                  fontSize: 10,
                }}
              />
            )}
            {/* Not optional: --chart-ink-soft sits at 2.23:1 greyscale against
                --success in light mode, so without a legend hue is doing all the
                work and a colour-blind reader has nothing. The weekly chart has
                always had one; this one shipped without, while DESIGN.md §2
                cited "stack position and a legend" as the justification for the
                colour pair. */}
            <ChartLegend content={<ChartLegendContent />} />

            {/* Billable at the baseline: a stack reads from the bottom up, and
                that is the part the day is measured on. */}
            <Bar
              dataKey="billable"
              stackId="hours"
              fill="var(--color-billable)"
              maxBarSize={40}
            />
            <Bar
              dataKey="nonBillable"
              stackId="hours"
              fill="var(--color-nonBillable)"
              radius={[3, 3, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
