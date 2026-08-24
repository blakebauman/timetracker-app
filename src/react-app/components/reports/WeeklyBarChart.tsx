import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
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
import type { WeeklyData, WeeklyDay } from "@/hooks/useReports";

interface WeeklyBarChartProps {
  data: WeeklyData[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/*
 * Billable is a *part* of total, not a sibling of it, so the two used to be
 * drawn as adjacent bars where one was always a subset of the other — and in
 * the brand red plus a stock teal, neither of which meant anything.
 *
 * Stacked, the segments sum to the total (the bar height still reads as "hours
 * that week") and the colour finally encodes something: green is the half you
 * invoice, the muted remainder is the half you don't. Green for billable is the
 * same meaning --success already carries on the KPI strip's billable bar.
 *
 * A stack also survives colour-blindness better than two hue-only bars: the
 * segments are positional and legended, and the two fills are separated on
 * luminance as well as hue (see the --chart-ink-soft note in index.css).
 */
const chartConfig = {
  billable: { label: "Billable", color: "var(--success)" },
  nonBillable: { label: "Non-billable", color: "var(--chart-ink-soft)" },
} satisfies ChartConfig;

function weekRangeLabel(days: WeeklyDay[]): string {
  if (!days.length) return "";
  const first = formatPlainDate(days[0].date, "MMM d");
  const last = formatPlainDate(days[days.length - 1].date, "MMM d");
  return first === last ? first : `${first} – ${last}`;
}

function toHours(seconds: number): number {
  return parseFloat((seconds / 3600).toFixed(2));
}

export function WeeklyBarChart({ data }: WeeklyBarChartProps) {
  const hasData = data.some((w) => w.days.some((d) => d.totalSeconds > 0));
  if (!hasData) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Weekly breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={BarChart3}
            title="No tracked time"
            description="Track time in this range to see it by weekday."
            className="py-12"
          />
        </CardContent>
      </Card>
    );
  }

  const isSingleWeek = data.length === 1;

  // Single week: one bar group per weekday (Sun–Sat, zero-filled).
  // Multi-week: one bar group per week, labeled by date range.
  let chartData: { label: string; billable: number; nonBillable: number }[];
  let title: string;
  let maxBarSize: number;

  if (isSingleWeek) {
    const week = data[0];
    const dayMap = new Map(
      week.days.map((d) => [formatPlainDate(d.date, "EEE"), d])
    );
    chartData = DAY_NAMES.map((name) => {
      const d = dayMap.get(name);
      const total = d ? d.totalSeconds : 0;
      const billable = d ? d.billableSeconds : 0;
      return {
        label: name,
        billable: toHours(billable),
        nonBillable: toHours(Math.max(0, total - billable)),
      };
    });
    title = `Weekly breakdown — ${weekRangeLabel(week.days)}`;
    maxBarSize = 40;
  } else {
    chartData = data.map((w) => {
      const total = w.days.reduce((s, d) => s + d.totalSeconds, 0);
      const billable = w.days.reduce((s, d) => s + d.billableSeconds, 0);
      return {
        label: weekRangeLabel(w.days),
        billable: toHours(billable),
        nonBillable: toHours(Math.max(0, total - billable)),
      };
    });
    title = "Weekly breakdown";
    maxBarSize = 48;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-60 w-full">
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
              tickFormatter={(v: number) => `${v}h`}
            />
            <ChartTooltip
              cursor={{ fill: "var(--accent)" }}
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <>
                      <div
                        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                        style={{ background: `var(--color-${name})` }}
                      />
                      <span className="text-muted-foreground">
                        {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                      </span>
                      <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
                        {formatDurationShort(Number(value) * 3600)}
                      </span>
                    </>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {/* Billable sits at the bottom of the stack: it is the part being
                measured, and a stack reads from the baseline up. */}
            <Bar
              dataKey="billable"
              stackId="hours"
              fill="var(--color-billable)"
              maxBarSize={maxBarSize}
            />
            <Bar
              dataKey="nonBillable"
              stackId="hours"
              fill="var(--color-nonBillable)"
              radius={[3, 3, 0, 0]}
              maxBarSize={maxBarSize}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
